/**
 * Система избранного для арабских тренажеров
 * Хранит избранные слова в localStorage
 * Синхронизируется с words.txt при загрузке
 */

(function() {
  'use strict';

  const FAVORITES_KEY = 'arabFavorites';
  const SYNC_KEY = 'arabFavoritesSyncTime';
  const FAVORITES_TS_KEY = 'arabFavoritesUpdatedAt';

  // Firebase doc path: users/{code}/favorites/data
  function getUserCode() {
    try {
      if (window.auth && window.auth.isLoggedIn && window.auth.isLoggedIn()) {
        return window.auth.getUserId();
      }
      return localStorage.getItem('userProgressCode') || '';
    } catch (e) {
      return '';
    }
  }

  function canUseFirebase() {
    return !!(window.firebaseEnabled && window.firestore && getUserCode());
  }

  // Универсальный доступ к Firestore (compat или modular)
  function getFirebaseContext() {
    if (!canUseFirebase()) return null;
    const code = getUserCode();
    const firestore = window.firestore;
    const fm = window.firebaseModules || {};

    // Compat API (firebase.firestore.*)
    if (firestore && typeof firestore.collection === 'function') {
      return {
        mode: 'compat',
        ref: firestore
          .collection('users')
          .doc(code)
          .collection('favorites')
          .doc('data'),
        serverTimestamp: (firebase && firebase.firestore && firebase.firestore.FieldValue
          && firebase.firestore.FieldValue.serverTimestamp)
          ? firebase.firestore.FieldValue.serverTimestamp()
          : new Date() // Fallback, в редком случае без FieldValue
      };
    }

    // Modular API (initializeFirestore + doc/getDoc/setDoc)
    if (fm.doc && fm.getDoc && fm.setDoc) {
      // Подготовим serverTimestamp: берём готовый, либо Timestamp.now как fallback, либо число
      const serverTimestampFn = fm.serverTimestamp
        ? fm.serverTimestamp
        : (fm.Timestamp && typeof fm.Timestamp.now === 'function')
          ? fm.Timestamp.now
          : (() => Date.now());

      return {
        mode: 'modular',
        ref: fm.doc(firestore, 'users', code, 'favorites', 'data'),
        getDoc: fm.getDoc,
        setDoc: fm.setDoc,
        serverTimestamp: serverTimestampFn
      };
    }

    return null;
  }

  // Кешируем localStorage, чтобы не парсить его на каждый элемент списка
  let favoritesCache = null;
  let favoritesNormalizedCache = null;
  let bootstrapDone = false;
  let syncTimer = null;
  let syncInProgress = false;
  let snapListener = null;
  let snapSkipNext = false;
  let listenerGen = 0;

  function ensureCacheLoaded() {
    if (favoritesCache !== null && favoritesNormalizedCache !== null) return;
    try {
      const data = localStorage.getItem(FAVORITES_KEY);
      favoritesCache = data ? JSON.parse(data) : [];
    } catch (e) {
      console.warn('Ошибка чтения избранного:', e);
      favoritesCache = [];
    }
    favoritesNormalizedCache = new Set(favoritesCache.map(normalizeWord));
  }

  function updateCaches(list) {
    favoritesCache = Array.isArray(list) ? [...list] : [];
    favoritesNormalizedCache = new Set(favoritesCache.map(normalizeWord));
  }

  // Получить все избранные слова
  window.getFavorites = function() {
    ensureCacheLoaded();
    return [...favoritesCache];
  };

  // Сохранить избранные (с защитой от лишних записей)
  function saveFavorites(favorites, { skipSync = false } = {}) {
    const newRaw = JSON.stringify(favorites);
    const currentRaw = localStorage.getItem(FAVORITES_KEY);
    if (currentRaw === newRaw) return;  // Не изменилось — не пишем
    updateCaches(favorites);
    try {
      localStorage.setItem(FAVORITES_KEY, newRaw);
      localStorage.setItem(FAVORITES_TS_KEY, Date.now().toString());
    } catch (e) {
      console.warn('Ошибка сохранения избранного:', e);
    }
    window.dispatchEvent(new CustomEvent('favoritesChanged', { detail: { action: 'sync' } }));
    if (!skipSync) {
      // Direct write to Firebase (no debounce)
      doFirebaseWrite(favorites);
    }
  }

  async function doFirebaseWrite(items) {
    const ctx = getFirebaseContext();
    if (!ctx) { console.log('⭐ Нет контекста для записи'); return; }
    try {
      snapSkipNext = true;
      console.log('⭐ Пишу в Firebase:', items.length, 'слов, путь:', ctx.mode);
      if (ctx.mode === 'compat') {
        await ctx.ref.set({ items, updatedAt: ctx.serverTimestamp }, { merge: true });
        console.log('⭐ Запись успешна');
      } else if (ctx.setDoc) {
        await ctx.setDoc(ctx.ref, { items, updatedAt: ctx.serverTimestamp() }, { merge: true });
        console.log('⭐ Запись успешна (modular)');
      }
    } catch(e) {
      console.warn('⭐ Ошибка записи в Firebase:', e);
    }
  }

  // Проверить, есть ли слово в избранном
  window.isFavorite = function(word) {
    ensureCacheLoaded();
    const key = normalizeWord(word);
    return key ? favoritesNormalizedCache.has(key) : false;
  };

  // Проверить по арабскому тексту (для синхронизации)
  function isFavoriteByArabic(arabicText) {
    ensureCacheLoaded();
    const arabicExact = String(arabicText || '').toLowerCase();

    // Сначала ищем точное совпадение (с огласовками)
    const exactMatch = favoritesCache.some(f => {
      const parts = parseWordLine(f);
      return parts && parts.ar.toLowerCase() === arabicExact;
    });
    if (exactMatch) return true;

    // Фоллбэк: без огласовок, но только если совпадение однозначное
    const arabicStripped = stripHarakat(arabicText).toLowerCase();
    const strippedMatches = favoritesCache.filter(f => {
      const parts = parseWordLine(f);
      return parts && stripHarakat(parts.ar).toLowerCase() === arabicStripped;
    });
    return strippedMatches.length === 1;
  }
  // Экспортируем для тренажеров, чтобы проверять любимое слово даже при минимальных расхождениях в RU части
  window.isFavoriteByArabic = isFavoriteByArabic;

  // Добавить слово в избранное
  window.addToFavorites = function(word) {
    ensureCacheLoaded();
    const key = normalizeWord(word);
    
    if (!key || favoritesNormalizedCache.has(key)) {
      return false;
    }
    
    const wordStr = typeof word === 'string' ? word : `${word.ru} - ${word.ar}`;
    const updated = [...favoritesCache, wordStr];
    saveFavorites(updated);
    return true;
  };

  // Удалить слово из избранного
  window.removeFromFavorites = function(word) {
    ensureCacheLoaded();
    const key = normalizeWord(word);
    if (!key) return false;
    
    const newFavorites = favoritesCache.filter(f => normalizeWord(f) !== key);
    
    if (newFavorites.length === favoritesCache.length) {
      return false;
    }
    
    saveFavorites(newFavorites);
    return true;
  };

  // Переключить избранное
  window.toggleFavorite = function(word) {
    if (isFavorite(word)) {
      removeFromFavorites(word);
      return false;
    } else {
      addToFavorites(word);
      return true;
    }
  };

  // Нормализовать слово для сравнения
  function normalizeWord(word) {
    let s = '';
    if (typeof word === 'string') {
      s = word;
    } else if (word && word.ru && word.ar) {
      s = `${word.ru} - ${word.ar}`;
    } else {
      return '';
    }
    // Приводим тире к единому виду и нормализуем пробелы
    s = s.replace(/^\uFEFF/, '')
         .replace(/[\u2010-\u2015–—−]/g, '-')
         .replace(/\s*-\s*/g, ' - ')
         .trim()
         .toLowerCase()
         .replace(/\s+/g, ' ');
    return s;
  }

  // Убрать огласовки из арабского текста
  function stripHarakat(text) {
    return String(text || '').replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7-\u06E8\u06EA-\u06ED]/g, '');
  }

  // Парсинг строки слова
  function parseWordLine(line) {
    if (!line || typeof line !== 'string') return null;
    const sep = line.search(/[-–—]/);
    if (sep === -1) return null;
    return {
      ru: line.slice(0, sep).trim(),
      ar: line.slice(sep + 1).trim()
    };
  }

  // Получить избранные в формате для тренажера
  window.getFavoritesAsText = function() {
    return getFavorites().join('\n');
  };

  // Количество избранных
  window.getFavoritesCount = function() {
    return getFavorites().length;
  };

  // Сбрасываем кеш, если localStorage изменили в другой вкладке
  window.addEventListener('storage', (ev) => {
    if (ev.key === FAVORITES_KEY || ev.key === null) {
      favoritesCache = null;
      favoritesNormalizedCache = null;
    }
  });

  function getLocalTimestamp() {
    const ts = Number(localStorage.getItem(FAVORITES_TS_KEY) || '0');
    return Number.isFinite(ts) ? ts : 0;
  }

  async function loadFavoritesFromFirebase() {
    const ctx = getFirebaseContext();
    if (!ctx) return null;

    let data = null;
    if (ctx.mode === 'compat') {
      const snap = await ctx.ref.get();
      if (!snap.exists) return null;
      data = snap.data() || {};
    } else {
      const snap = await ctx.getDoc(ctx.ref);
      if (!snap.exists()) return null;
      data = snap.data() || {};
    }

    const items = Array.isArray(data.items) ? data.items : [];
    const rawTs = data.updatedAt;
    const updatedAt = rawTs && typeof rawTs.toMillis === 'function'
      ? rawTs.toMillis()
      : (Number.isFinite(rawTs) ? rawTs : 0);
    return { items, updatedAt };
  }

  async function writeFavoritesToFirebase(items) {
    const ctx = getFirebaseContext();
    if (!ctx) { console.log('⭐ writeFavorites: нет контекста'); return; }
    const code = getUserCode();
    console.log('⭐ writeFavorites:', items.length, 'слов, code:', code, 'mode:', ctx.mode);
    console.trace('⭐ writeFavorites stack');

    snapSkipNext = true;  // Don't react to our own write

    if (ctx.mode === 'compat') {
      await ctx.ref.set({
        items,
        updatedAt: ctx.serverTimestamp
      }, { merge: true });
      console.log('⭐ writeFavorites успешно');
      return;
    }

    await ctx.setDoc(ctx.ref, {
      items,
      updatedAt: ctx.serverTimestamp()
    }, { merge: true });
    console.log('⭐ writeFavorites успешно (modular)');
  }

  function mergeFavorites(localItems, remoteItems) {
    // Уникальные элементы, сохраняем порядок: сначала локальные, потом удалённые из локали не добавляются
    const set = new Set();
    const merged = [];
    localItems.forEach(item => {
      const norm = normalizeWord(item);
      if (!set.has(norm)) {
        set.add(norm);
        merged.push(item);
      }
    });
    remoteItems.forEach(item => {
      const norm = normalizeWord(item);
      if (!set.has(norm)) {
        set.add(norm);
        merged.push(item);
      }
    });
    return merged;
  }

  async function bootstrapFirebaseSync() {
    if (bootstrapDone) { console.log('⭐ bootstrap: уже выполнена'); return; }
    if (!canUseFirebase()) { console.log('⭐ bootstrap: нет Firebase'); return; }
    try {
      const localItems = getFavorites();
      const localTs = getLocalTimestamp();
      const code = getUserCode();
      console.log('⭐ bootstrap: локально', localItems.length, 'слов, code:', code);
      const remote = await loadFavoritesFromFirebase();
      const remoteItems = remote ? remote.items : [];
      const remoteTs = remote ? remote.updatedAt || 0 : 0;
      console.log('⭐ bootstrap: облако', remoteItems.length, 'слов, localTs:', localTs, 'remoteTs:', remoteTs);

      if (remote && remoteTs > localTs) {
        console.log('⭐ bootstrap: облако новее, берём его');
        saveFavorites(remoteItems, { skipSync: true });
      } else {
        console.log('⭐ bootstrap: локальное новее или только локальное, пишем в облако');
        if (localItems.length > 0) {
          await writeFavoritesToFirebase(localItems);
        }
      }
    } catch (e) {
      console.warn('Не удалось синхронизировать избранное с Firebase:', e);
    } finally {
      bootstrapDone = true;
      console.log('⭐ bootstrap: завершена, code:', getUserCode());
    }
  }

  async function syncToFirebase() {
    if (syncInProgress || !canUseFirebase()) return;
    syncInProgress = true;
    try {
      const items = getFavorites();
      await writeFavoritesToFirebase(items);
    } catch (e) {
      console.warn('Ошибка записи избранного в Firebase:', e);
    } finally {
      syncInProgress = false;
    }
  }

  function scheduleSyncToFirebase() {
    if (!canUseFirebase()) return;
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(syncToFirebase, 800);
  }

  // ===== REALTIME SNAPSHOT LISTENER =====
  function startFavoritesListener() {
    stopFavoritesListener();
    const ctx = getFirebaseContext();
    if (!ctx) return;
    const gen = ++listenerGen;
    try {
      if (ctx.mode === 'compat') {
        snapListener = ctx.ref.onSnapshot((snap) => {
          if (gen !== listenerGen) return; // stale callback from old listener
          if (snapSkipNext) { snapSkipNext = false; return; }
          if (snap.exists) {
            const data = snap.data();
            if (data && Array.isArray(data.items)) {
              const current = getFavorites();
              if (JSON.stringify(current) !== JSON.stringify(data.items)) {
                saveFavorites(data.items, { skipSync: true });
                console.log('⭐ Realtime: избранное обновлено (', data.items.length, 'слов)');
              }
            }
          }
        }, (err) => {
          console.warn('⭐ Realtime listener error:', err);
          // Auto-restart on failure
          setTimeout(startFavoritesListener, 5000);
        });
        console.log('⭐ Realtime listener запущен');
      }
    } catch(e) {
      console.warn('⭐ Realtime listener start error:', e);
    }
  }

  function stopFavoritesListener() {
    if (snapListener) {
      try { snapListener(); } catch(e) {}
      snapListener = null;
    }
  }

  // Wire up listeners
  window.addEventListener('firebaseReady', () => {
    bootstrapFirebaseSync();
    startFavoritesListener();
  });

  window.addEventListener('online', () => {
    if (canUseFirebase()) scheduleSyncToFirebase();
  });

  // On auth change: restart listener + force sync
  window.addEventListener('authChanged', async () => {
    stopFavoritesListener();
    bootstrapDone = false;
    if (!canUseFirebase()) return;
    try {
      let remote = await loadFavoritesFromFirebase();
      let gotFromFallback = false;

      const authUid = window.authUser?.uid;
      console.log('⭐ authChanged: remote=', remote?.items?.length, 'слов, uid=', authUid, 'code=', getUserCode());
      if (!remote || !remote.items || !remote.items.length) {
        console.log('⭐ authChanged: uid пуст, проверяем fallback');
        try {
          const oldCode = localStorage.getItem('userProgressCode');
          if (window.firestore && typeof window.firestore.collection === 'function') {
            let fallbackCode = oldCode;
            if (authUid) {
              try {
                const metaSnap = await window.firestore.collection('users').doc(authUid).collection('favorites').doc('migration').get();
                if (metaSnap.exists && metaSnap.data().migratedFrom) {
                  fallbackCode = metaSnap.data().migratedFrom;
                }
              } catch(e3) {}
            }
            if (fallbackCode && fallbackCode !== authUid) {
              console.log('⭐ authChanged: читаем fallback из', fallbackCode);
              const oldSnap = await window.firestore.collection('users').doc(fallbackCode).collection('favorites').doc('data').get();
              if (oldSnap.exists) {
                const data = oldSnap.data();
                if (data.items && data.items.length > 0) {
                  console.log('⭐ authChanged: fallback содержит', data.items.length, 'слов');
                  remote = { items: data.items, updatedAt: data.updatedAt };
                  gotFromFallback = true;
                  await writeFavoritesToFirebase(data.items);
                  console.log('⭐ Миграция из', fallbackCode, 'в uid:', data.items.length, 'слов');
                }
              }
            }
          }
        } catch(e2) { console.warn('⭐ Fallback error:', e2); }
      } else {
        console.log('⭐ authChanged: uid не пуст, fallback пропущен');
      }

      const localItems = getFavorites();
      if (remote && remote.items && remote.items.length > 0) {
        saveFavorites(remote.items, { skipSync: true });
        console.log('⭐ Избранное загружено из облака:', remote.items.length, 'слов', gotFromFallback ? '(из deviceCode)' : '');
      } else if (localItems.length > 0) {
        await writeFavoritesToFirebase(localItems);
        console.log('⭐ Избранное отправлено в облако:', localItems.length, 'слов');
      }
    } catch(e) {
      console.warn('⭐ Ошибка форс-синка избранного:', e);
    }
    bootstrapDone = true;
    startFavoritesListener();
  });

  if (window.firebaseEnabled && window.firestore) {
    bootstrapFirebaseSync();
    startFavoritesListener();
  }

  /**
   * Синхронизация избранного с words.txt
   * - Удалённые слова удаляются из избранного
   * - Изменённые слова обновляются (остаются в избранном)
   */
  window.syncFavoritesWithWords = async function() {
    try {
      const beforeList = getFavorites();
      
      // Если локально пусто — не трогаем и не очищаем (защита от раннего старта)
      if (beforeList.length === 0) {
        return { synced: true, skipped: true };
      }
      
      const response = await fetch('words.txt');
      if (!response.ok) {
        return { synced: false, error: 'Не удалось загрузить words.txt' };
      }
      
      const text = await response.text();
      const wordsLines = text.split('\n')
        .map(l => l.trim())
        .filter(l => l && !l.startsWith('#'));
      
      if (wordsLines.length === 0) {
        return { synced: false, error: 'Пустой words.txt' };
      }
      
      // Создаём карту слов по арабскому тексту (без огласовок)
      // Нормализуем тире, чтобы em dash (—) и обычный дефис (-) считались одинаковыми
      function normalizeDashes(s) {
        return s.replace(/[\u2010-\u2015\u2013\u2014\u2212\u002D]/g, '-');
      }
      // Храним массивы — несколько слов могут иметь одинаковый арабский без огласовок
      const wordsByArabic = new Map();
      wordsLines.forEach(line => {
        const parts = parseWordLine(line);
        if (parts) {
          const arabicKey = normalizeDashes(stripHarakat(parts.ar)).toLowerCase();
          const arr = wordsByArabic.get(arabicKey) || [];
          arr.push(line);
          wordsByArabic.set(arabicKey, arr);
        }
      });
      
      const favorites = getFavorites();
      const newFavorites = [];
      let removed = 0;
      let updated = 0;
      
      favorites.forEach(favLine => {
        const parts = parseWordLine(favLine);
        if (!parts) {
          removed++;
          return;
        }
        
        const arabicKey = normalizeDashes(stripHarakat(parts.ar)).toLowerCase();
        const candidates = wordsByArabic.get(arabicKey);
        
        if (!candidates || candidates.length === 0) {
          removed++;
          console.log('⭐ Удалено из избранного (нет в words.txt):', favLine);
          return;
        }
        
        // Ищем лучшее совпадение среди кандидатов
        // 1) Точное совпадение (всей строки)
        let currentWord = candidates.find(c => normalizeWord(c) === normalizeWord(favLine));
        
        if (!currentWord) {
          // 2) По русской части (если перевод не менялся)
          const favRu = parts.ru.toLowerCase().replace(/\s+/g, ' ').trim();
          currentWord = candidates.find(c => {
            const cp = parseWordLine(c);
            return cp && cp.ru.toLowerCase().replace(/\s+/g, ' ').trim() === favRu;
          });
        }
        
        if (!currentWord && candidates.length === 1) {
          // 3) Единственный кандидат — безопасно использовать
          currentWord = candidates[0];
        }
        
        if (!currentWord) {
          removed++;
          console.log('⭐ Удалено из избранного (неоднозначное совпадение):', favLine);
          return;
        }
        
        if (normalizeWord(currentWord) !== normalizeWord(favLine)) {
          newFavorites.push(currentWord);
          updated++;
          console.log('⭐ Обновлено в избранном:', favLine, '→', currentWord);
        } else {
          newFavorites.push(favLine);
        }
      });
      
      if (removed > 0 || updated > 0) {
        saveFavorites(newFavorites);
        localStorage.setItem(SYNC_KEY, Date.now().toString());
        window.dispatchEvent(new CustomEvent('favoritesChanged', { detail: { action: 'sync', removed, updated } }));
        console.log(`⭐ Синхронизация избранного: удалено ${removed}, обновлено ${updated}`);
      }
      
      return { synced: true, removed, updated };
    } catch (e) {
      console.warn('Ошибка синхронизации избранного:', e);
      return { synced: false, error: e.message };
    }
  };

  // Автоматическая синхронизация при каждом открытии/перезагрузке страницы
  function autoSync() {
    syncFavoritesWithWords();
  }

  // Запускаем автосинхронизацию после загрузки DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoSync);
  } else {
    setTimeout(autoSync, 1000);
  }

  console.log('⭐ Система избранного загружена');
})();
