/**
 * Система избранного для арабских тренажеров
 * Хранит избранные слова в localStorage
 */

(function() {
  'use strict';

  const FAVORITES_KEY = 'arabFavorites';

  // Получить все избранные слова
  window.getFavorites = function() {
    try {
      const data = localStorage.getItem(FAVORITES_KEY);
      return data ? JSON.parse(data) : [];
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
  // word - строка в формате "русский - арабский" или объект {ru, ar}
  window.isFavorite = function(word) {
    const favorites = getFavorites();
    const key = normalizeWord(word);
    return favorites.some(f => normalizeWord(f) === key);
  };

  // Добавить слово в избранное
  window.addToFavorites = function(word) {
    const favorites = getFavorites();
    const key = normalizeWord(word);
    
    // Проверяем, нет ли уже
    if (favorites.some(f => normalizeWord(f) === key)) {
      return false; // Уже есть
    }
    
    // Добавляем как строку
    const wordStr = typeof word === 'string' ? word : `${word.ru} - ${word.ar}`;
    favorites.push(wordStr);
    saveFavorites(favorites);
    
    // Отправляем событие
    window.dispatchEvent(new CustomEvent('favoritesChanged', { detail: { action: 'add', word: wordStr } }));
    
    return true;
  };

  // Удалить слово из избранного
  window.removeFromFavorites = function(word) {
    const favorites = getFavorites();
    const key = normalizeWord(word);
    
    const newFavorites = favorites.filter(f => normalizeWord(f) !== key);
    
    if (newFavorites.length === favorites.length) {
      return false; // Не было в списке
    }
    
    saveFavorites(newFavorites);
    
    // Отправляем событие
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
    if (typeof word === 'string') {
      return word.trim().toLowerCase().replace(/\s+/g, ' ');
    }
    if (word && word.ru && word.ar) {
      return `${word.ru} - ${word.ar}`.trim().toLowerCase().replace(/\s+/g, ' ');
    }
    return '';
  }

  // Получить избранные в формате для тренажера (массив строк)
  window.getFavoritesAsText = function() {
    return getFavorites().join('\n');
  };

  // Количество избранных
  window.getFavoritesCount = function() {
    return getFavorites().length;
  };

  console.log('⭐ Система избранного загружена');
})();
