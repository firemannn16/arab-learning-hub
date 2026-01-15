// 🛡️ Service Worker для offline работы
// Версия кэша (увеличивай при изменениях)
const CACHE_VERSION = 'v1.11.0';
const CACHE_NAME = `arab-learning-hub-${CACHE_VERSION}`;

// 📦 Файлы для кэширования
const STATIC_CACHE = [
    './',
    './index.html',
    './phases.html',
    './choice.html',
    './input.html',
    './simple.html',
    './dictionary.html',
    './words-list.html',
    './words.txt',
    './dua.js',
    './sidebar-menu.js',
    './favorites.js',
    './service-worker-register.js',
    './storage-protection.js',
    './streak.js',
    './theme.js',
    './theme.css',
    './manifest.json',
    './icon-192.svg'
];

// 🌐 Внешние ресурсы (Firebase, шрифты)
const EXTERNAL_CACHE = [
    'https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore-compat.js',
    'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js',
    'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js',
    'https://fonts.googleapis.com/css2?family=Noto+Naskh+Arabic:wght@400;700&display=swap'
];

// 📥 Установка Service Worker
self.addEventListener('install', event => {
    console.log('[SW] Установка Service Worker...');
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('[SW] Кэширование файлов...');
                
                // Кэшируем статичные файлы (если что-то не закэшировалось — установка провалится)
                const staticPromise = cache.addAll(STATIC_CACHE);
                
                // Кэшируем внешние ресурсы (по одному, чтобы одна ошибка не сломала все)
                const externalPromises = EXTERNAL_CACHE.map(url => 
                    cache.add(url).catch(err => {
                        console.warn(`[SW] Не удалось кэшировать ${url}:`, err);
                        return null;
                    })
                );
                
                return Promise.all([staticPromise, ...externalPromises]);
            })
            .then(() => {
                console.log('[SW] ✅ Кэширование завершено');
                // Принудительно активировать новый SW
                return self.skipWaiting();
            })
    );
});

// 🔄 Активация Service Worker
self.addEventListener('activate', event => {
    console.log('[SW] Активация Service Worker...');
    
    event.waitUntil(
        caches.keys()
            .then(cacheNames => {
                // Удаляем старые версии кэша
                return Promise.all(
                    cacheNames.map(cacheName => {
                        if (cacheName !== CACHE_NAME) {
                            console.log('[SW] 🗑️ Удаление старого кэша:', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
            .then(() => {
                console.log('[SW] ✅ Активация завершена');
                // Захватываем контроль над всеми страницами
                return self.clients.claim();
            })
    );
});

// 🌐 Обработка запросов
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);
    
    // Для Firebase JS модулей — пробуем отдавать из кэша, иначе сеть
    if (url.hostname.includes('gstatic.com') && url.pathname.endsWith('.js')) {
        event.respondWith(
            caches.match(event.request)
                .then(cachedResponse => {
                    if (cachedResponse) {
                        return cachedResponse;
                    }
                    return fetch(event.request);
                })
        );
        return;
    }
    
    // Остальные запросы к Firebase/Google API игнорируем — пусть идут в сеть
    if (url.hostname.includes('firestore.googleapis.com') || 
        url.hostname.includes('googleapis.com') ||
        url.hostname.includes('firebase')) {
        return;
    }
    
    // ✅ ИСПРАВЛЕНО: Для HTML файлов и words.txt — НАСТОЯЩИЙ Network First
    // Сначала пробуем сеть, только потом кэш
    if (event.request.url.endsWith('.html') || 
        event.request.url.endsWith('words.txt') || 
        event.request.destination === 'document') {
        event.respondWith(
            fetch(event.request)
                .then(networkResponse => {
                    // Успешно загрузили из сети — обновляем кэш
                    if (networkResponse && networkResponse.status === 200) {
                        const responseToCache = networkResponse.clone();
                        caches.open(CACHE_NAME).then(cache => {
                            cache.put(event.request, responseToCache);
                        });
                    }
                    return networkResponse;
                })
                .catch(() => {
                    // Сеть недоступна — пробуем кэш
                    return caches.match(event.request)
                        .then(cachedResponse => {
                            if (cachedResponse) {
                                return cachedResponse;
                            }
                            // Нет в кэше — показываем страницу ошибки
                            return new Response(
                                `<!DOCTYPE html>
                                <html lang="ru">
                                <head>
                                    <meta charset="UTF-8">
                                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                                    <title>Нет соединения</title>
                                    <style>
                                        body {
                                            font-family: Arial, sans-serif;
                                            display: flex;
                                            justify-content: center;
                                            align-items: center;
                                            height: 100vh;
                                            margin: 0;
                                            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                                            color: white;
                                            text-align: center;
                                            padding: 20px;
                                        }
                                        .error-container { max-width: 500px; }
                                        h1 { font-size: 3rem; margin: 0 0 20px 0; }
                                        p { font-size: 1.2rem; margin: 10px 0; }
                                        button {
                                            background: white;
                                            color: #667eea;
                                            border: none;
                                            padding: 15px 30px;
                                            font-size: 1rem;
                                            border-radius: 10px;
                                            cursor: pointer;
                                            margin-top: 20px;
                                        }
                                    </style>
                                </head>
                                <body>
                                    <div class="error-container">
                                        <h1>📡</h1>
                                        <h2>Нет интернета</h2>
                                        <p>Проверьте подключение и попробуйте снова</p>
                                        <button onclick="location.reload()">🔄 Обновить</button>
                                    </div>
                                </body>
                                </html>`,
                                { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
                            );
                        });
                })
        );
        return;
    }
    
    // Для остальных файлов (JS, CSS, картинки) — Cache First с безопасным фолбэком
    event.respondWith(
        caches.match(event.request)
            .then(cachedResponse => {
                const fetchPromise = fetch(event.request)
                    .then(networkResponse => {
                        if (networkResponse && networkResponse.status === 200) {
                            caches.open(CACHE_NAME).then(cache => {
                                cache.put(event.request, networkResponse.clone());
                            });
                        }
                        return networkResponse;
                    })
                    .catch(() => null);
                
                if (cachedResponse) return cachedResponse;
                
                // Если кэша нет и сеть упала — вернуть валидный Response, не null
                return fetchPromise.then(res => res || new Response('', { status: 504, statusText: 'Offline' }));
            })
    );
});

// 📨 Обработка сообщений от страниц
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    
    if (event.data && event.data.type === 'GET_VERSION') {
        event.ports[0].postMessage({ version: CACHE_VERSION });
    }
});

console.log('[SW] 🚀 Service Worker загружен');
