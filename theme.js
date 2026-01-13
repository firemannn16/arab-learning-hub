/**
 * Система темы (светлая/тёмная) для арабских тренажеров
 * Подключается на ВСЕ страницы
 */

(function() {
  'use strict';

  const THEME_KEY = 'arabTheme';

  // Применяем тему сразу (до загрузки DOM) чтобы не было мигания
  function applyThemeImmediately() {
    const savedTheme = localStorage.getItem(THEME_KEY);
    if (savedTheme === 'dark') {
      document.documentElement.classList.add('dark-theme');
    }
  }
  
  applyThemeImmediately();

  // Получить текущую тему
  window.getCurrentTheme = function() {
    return localStorage.getItem(THEME_KEY) || 'light';
  };

  // Установить тему
  window.setTheme = function(theme) {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark-theme');
      document.body && document.body.classList.add('dark-theme');
    } else {
      document.documentElement.classList.remove('dark-theme');
      document.body && document.body.classList.remove('dark-theme');
    }
    localStorage.setItem(THEME_KEY, theme);
    
    // Обновляем все переключатели на странице
    updateAllThemeToggles();
    
    // Отправляем событие
    window.dispatchEvent(new CustomEvent('themeChanged', { detail: { theme } }));
  };

  // Переключить тему
  window.toggleTheme = function() {
    const current = getCurrentTheme();
    const newTheme = current === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    return newTheme;
  };

  // Проверить, тёмная ли тема
  window.isDarkTheme = function() {
    return getCurrentTheme() === 'dark';
  };

  // Обновить все переключатели темы на странице
  function updateAllThemeToggles() {
    const isDark = isDarkTheme();
    
    // Обновляем переключатель в сайдбаре
    const sidebarSwitch = document.getElementById('themeSwitch');
    if (sidebarSwitch) {
      sidebarSwitch.classList.toggle('active', isDark);
    }
    
    // Обновляем кнопку на главной
    const mainBtn = document.getElementById('themeToggleBtn');
    if (mainBtn) {
      mainBtn.innerHTML = isDark ? '☀️' : '🌙';
      mainBtn.title = isDark ? 'Светлая тема' : 'Тёмная тема';
    }
  }

  // Применяем тему к body когда DOM готов
  function onDOMReady() {
    const savedTheme = localStorage.getItem(THEME_KEY);
    if (savedTheme === 'dark') {
      document.body.classList.add('dark-theme');
    }
    updateAllThemeToggles();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onDOMReady);
  } else {
    onDOMReady();
  }

  console.log('🎨 Система темы загружена');
})();
