/**
 * Система избранного для арабских тренажеров
 * Хранит избранные слова в localStorage
 * Синхронизируется с words.txt при загрузке
 */

(function() {
  'use strict';

  const FAVORITES_KEY = 'arabFavorites';
  const SYNC_KEY = 'arabFavoritesSyncTime';
  let debugFavLogCount = 0;

  // Получить все избранные слова
  window.getFavorites = function() {
    try {
      const data = localStorage.getItem(FAVORITES_KEY);
      const list = data ? JSON.parse(data) : [];
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/e7518b9b-0bc4-47f9-8853-bc30adaf2cee',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre2',hypothesisId:'H4',location:'favorites.js:getFavorites',message:'read favorites',data:{count:list.length},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      return list;
    } catch (e) {
      console.warn('Ошибка чтения избранного:', e);
      return [];
    }
  };

  // Сохранить избранные
  function saveFavorites(favorites) {
    try {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
    } catch (e) {
      console.warn('Ошибка сохранения избранного:', e);
    }
  }

  // Проверить, есть ли слово в избранном
  window.isFavorite = function(word) {
    const favorites = getFavorites();
    const key = normalizeWord(word);
    const result = favorites.some(f => normalizeWord(f) === key);
    if (debugFavLogCount < 10) {
      const sample = favorites.slice(0, 5).map(f => normalizeWord(f));
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/e7518b9b-0bc4-47f9-8853-bc30adaf2cee',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre3',hypothesisId:'H6',location:'favorites.js:isFavorite',message:'isFavorite check',data:{key,result,count:favorites.length,sampleNormalized:sample},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      debugFavLogCount++;
    }
    return result;
  };

  // Проверить по арабскому тексту (для синхронизации)
  function isFavoriteByArabic(arabicText) {
    const favorites = getFavorites();
    const arabicNorm = stripHarakat(arabicText).toLowerCase();
    return favorites.some(f => {
      const parts = parseWordLine(f);
      return parts && stripHarakat(parts.ar).toLowerCase() === arabicNorm;
    });
  }

  // Добавить слово в избранное
  window.addToFavorites = function(word) {
    const favorites = getFavorites();
    const key = normalizeWord(word);
    
    if (favorites.some(f => normalizeWord(f) === key)) {
      return false;
    }
    
    const wordStr = typeof word === 'string' ? word : `${word.ru} - ${word.ar}`;
    favorites.push(wordStr);
    saveFavorites(favorites);
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/e7518b9b-0bc4-47f9-8853-bc30adaf2cee',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre2',hypothesisId:'H4',location:'favorites.js:addToFavorites',message:'added favorite',data:{word:wordStr,count:favorites.length},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    
    window.dispatchEvent(new CustomEvent('favoritesChanged', { detail: { action: 'add', word: wordStr } }));
    return true;
  };

  // Удалить слово из избранного
  window.removeFromFavorites = function(word) {
    const favorites = getFavorites();
    const key = normalizeWord(word);
    
    const newFavorites = favorites.filter(f => normalizeWord(f) !== key);
    
    if (newFavorites.length === favorites.length) {
      return false;
    }
    
    saveFavorites(newFavorites);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/e7518b9b-0bc4-47f9-8853-bc30adaf2cee',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre2',hypothesisId:'H4',location:'favorites.js:removeFromFavorites',message:'removed favorite',data:{word,prevCount:favorites.length,newCount:newFavorites.length},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    window.dispatchEvent(new CustomEvent('favoritesChanged', { detail: { action: 'remove', word } }));
    return true;
  };

  // Переключить избранное
  window.toggleFavorite = function(word) {
    if (isFavorite(word)) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/e7518b9b-0bc4-47f9-8853-bc30adaf2cee',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre3',hypothesisId:'H6',location:'favorites.js:toggleFavorite',message:'remove favorite',data:{word},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      removeFromFavorites(word);
      return false;
    } else {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/e7518b9b-0bc4-47f9-8853-bc30adaf2cee',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre3',hypothesisId:'H6',location:'favorites.js:toggleFavorite',message:'add favorite',data:{word},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
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

  /**
   * Синхронизация избранного с words.txt
   * - Удалённые слова удаляются из избранного
   * - Изменённые слова обновляются (остаются в избранном)
   */
  window.syncFavoritesWithWords = async function() {
    try {
      const beforeList = getFavorites();
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/e7518b9b-0bc4-47f9-8853-bc30adaf2cee',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre2',hypothesisId:'H4',location:'favorites.js:syncFavoritesWithWords',message:'sync start',data:{beforeCount:beforeList.length},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      
      const response = await fetch('words.txt');
      if (!response.ok) return { synced: false, error: 'Не удалось загрузить words.txt' };
      
      const text = await response.text();
      const rawLines = text.split('\n');
      const wordsLines = text.split('\n')
        .map(l => l.trim())
        .filter(l => l && !l.startsWith('#'));
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/e7518b9b-0bc4-47f9-8853-bc30adaf2cee',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre3',hypothesisId:'H6',location:'favorites.js:syncFavoritesWithWords',message:'words parsed',data:{rawCount:rawLines.length,cleanCount:wordsLines.length,sample:wordsLines.slice(0,3)},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      
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
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/e7518b9b-0bc4-47f9-8853-bc30adaf2cee',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre2',hypothesisId:'H3',location:'favorites.js:syncFavoritesWithWords',message:'syncFavorites summary',data:{removed,updated,finalCount:newFavorites.length,beforeCount:beforeList.length},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      
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
