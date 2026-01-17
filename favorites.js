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
      return localStorage.getItem('userProgressCode') || '';
    } catch (e) {
      return '';
    }
  }

  function canUseFirebase() {
    return !!(window.firebaseEnabled && window.firestore && getUserCode());
  }

  function getFavoritesDocRef() {
    if (!canUseFirebase()) return null;
    const code = getUserCode();
    return window.firestore
      .collection('users')
      .doc(code)
      .collection('favorites')
      .doc('data');
  }

  // Кешируем localStorage, чтобы не парсить его на каждый элемент списка
  let favoritesCache = null;
  let favoritesNormalizedCache = null;
  let bootstrapDone = false;
  let syncTimer = null;
  let syncInProgress = false;

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

  // Сохранить избранные
  function saveFavorites(favorites, { skipSync = false } = {}) {
    updateCaches(favorites);
    try {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(favoritesCache));
      localStorage.setItem(FAVORITES_TS_KEY, Date.now().toString());
    } catch (e) {
      console.warn('Ошибка сохранения избранного:', e);
    }
    if (!skipSync) scheduleSyncToFirebase();
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
    const arabicNorm = stripHarakat(arabicText).toLowerCase();
    return favoritesCache.some(f => {
      const parts = parseWordLine(f);
      return parts && stripHarakat(parts.ar).toLowerCase() === arabicNorm;
    });
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
    
    window.dispatchEvent(new CustomEvent('favoritesChanged', { detail: { action: 'add', word: wordStr } }));
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
    window.dispatchEvent(new CustomEvent('favoritesChanged', { detail: { action: 'remove', word } }));
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
    const ref = getFavoritesDocRef();
    if (!ref) return null;
    const snap = await ref.get();
    if (!snap.exists) return null;
    const data = snap.data() || {};
    const items = Array.isArray(data.items) ? data.items : [];
    const updatedAt = data.updatedAt && typeof data.updatedAt.toMillis === 'function'
      ? data.updatedAt.toMillis()
      : 0;
    return { items, updatedAt };
  }

  async function writeFavoritesToFirebase(items) {
    const ref = getFavoritesDocRef();
    if (!ref) return;
    await ref.set({
      items,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
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
    if (bootstrapDone) return;
    if (!canUseFirebase()) return;
    try {
      const localItems = getFavorites();
      const localTs = getLocalTimestamp();
      const remote = await loadFavoritesFromFirebase();
      const remoteItems = remote ? remote.items : [];
      const remoteTs = remote ? remote.updatedAt || 0 : 0;

      if (remote && remoteTs > localTs) {
        // Берём облако, записываем локально без триггера sync
        saveFavorites(remoteItems, { skipSync: true });
      } else {
        // Локальные свежее или только локальные — отправим в облако
        if (localItems.length > 0) {
          await writeFavoritesToFirebase(localItems);
        }
      }
    } catch (e) {
      console.warn('Не удалось синхронизировать избранное с Firebase:', e);
    } finally {
      bootstrapDone = true;
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

  window.addEventListener('firebaseReady', bootstrapFirebaseSync);
  window.addEventListener('online', () => {
    // при появлении сети — пробуем синкнуть, если есть что
    if (canUseFirebase()) scheduleSyncToFirebase();
  });
  // Если Firebase уже доступен на момент загрузки
  if (window.firebaseEnabled && window.firestore) {
    bootstrapFirebaseSync();
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
      const wordsByArabic = new Map();
      wordsLines.forEach(line => {
        const parts = parseWordLine(line);
        if (parts) {
          const arabicKey = stripHarakat(parts.ar).toLowerCase();
          wordsByArabic.set(arabicKey, line);
        }
      });
      
      const favorites = getFavorites();
      const newFavorites = [];
      let removed = 0;
      let updated = 0;
      
      favorites.forEach(favLine => {
        const parts = parseWordLine(favLine);
        if (!parts) {
          // Невалидная строка — удаляем
          removed++;
          return;
        }
        
        const arabicKey = stripHarakat(parts.ar).toLowerCase();
        const currentWord = wordsByArabic.get(arabicKey);
        
        if (!currentWord) {
          // Слово удалено из words.txt — удаляем из избранного
          removed++;
          console.log('⭐ Удалено из избранного (нет в words.txt):', favLine);
        } else if (normalizeWord(currentWord) !== normalizeWord(favLine)) {
          // Слово изменилось — обновляем в избранном
          newFavorites.push(currentWord);
          updated++;
          console.log('⭐ Обновлено в избранном:', favLine, '→', currentWord);
        } else {
          // Слово не изменилось — оставляем
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
