// dua.js - Единая модалка с дуа для всех тренажеров

(function() {
    'use strict';
    
    const DUA_INTERVAL = 3 * 60 * 60 * 1000; // 3 часа в миллисекундах
    const STORAGE_KEY = 'lastDuaShown';
    
    // Флаг для предотвращения повторного показа
    let duaAlreadyShown = false;
    
    // Флаг для предотвращения двойной инициализации
    let initialized = false;

    // Флаг, чтобы игнорировать случайные клики в первые миллисекунды после показа
    let duaJustOpened = false;
    
    // Проверяем, нужно ли показывать дуа
    function shouldShowDua() {
        const currentPage = window.location.pathname.toLowerCase();
        const isIndexPage = currentPage.includes('index.html') || 
                          currentPage === '/' || 
                          currentPage.endsWith('/');
        
        // Не показываем на главной странице
        if (isIndexPage) {
            return false;
        }
        
        // Не показываем в словаре
        if (currentPage.includes('dictionary.html')) {
            return false;
        }
        
        // Не показываем, если пользователь не авторизован
        if (window.auth && window.auth.isLoggedIn && !window.auth.isLoggedIn()) {
            return false;
        }
        
        // На других страницах проверяем время последнего показа
        const lastShown = localStorage.getItem(STORAGE_KEY);
        if (!lastShown) {
            return true;
        }
        
        const now = Date.now();
        const timePassed = now - parseInt(lastShown);
        return timePassed > DUA_INTERVAL;
    }
    
    // Сохраняем время показа
    function markDuaShown() {
        localStorage.setItem(STORAGE_KEY, Date.now().toString());
        console.log('✅ Время показа дуа сохранено');
    }
    
    // Создаем модалку
    function createDuaModal() {
        console.log('🏗️ createDuaModal() вызвана - создаём модалку');
        
        // Проверяем, может модалка уже существует
        if (document.getElementById('global-dua-modal')) {
            console.log('⚠️ Модалка уже существует! Не создаём заново');
            return;
        }
        
        // Подключаем шрифт Amiri
        const fontLink = document.createElement('link');
        fontLink.href = 'https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&display=swap';
        fontLink.rel = 'stylesheet';
        document.head.appendChild(fontLink);
        
        // Добавляем CSS
        const style = document.createElement('style');
        style.textContent = `
            .dua-modal-overlay {
                display: none;
                position: fixed;
                z-index: 99999;
                left: 0;
                top: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.6);
                overflow-y: auto;
                padding: 20px;
                box-sizing: border-box;
            }
            
            @keyframes duaFadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            
            .dua-modal-overlay.show {
                display: flex;
                justify-content: center;
                align-items: center;
                animation: duaFadeIn 0.3s;
            }
            
            .dua-modal-content {
                background: white;
                padding: 30px;
                border-radius: 20px;
                max-width: 500px;
                width: 100%;
                box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
                animation: duaSlideIn 0.4s;
            }
            
            @keyframes duaSlideIn {
                from { 
                    transform: translateY(-30px) scale(0.95); 
                    opacity: 0; 
                }
                to { 
                    transform: translateY(0) scale(1); 
                    opacity: 1; 
                }
            }
            
            .dua-modal-title {
                font-size: 24px;
                font-weight: bold;
                color: #333;
                margin-bottom: 20px;
                text-align: center;
            }
            
            .dua-block {
                margin-bottom: 20px;
            }
            
            .dua-arabic {
                font-family: 'Amiri', serif;
                font-size: 34px;
                color: white;
                text-align: center;
                direction: rtl;
                line-height: 2;
                padding: 25px 20px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                border-radius: 15px;
                box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
                margin-bottom: 12px;
                font-weight: 400;
            }
            
            .dua-arabic-small {
                font-size: 22px;
                line-height: 1.7;
            }
            
            .dua-translation {
                font-size: 16px;
                color: #555;
                text-align: center;
                font-style: italic;
                line-height: 1.6;
            }
            
            .dua-divider {
                height: 1px;
                background: linear-gradient(to right, transparent, #ddd, transparent);
                margin: 25px 0;
            }
            
            .dua-button {
                width: 100%;
                padding: 16px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                border: none;
                border-radius: 12px;
                font-size: 18px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.3s;
                margin-top: 10px;
                box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);
            }
            
            .dua-button:hover {
                transform: translateY(-2px);
                box-shadow: 0 6px 20px rgba(102, 126, 234, 0.4);
            }
            
            .dua-button:active {
                transform: translateY(0);
            }
            
            .dua-code-section {
                margin-top: 25px;
                padding-top: 25px;
                border-top: 2px dashed #e0e0e0;
            }
            
            .dua-code-label {
                font-size: 14px;
                color: #666;
                text-align: center;
                margin-bottom: 10px;
            }
            
            .dua-code-box {
                background: #f5f5f5;
                border: 2px solid #667eea;
                border-radius: 10px;
                padding: 15px;
                text-align: center;
                margin-bottom: 10px;
            }
            
            .dua-code-value {
                font-size: 1.8em;
                font-weight: bold;
                color: #667eea;
                letter-spacing: 3px;
                margin-bottom: 10px;
            }
            
            .dua-copy-btn {
                background: #4CAF50;
                color: white;
                border: none;
                padding: 8px 16px;
                border-radius: 6px;
                cursor: pointer;
                font-size: 0.9em;
                transition: all 0.3s;
            }
            
            .dua-copy-btn:hover {
                background: #45a049;
            }
            
            @media (max-width: 600px) {
                .dua-modal-content {
                    padding: 20px;
                    margin: 10px;
                }
                
                .dua-modal-title {
                    font-size: 20px;
                }
                
                .dua-arabic {
                    font-size: 26px;
                    padding: 20px 15px;
                    line-height: 1.9;
                }
                
                .dua-arabic-small {
                    font-size: 16px;
                }
                
                .dua-translation {
                    font-size: 14px;
                }
                
                .dua-button {
                    font-size: 16px;
                    padding: 14px;
                }
            }
        `;
        document.head.appendChild(style);
        
        // Создаем HTML модалки
        const modal = document.createElement('div');
        modal.className = 'dua-modal-overlay';
        modal.id = 'global-dua-modal';
        modal.innerHTML = `
            <div class="dua-modal-content">
                <div class="dua-modal-title">🤲 Сделаем дуа</div>
                
                <div class="dua-block">
                    <div class="dua-arabic">رَّبِّ زِدْنِى عِلْمًۭا</div>
                </div>
                
                <div class="dua-divider"></div>
                
                <div class="dua-block">
                    <div class="dua-arabic dua-arabic-small">اللَّهُمَّ أَصْلِحْ أَحْوَالَ الْمُسْلِمِينَ فِي فِلَسْطِينَ وَفِي كُلِّ مَكَانٍ</div>
                </div>
                
                <button class="dua-button" id="dua-done-button">я сделал дуа</button>
            </div>
        `;
        
        // Предотвращаем закрытие по клику на оверлей
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                e.stopPropagation();
            }
        });
        
        document.body.appendChild(modal);
        console.log('✅ Модалка дуа добавлена в DOM');
        
        // Обработчик кнопки
        const button = document.getElementById('dua-done-button');
        button.addEventListener('click', () => {
            if (duaJustOpened) {
                console.log('⏸️ Клик проигнорирован: модалка только открылась');
                return;
            }
            console.log('👆 Кнопка "я сделал дуа" нажата');
            markDuaShown(); // Сохраняем время показа ПЕРЕД закрытием
            closeDuaModal(); // Закрываем и отправляем событие
        });
    }
    
    // Показать модалку
    function showDuaModal() {
        // Проверяем флаг - если дуа уже показывалось в этой сессии, не показываем снова
        if (duaAlreadyShown) {
            console.log('⏸️ Дуа уже показывалось в этой сессии, пропускаем');
            return;
        }
        
        const modal = document.getElementById('global-dua-modal');
        if (!modal) {
            console.log('🏗️ Модалка не найдена, создаём...');
            createDuaModal();
            
            // Даём браузеру время применить стили перед показом
            setTimeout(() => {
                const modalElement = document.getElementById('global-dua-modal');
                if (!modalElement) {
                    console.log('❌ ОШИБКА: Модалка не найдена после создания!');
                    return;
                }
                
                // Ставим флаг защиты от случайных кликов
                duaJustOpened = true;
                setTimeout(() => {
                    duaJustOpened = false;
                }, 800);

                console.log('➕ Добавляем класс .show к модалке');
                modalElement.classList.add('show');
                console.log(`✅ Класс добавлен. Текущие классы: ${modalElement.className}`);
                
                // Блокируем прокрутку body
                document.body.style.overflow = 'hidden';
            }, 50); // Небольшая задержка для применения CSS
        } else {
            console.log('✅ Модалка уже существует в DOM');

            // Ставим флаг защиты от случайных кликов
            duaJustOpened = true;
            setTimeout(() => {
                duaJustOpened = false;
            }, 800);

            console.log('➕ Добавляем класс .show к модалке');
            modal.classList.add('show');
            console.log(`✅ Класс добавлен. Текущие классы: ${modal.className}`);
            
            // Блокируем прокрутку body
            document.body.style.overflow = 'hidden';
        }
        
        // Устанавливаем флаг
        duaAlreadyShown = true;
        console.log('✅ Дуа показано, флаг установлен');
    }
    
    // Закрыть модалку
    function closeDuaModal() {
        const modal = document.getElementById('global-dua-modal');
        if (modal) {
            modal.classList.remove('show');
            document.body.style.overflow = '';
        }
    }
    
    // Показать дуа с кодом после сброса
    function showDuaWithCode() {
        const isLoggedIn = window.auth && window.auth.isLoggedIn && window.auth.isLoggedIn();
        
        // Создаем модалку если её нет
        if (!document.getElementById('global-dua-modal')) {
            createDuaModal();
        }
        
        const modal = document.getElementById('global-dua-modal');
        const content = modal.querySelector('.dua-modal-content');
        
        // Добавляем секцию с email
        const codeSection = document.createElement('div');
        codeSection.className = 'dua-code-section';
        if (isLoggedIn) {
            const userEmail = window.auth.getUserEmail() || '';
            codeSection.innerHTML = `
                <div class="dua-code-label">Вы вошли как:</div>
                <div class="dua-code-box">
                    <div class="dua-code-value" style="font-size:14px">${userEmail || 'Email не указан'}</div>
                </div>
                <div style="font-size:12px;color:#666;margin-top:8px">Прогресс сохраняется в облаке</div>
            `;
        } else {
            codeSection.innerHTML = `
                <div class="dua-code-label">Войдите в аккаунт для сохранения прогресса в облаке</div>
                <div style="font-size:12px;color:#666;margin-top:8px">Нажмите «Войти» в меню</div>
            `;
        }
        
        // Вставляем перед кнопкой
        const button = content.querySelector('.dua-button');
        content.insertBefore(codeSection, button);
        
        // Показываем модалку
        modal.classList.add('show');
        document.body.style.overflow = 'hidden';
        
        // Обновляем обработчик кнопки для удаления секции с кодом
        const doneButton = document.getElementById('dua-done-button');
        doneButton.onclick = () => {
            codeSection.remove();
            closeDuaModal();
            markDuaShown();
        };
    }
    
    // Слушаем событие сброса прогресса
    window.addEventListener('progressReset', () => {
        console.log('📢 Событие progressReset получено, показываем дуа с кодом');
        setTimeout(() => {
            showDuaWithCode();
        }, 300);
    });
    
    // Функция инициализации (вызывается только один раз)
    function initDua() {
        if (initialized) return;
        initialized = true;
        
        // На главной странице не показываем вообще
        const currentPage = window.location.pathname.toLowerCase();
        const isIndexPage = currentPage.includes('index.html') || 
                          currentPage === '/' || 
                          currentPage.endsWith('/');
        if (isIndexPage) return;
        
        // Если есть auth, ждём его готовности
        if (window.auth) {
            function waitForAuth() {
                if (window.authUser !== undefined) {
                    if (window.auth.isLoggedIn() && shouldShowDua()) {
                        setTimeout(showDuaModal, 300);
                    }
                } else {
                    setTimeout(waitForAuth, 200);
                }
            }
            waitForAuth();
        } else if (shouldShowDua()) {
            setTimeout(showDuaModal, 300);
        }
    }
    
    // Автоматический показ при загрузке страницы
    if (document.readyState === 'loading') {
        console.log('📢 document.readyState = loading, ждём DOMContentLoaded');
        document.addEventListener('DOMContentLoaded', initDua);
    } else {
        console.log('📢 document.readyState = ' + document.readyState + ', инициализируем сразу');
        initDua();
    }
    
})();
