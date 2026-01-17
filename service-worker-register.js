// 🔧 Регистрация Service Worker
(function() {
    'use strict';

    // ⚡ ВЕРСИЯ ПРИЛОЖЕНИЯ — при изменении принудительно обновляем
    const APP_VERSION = 'v1.2.3';
    const STORED_VERSION = localStorage.getItem('app_version');

    // 🔥 Принудительное обновление при изменении версии
    if (STORED_VERSION && STORED_VERSION !== APP_VERSION) {
        console.log('🔥 Обнаружена новая версия! Очищаем кэш...');
        
        // Удаляем все кэши
        if ('caches' in window) {
            caches.keys().then(names => {
                names.forEach(name => {
                    console.log('🗑️ Удаляем кэш:', name);
                    caches.delete(name);
                });
            });
        }
        
        // Удаляем Service Worker
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.getRegistrations().then(registrations => {
                registrations.forEach(registration => {
                    console.log('🗑️ Удаляем SW:', registration.scope);
                    registration.unregister();
                });
            });
        }
        
        // Сохраняем новую версию и перезагружаем
        localStorage.setItem('app_version', APP_VERSION);
        console.log('🔄 Перезагрузка через 500мс...');
        setTimeout(() => {
            window.location.reload(true);
        }, 500);
        return;
    }
    
    // Сохраняем версию при первом запуске
    if (!STORED_VERSION) {
        localStorage.setItem('app_version', APP_VERSION);
    }

    // Проверяем поддержку Service Worker
    if (!('serviceWorker' in navigator)) {
        console.warn('⚠️ Service Worker не поддерживается этим браузером');
        return;
    }

    // Регистрируем Service Worker при загрузке страницы
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./service-worker.js')
            .then(registration => {
                console.log('✅ Service Worker зарегистрирован:', registration.scope);

                // ✅ СРАЗУ активируем ожидающий SW если есть
                if (registration.waiting) {
                    console.log('🔄 Найден ожидающий SW — активируем...');
                    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
                }

                // Проверяем обновления каждые 60 секунд
                setInterval(() => {
                    registration.update();
                }, 60000);

                // Обработка обновления SW
                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    console.log('🔄 Найдено обновление Service Worker');

                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            // Новая версия доступна — СРАЗУ активируем без ожидания
                            console.log('✨ Новая версия — автоматическое обновление...');
                            newWorker.postMessage({ type: 'SKIP_WAITING' });
                        }
                    });
                });
            })
            .catch(error => {
                console.error('❌ Ошибка регистрации Service Worker:', error);
            });

        // Отслеживаем изменение контроллера (новый SW активировался)
        // ✅ Не перезагружаем при первом назначении контроллера (новый пользователь) — это убирает мерцание дуа
        let hadController = !!navigator.serviceWorker.controller;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (!hadController) {
                // Первый захват контроля: просто отмечаем, без перезагрузки
                hadController = true;
                console.log('✅ SW впервые контролирует страницу — перезагрузка не нужна');
                return;
            }
            console.log('🔄 Service Worker обновлен, перезагружаем страницу...');
            window.location.reload();
        });
    });

    // Показываем уведомление об обновлении
    function showUpdateNotification() {
        // Проверяем, показывали ли уже уведомление
        if (sessionStorage.getItem('updateNotificationShown')) {
            return;
        }

        const notification = document.createElement('div');
        notification.id = 'sw-update-notification';
        notification.innerHTML = `
            <style>
                #sw-update-notification {
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    padding: 20px;
                    border-radius: 10px;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.3);
                    z-index: 999999;
                    max-width: 300px;
                    animation: slideIn 0.3s ease-out;
                }
                @keyframes slideIn {
                    from { transform: translateX(400px); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
                #sw-update-notification h3 {
                    margin: 0 0 10px 0;
                    font-size: 1.1rem;
                }
                #sw-update-notification p {
                    margin: 0 0 15px 0;
                    font-size: 0.9rem;
                    opacity: 0.9;
                }
                #sw-update-notification button {
                    background: white;
                    color: #667eea;
                    border: none;
                    padding: 10px 20px;
                    border-radius: 5px;
                    cursor: pointer;
                    font-weight: bold;
                    margin-right: 10px;
                    font-size: 0.9rem;
                }
                #sw-update-notification button:hover {
                    transform: scale(1.05);
                }
                #sw-update-notification .btn-later {
                    background: transparent;
                    color: white;
                    border: 1px solid white;
                }
                @media (max-width: 600px) {
                    #sw-update-notification {
                        top: 10px;
                        right: 10px;
                        left: 10px;
                        max-width: none;
                    }
                }
            </style>
            <h3>✨ Доступна новая версия</h3>
            <p>Обновите страницу, чтобы получить последние улучшения</p>
            <button onclick="updateServiceWorker()">🔄 Обновить</button>
            <button class="btn-later" onclick="dismissUpdateNotification()">Позже</button>
        `;

        document.body.appendChild(notification);
        sessionStorage.setItem('updateNotificationShown', 'true');
    }

    // Обновить Service Worker
    window.updateServiceWorker = function() {
        navigator.serviceWorker.getRegistration().then(registration => {
            if (registration && registration.waiting) {
                // Отправляем сообщение новому SW чтобы он активировался
                registration.waiting.postMessage({ type: 'SKIP_WAITING' });
            } else {
                // Просто перезагружаем
                window.location.reload();
            }
        });
    };

    // Закрыть уведомление
    window.dismissUpdateNotification = function() {
        const notification = document.getElementById('sw-update-notification');
        if (notification) {
            notification.style.animation = 'slideIn 0.3s ease-out reverse';
            setTimeout(() => notification.remove(), 300);
        }
    };

    // Показываем статус подключения
    function updateOnlineStatus() {
        if (!navigator.onLine) {
            showOfflineIndicator();
        } else {
            hideOfflineIndicator();
        }
    }

    function showOfflineIndicator() {
        let indicator = document.getElementById('offline-indicator');
        if (indicator) return;

        indicator = document.createElement('div');
        indicator.id = 'offline-indicator';
        indicator.innerHTML = `
            <style>
                #offline-indicator {
                    position: fixed;
                    bottom: 20px;
                    left: 50%;
                    transform: translateX(-50%);
                    background: #ff6b6b;
                    color: white;
                    padding: 12px 24px;
                    border-radius: 25px;
                    box-shadow: 0 5px 15px rgba(0,0,0,0.3);
                    z-index: 999999;
                    font-size: 0.9rem;
                    animation: slideUp 0.3s ease-out;
                }
                @keyframes slideUp {
                    from { transform: translateX(-50%) translateY(100px); opacity: 0; }
                    to { transform: translateX(-50%) translateY(0); opacity: 1; }
                }
            </style>
            📡 Нет интернета - работаем offline
        `;
        document.body.appendChild(indicator);
    }

    function hideOfflineIndicator() {
        const indicator = document.getElementById('offline-indicator');
        if (indicator) {
            indicator.style.animation = 'slideUp 0.3s ease-out reverse';
            setTimeout(() => indicator.remove(), 300);
        }
    }

    // Отслеживаем статус подключения
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);

    // Проверяем статус при загрузке
    updateOnlineStatus();

})();
