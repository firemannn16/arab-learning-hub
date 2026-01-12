/**
 * Боковое навигационное меню (Sidebar)
 * Открывается по кнопке-гамбургеру или свайпом слева направо
 * Закрывается по клику на затемнённую область, свайпом влево или при переходе
 */

(function() {
  'use strict';

  // Определяем текущую страницу
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';

  // Пункты меню
  const menuItems = [
    { name: 'Главная', href: 'index.html', icon: '🏠' },
    { name: 'Тренажер Тетрадь', href: 'phases.html', icon: '📊' },
    { name: 'Словарь', href: 'dictionary.html', icon: '📚' },
    { name: 'Пустой Тренажер', href: 'simple.html', icon: '📝' },
    { name: 'Тренажер Заучка + Практика', href: 'input.html', icon: '🍕' },
    { name: 'Тренажер Выборка', href: 'choice.html', icon: '✅' }
  ];

  // CSS стили для меню
  const styles = `
    /* Кнопка-гамбургер */
    .sidebar-toggle {
      position: fixed;
      top: 16px;
      left: 16px;
      z-index: 1000;
      width: 44px;
      height: 44px;
      border: none;
      border-radius: 12px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
      cursor: pointer;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 5px;
      transition: all 0.3s ease;
    }

    .sidebar-toggle:hover {
      transform: scale(1.05);
      box-shadow: 0 6px 20px rgba(102, 126, 234, 0.5);
    }

    .sidebar-toggle:active {
      transform: scale(0.95);
    }

    .sidebar-toggle span {
      display: block;
      width: 22px;
      height: 2.5px;
      background: white;
      border-radius: 2px;
      transition: all 0.3s ease;
    }

    .sidebar-toggle.active span:nth-child(1) {
      transform: rotate(45deg) translate(5px, 5px);
    }

    .sidebar-toggle.active span:nth-child(2) {
      opacity: 0;
    }

    .sidebar-toggle.active span:nth-child(3) {
      transform: rotate(-45deg) translate(5px, -5px);
    }

    /* Затемнённый фон */
    .sidebar-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      z-index: 1001;
      opacity: 0;
      visibility: hidden;
      transition: all 0.3s ease;
      backdrop-filter: blur(2px);
    }

    .sidebar-overlay.active {
      opacity: 1;
      visibility: visible;
    }

    /* Боковое меню */
    .sidebar-menu {
      position: fixed;
      top: 0;
      left: 0;
      width: 280px;
      max-width: 85vw;
      height: 100%;
      background: #ffffff;
      z-index: 1002;
      transform: translateX(-100%);
      transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      box-shadow: 4px 0 25px rgba(0, 0, 0, 0.15);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .sidebar-menu.active {
      transform: translateX(0);
    }

    /* Шапка меню */
    .sidebar-header {
      padding: 24px 20px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }

    .sidebar-header h2 {
      margin: 0;
      font-size: 20px;
      font-weight: 700;
      letter-spacing: -0.5px;
    }

    .sidebar-header p {
      margin: 6px 0 0 0;
      font-size: 13px;
      opacity: 0.85;
    }

    /* Список пунктов меню */
    .sidebar-nav {
      flex: 1;
      overflow-y: auto;
      padding: 12px 0;
    }

    .sidebar-nav-item {
      display: flex;
      align-items: center;
      padding: 14px 20px;
      text-decoration: none;
      color: #1f2937;
      font-size: 15px;
      font-weight: 500;
      transition: all 0.2s ease;
      border-left: 3px solid transparent;
      gap: 14px;
    }

    .sidebar-nav-item:hover {
      background: #f3f4f6;
      border-left-color: #667eea;
    }

    .sidebar-nav-item.active {
      background: linear-gradient(90deg, rgba(102, 126, 234, 0.1) 0%, rgba(118, 75, 162, 0.05) 100%);
      border-left-color: #667eea;
      color: #667eea;
      font-weight: 600;
    }

    .sidebar-nav-icon {
      font-size: 20px;
      width: 28px;
      text-align: center;
      flex-shrink: 0;
    }

    .sidebar-nav-text {
      flex: 1;
    }

    /* Футер меню */
    .sidebar-footer {
      padding: 16px 20px;
      border-top: 1px solid #e5e7eb;
      font-size: 12px;
      color: #9ca3af;
      text-align: center;
    }

    /* Адаптация отступа для контента страницы */
    body.sidebar-enabled {
      padding-top: 70px !important;
    }

    /* Мобильные стили */
    @media (max-width: 480px) {
      .sidebar-toggle {
        top: 12px;
        left: 12px;
        width: 40px;
        height: 40px;
      }

      .sidebar-toggle span {
        width: 20px;
        height: 2px;
      }

      .sidebar-menu {
        width: 260px;
      }

      .sidebar-header {
        padding: 20px 16px;
      }

      .sidebar-nav-item {
        padding: 12px 16px;
        font-size: 14px;
      }
    }

    /* Анимация появления при загрузке */
    @keyframes slideInFromLeft {
      from {
        transform: translateX(-20px);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }

    .sidebar-nav-item {
      animation: slideInFromLeft 0.3s ease forwards;
      opacity: 0;
    }

    .sidebar-menu.active .sidebar-nav-item:nth-child(1) { animation-delay: 0.05s; }
    .sidebar-menu.active .sidebar-nav-item:nth-child(2) { animation-delay: 0.1s; }
    .sidebar-menu.active .sidebar-nav-item:nth-child(3) { animation-delay: 0.15s; }
    .sidebar-menu.active .sidebar-nav-item:nth-child(4) { animation-delay: 0.2s; }
    .sidebar-menu.active .sidebar-nav-item:nth-child(5) { animation-delay: 0.25s; }
    .sidebar-menu.active .sidebar-nav-item:nth-child(6) { animation-delay: 0.3s; }

    .sidebar-menu:not(.active) .sidebar-nav-item {
      animation: none;
      opacity: 1;
    }
  `;

  // Создаём HTML структуру
  function createSidebarHTML() {
    const menuItemsHTML = menuItems.map(item => {
      const isActive = currentPage === item.href || 
                       (currentPage === '' && item.href === 'index.html');
      return `
        <a href="${item.href}" class="sidebar-nav-item${isActive ? ' active' : ''}">
          <span class="sidebar-nav-icon">${item.icon}</span>
          <span class="sidebar-nav-text">${item.name}</span>
        </a>
      `;
    }).join('');

    return `
      <button class="sidebar-toggle" aria-label="Открыть меню" aria-expanded="false">
        <span></span>
        <span></span>
        <span></span>
      </button>
      
      <div class="sidebar-overlay"></div>
      
      <nav class="sidebar-menu" aria-label="Главное меню">
        <div class="sidebar-header">
          <h2>Арабские Тренажеры</h2>
          <p>Выберите раздел</p>
        </div>
        
        <div class="sidebar-nav">
          ${menuItemsHTML}
        </div>
        
        <div class="sidebar-footer">
          Изучайте арабский легко ✨
        </div>
      </nav>
    `;
  }

  // Инициализация
  function init() {
    // Добавляем стили
    const styleEl = document.createElement('style');
    styleEl.textContent = styles;
    document.head.appendChild(styleEl);

    // Создаём контейнер для меню
    const container = document.createElement('div');
    container.id = 'sidebar-container';
    container.innerHTML = createSidebarHTML();
    document.body.insertBefore(container, document.body.firstChild);

    // Получаем элементы
    const toggle = document.querySelector('.sidebar-toggle');
    const overlay = document.querySelector('.sidebar-overlay');
    const menu = document.querySelector('.sidebar-menu');

    // Добавляем класс для отступа
    document.body.classList.add('sidebar-enabled');

    // Функция открытия меню
    function openMenu() {
      toggle.classList.add('active');
      toggle.setAttribute('aria-expanded', 'true');
      overlay.classList.add('active');
      menu.classList.add('active');
      document.body.style.overflow = 'hidden';
    }

    // Функция закрытия меню
    function closeMenu() {
      toggle.classList.remove('active');
      toggle.setAttribute('aria-expanded', 'false');
      overlay.classList.remove('active');
      menu.classList.remove('active');
      document.body.style.overflow = '';
    }

    // Обработчики событий
    toggle.addEventListener('click', () => {
      if (menu.classList.contains('active')) {
        closeMenu();
      } else {
        openMenu();
      }
    });

    overlay.addEventListener('click', closeMenu);

    // Закрытие по Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && menu.classList.contains('active')) {
        closeMenu();
      }
    });

    // Свайп для открытия/закрытия
    let touchStartX = 0;
    let touchStartY = 0;
    let touchEndX = 0;
    let touchEndY = 0;
    const swipeThreshold = 50;
    const edgeZone = 30; // Зона у края экрана для начала свайпа открытия

    document.addEventListener('touchstart', (e) => {
      touchStartX = e.changedTouches[0].screenX;
      touchStartY = e.changedTouches[0].screenY;
    }, { passive: true });

    document.addEventListener('touchend', (e) => {
      touchEndX = e.changedTouches[0].screenX;
      touchEndY = e.changedTouches[0].screenY;
      handleSwipe();
    }, { passive: true });

    function handleSwipe() {
      const deltaX = touchEndX - touchStartX;
      const deltaY = touchEndY - touchStartY;

      // Проверяем что свайп больше горизонтальный чем вертикальный
      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        // Свайп вправо для открытия (только если начали от левого края)
        if (deltaX > swipeThreshold && touchStartX < edgeZone && !menu.classList.contains('active')) {
          openMenu();
        }
        // Свайп влево для закрытия
        if (deltaX < -swipeThreshold && menu.classList.contains('active')) {
          closeMenu();
        }
      }
    }

    // Закрытие при клике на пункт меню (для текущей страницы)
    document.querySelectorAll('.sidebar-nav-item').forEach(item => {
      item.addEventListener('click', (e) => {
        const href = item.getAttribute('href');
        if (href === currentPage || (currentPage === '' && href === 'index.html')) {
          e.preventDefault();
          closeMenu();
        }
      });
    });
  }

  // Запуск после загрузки DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
