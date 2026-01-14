/**
 * 🛡️ STORAGE PROTECTION
 * Централизованная защита данных для всех тренажеров
 */

// ============================================
// 📦 БЕЗОПАСНАЯ РАБОТА С localStorage
// ============================================

/**
 * Безопасное чтение из localStorage с проверкой JSON и timestamp
 * @param {string} key - Ключ в localStorage
 * @param {number} maxAge - Максимальный возраст данных в минутах (0 = без ограничения, по умолчанию 0)
 * @returns {any|null} - Данные или null при ошибке
 */
function safeLocalStorageGet(key, maxAge = 0) {
    try {
        const item = localStorage.getItem(key);
        
        // Если данных нет
        if (!item) {
            console.log(`📭 localStorage: ключ "${key}" не найден`);
            return null;
        }

        // Попытка парсинга JSON
        let data;
        try {
            data = JSON.parse(item);
        } catch (parseError) {
            console.error(`❌ Битый JSON в localStorage для ключа "${key}":`, parseError);
            
            // Создать backup битых данных
            const backupKey = `${key}_corrupted_backup_${Date.now()}`;
            localStorage.setItem(backupKey, item);
            console.log(`💾 Битые данные сохранены в "${backupKey}"`);
            
            // Сообщаем UI о доступном backup
            if (typeof window !== 'undefined' && typeof window.__notifyStorageBackup === 'function') {
                window.__notifyStorageBackup(key, backupKey, 'corrupted');
            }

            return null;
        }

        // Проверка timestamp (если данные имеют поле timestamp и включена проверка возраста)
        if (data && typeof data === 'object' && data.timestamp) {
            // Если maxAge > 0, проверяем возраст данных
            if (maxAge > 0) {
                const now = Date.now();
                const age = (now - data.timestamp) / (1000 * 60); // возраст в минутах
                
                if (age > maxAge) {
                    console.warn(`⏰ Данные в "${key}" устарели (возраст: ${Math.round(age)} мин, макс: ${maxAge} мин)`);
                    
                    // Создать backup устаревших данных
                    const backupKey = `${key}_old_backup_${Date.now()}`;
                    localStorage.setItem(backupKey, item);
                    console.log(`💾 Устаревшие данные сохранены в "${backupKey}"`);
                    
                    // Сообщаем UI о доступном backup
                    if (typeof window !== 'undefined' && typeof window.__notifyStorageBackup === 'function') {
                        window.__notifyStorageBackup(key, backupKey, 'stale');
                    }

                    return null;
                }
            }
            
            // Если данные были обёрнуты (массив или примитив), извлечь их
            if (data._data !== undefined) {
                console.log(`✓ localStorage: "${key}" загружен успешно (извлечено из обёртки)`);
                return data._data;
            }
        }

        console.log(`✓ localStorage: "${key}" загружен успешно`);
        return data;

    } catch (error) {
        console.error(`❌ Ошибка чтения localStorage для "${key}":`, error);
        return null;
    }
}

/**
 * Безопасная запись в localStorage с backup
 * @param {string} key - Ключ в localStorage
 * @param {any} data - Данные для сохранения
 * @param {boolean} addTimestamp - Добавить timestamp к данным (по умолчанию false для данных прогресса)
 * @returns {boolean} - true если успешно, false при ошибке
 */
function safeLocalStorageSet(key, data, addTimestamp = false) {
    try {
        // Создать backup старых данных
        const oldData = localStorage.getItem(key);
        if (oldData) {
            const backupKey = `${key}_backup`;
            localStorage.setItem(backupKey, oldData);
        }

        // Добавить timestamp
        let dataToSave;
        if (addTimestamp && data !== null && data !== undefined) {
            if (Array.isArray(data)) {
                // Массивы оборачиваем в объект
                dataToSave = { _data: data, timestamp: Date.now() };
            } else if (typeof data === 'object') {
                // Объекты spread
                dataToSave = { ...data, timestamp: Date.now() };
            } else {
                // Примитивы оборачиваем
                dataToSave = { _data: data, timestamp: Date.now() };
            }
        } else {
            dataToSave = data;
        }

        // Преобразовать в JSON
        const jsonString = JSON.stringify(dataToSave);

        // Проверка размера (localStorage имеет лимит ~5-10MB)
        const size = new Blob([jsonString]).size;
        if (size > 4.5 * 1024 * 1024) { // 4.5MB
            console.warn(`⚠️ Данные для "${key}" слишком большие (${(size / 1024 / 1024).toFixed(2)}MB)`);
        }

        // Сохранить
        localStorage.setItem(key, jsonString);
        console.log(`✓ localStorage: "${key}" сохранён (${(size / 1024).toFixed(2)}KB)`);
        return true;

    } catch (error) {
        console.error(`❌ Ошибка записи в localStorage для "${key}":`, error);
        
        // Попытка восстановить из backup
        try {
            const backupKey = `${key}_backup`;
            const backup = localStorage.getItem(backupKey);
            if (backup) {
                localStorage.setItem(key, backup);
                console.log(`♻️ Восстановлено из backup для "${key}"`);
            }
        } catch (restoreError) {
            console.error(`❌ Не удалось восстановить backup:`, restoreError);
        }
        
        return false;
    }
}

/**
 * Очистить все backup-ы старше N дней
 * @param {number} days - Количество дней
 */
function cleanOldBackups(days = 7) {
    try {
        const now = Date.now();
        const maxAge = days * 24 * 60 * 60 * 1000;
        let cleaned = 0;

        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            
            // Проверить backup ключи
            if (key && (key.includes('_backup_') || key.includes('_corrupted_backup_'))) {
                const match = key.match(/_(\d+)$/);
                if (match) {
                    const timestamp = parseInt(match[1]);
                    if (now - timestamp > maxAge) {
                        localStorage.removeItem(key);
                        cleaned++;
                    }
                }
            }
        }

        if (cleaned > 0) {
            console.log(`🧹 Очищено ${cleaned} старых backup-ов`);
        }
    } catch (error) {
        console.error('❌ Ошибка очистки backup-ов:', error);
    }
}

// ============================================
// 📄 БЕЗОПАСНАЯ ЗАГРУЗКА words.txt
// ============================================

/**
 * Безопасная загрузка файла words.txt с retry логикой
 * @param {string} url - URL файла words.txt
 * @param {number} maxRetries - Максимальное количество попыток
 * @returns {Promise<string|null>} - Содержимое файла или null
 */
async function safeLoadWordsFile(url = 'words.txt', maxRetries = 3) {
    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`📥 Загрузка words.txt (попытка ${attempt}/${maxRetries})...`);

            const response = await fetch(url, {
                cache: 'no-cache',
                headers: {
                    'Accept': 'text/plain; charset=UTF-8'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            // Проверка Content-Type
            const contentType = response.headers.get('Content-Type');
            console.log(`📋 Content-Type: ${contentType}`);

            // Загрузить как текст
            const text = await response.text();

            // Проверка что файл не пустой
            if (!text || text.trim().length === 0) {
                throw new Error('Файл words.txt пустой');
            }

            // Проверка кодировки (проверить на наличие арабских символов)
            const hasArabic = /[\u0600-\u06FF]/.test(text);
            const hasCyrillic = /[\u0400-\u04FF]/.test(text);
            
            if (!hasArabic || !hasCyrillic) {
                console.warn('⚠️ Возможная проблема с кодировкой words.txt');
            }

            // Проверка формата (должны быть строки вида "слово-перевод")
            const lines = text.split('\n').filter(l => l.trim());
            const validLines = lines.filter(l => l.includes('-'));
            
            if (validLines.length === 0) {
                throw new Error('Неверный формат words.txt (нет строк с разделителем "-")');
            }

            console.log(`✓ words.txt загружен успешно (${lines.length} строк, ${validLines.length} валидных)`);
            
            // Сохранить в localStorage как backup (с timestamp, чтобы обновлять раз в неделю)
            safeLocalStorageSet('words_txt_cache', {
                content: text,
                linesCount: validLines.length,
                loadedAt: Date.now()
            }, true);

            return text;

        } catch (error) {
            lastError = error;
            console.error(`❌ Ошибка загрузки words.txt (попытка ${attempt}/${maxRetries}):`, error);

            // Если это последняя попытка - попробовать загрузить из cache
            if (attempt === maxRetries) {
                console.log('🔄 Попытка загрузить words.txt из cache...');
                const cached = safeLocalStorageGet('words_txt_cache', 60 * 24 * 30); // 30 дней
                
                if (cached && cached.content) {
                    console.log(`✓ words.txt загружен из cache (${cached.linesCount} строк)`);
                    return cached.content;
                }
            } else {
                // Задержка перед следующей попыткой
                await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
            }
        }
    }

    // Все попытки исчерпаны
    const errorMsg = `
        ❌ Не удалось загрузить базу слов (words.txt)
        
        Причина: ${lastError?.message || 'Неизвестная ошибка'}
        
        Возможные решения:
        • Проверьте подключение к интернету
        • Перезагрузите страницу
        • Очистите кэш браузера
        • Проверьте что файл words.txt существует на сервере
    `;
    
    console.error(errorMsg);
    alert(errorMsg.trim());
    
    return null;
}

// ============================================
// 🔥 БЕЗОПАСНАЯ РАБОТА С Firebase
// ============================================

/**
 * Безопасное выполнение Firebase операций с retry логикой
 * @param {Function} operation - Функция с Firebase операцией
 * @param {string} operationName - Название операции для логов
 * @param {number} maxRetries - Максимальное количество попыток
 * @returns {Promise<any|null>} - Результат операции или null
 */
async function safeFirebaseOperation(operation, operationName = 'Firebase operation', maxRetries = 3) {
    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`🔥 ${operationName} (попытка ${attempt}/${maxRetries})...`);
            
            const result = await operation();
            
            console.log(`✓ ${operationName} выполнена успешно`);
            return result;

        } catch (error) {
            lastError = error;
            const errorCode = error?.code || 'unknown';
            const errorMessage = error?.message || String(error);
            
            console.error(`❌ ${operationName} ошибка (попытка ${attempt}/${maxRetries}):`, errorCode, errorMessage);

            // Проверка на временные ошибки (можно retry)
            const retryableErrors = [
                'unavailable',
                'deadline-exceeded',
                'resource-exhausted',
                'aborted',
                'internal',
                'unknown'
            ];

            const isRetryable = retryableErrors.some(code => errorCode.includes(code));

            // Если ошибка не временная или это последняя попытка - прекратить
            if (!isRetryable || attempt === maxRetries) {
                console.error(`💔 ${operationName} окончательно провалена`);
                break;
            }

            // Экспоненциальная задержка перед следующей попыткой
            const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
            console.log(`⏳ Повтор через ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    // Все попытки исчерпаны
    console.error(`❌ ${operationName} провалена после ${maxRetries} попыток:`, lastError);
    return null;
}

/**
 * Проверка валидности данных перед сохранением в Firebase
 * @param {any} data - Данные для проверки
 * @returns {boolean} - true если данные валидны
 */
function validateFirebaseData(data) {
    try {
        // Проверка что это объект
        if (!data || typeof data !== 'object') {
            console.error('❌ Данные должны быть объектом');
            return false;
        }

        // Проверка на undefined значения (Firebase не поддерживает)
        const hasUndefined = JSON.stringify(data).includes('undefined');
        if (hasUndefined) {
            console.error('❌ Данные содержат undefined (не поддерживается Firebase)');
            return false;
        }

        // Проверка размера (Firestore лимит: 1MB на документ)
        const size = new Blob([JSON.stringify(data)]).size;
        if (size > 900000) { // 900KB (с запасом)
            console.error(`❌ Данные слишком большие для Firebase (${(size / 1024).toFixed(2)}KB, макс: 900KB)`);
            return false;
        }

        console.log(`✓ Данные валидны для Firebase (${(size / 1024).toFixed(2)}KB)`);
        return true;

    } catch (error) {
        console.error('❌ Ошибка валидации данных:', error);
        return false;
    }
}

/**
 * Безопасное сохранение в Firebase + backup в localStorage
 * @param {Function} firebaseOperation - Функция сохранения в Firebase
 * @param {string} localStorageKey - Ключ для backup в localStorage
 * @param {any} data - Данные для сохранения
 * @returns {Promise<boolean>} - true если успешно
 */
async function safeFirebaseSave(firebaseOperation, localStorageKey, data) {
    // Валидация данных
    if (!validateFirebaseData(data)) {
        console.error('❌ Данные не прошли валидацию');
        return false;
    }

    // Сохранить backup в localStorage
    const backupSuccess = safeLocalStorageSet(localStorageKey, data);
    if (backupSuccess) {
        console.log('💾 Backup в localStorage создан');
    }

    // Попытка сохранить в Firebase
    const result = await safeFirebaseOperation(
        firebaseOperation,
        `Сохранение в Firebase (backup: ${localStorageKey})`,
        3
    );

    return result !== null;
}

/**
 * Безопасная загрузка из Firebase с fallback на localStorage
 * @param {Function} firebaseOperation - Функция загрузки из Firebase
 * @param {string} localStorageKey - Ключ для fallback в localStorage
 * @returns {Promise<any|null>} - Загруженные данные или null
 */
async function safeFirebaseLoad(firebaseOperation, localStorageKey) {
    // Попытка загрузить из Firebase
    const firebaseData = await safeFirebaseOperation(
        firebaseOperation,
        `Загрузка из Firebase (fallback: ${localStorageKey})`,
        2
    );

    if (firebaseData !== null) {
        // Обновить localStorage backup
        safeLocalStorageSet(localStorageKey, firebaseData);
        return firebaseData;
    }

    // Fallback на localStorage
    console.log('🔄 Firebase недоступен, загрузка из localStorage...');
    const localData = safeLocalStorageGet(localStorageKey);
    
    if (localData) {
        console.log('✓ Данные загружены из localStorage');
        return localData;
    }

    console.log('📭 Нет данных ни в Firebase, ни в localStorage');
    return null;
}

// ============================================
// 🔧 УТИЛИТЫ
// ============================================

/**
 * Получить статистику использования localStorage
 */
function getStorageStats() {
    try {
        let totalSize = 0;
        const keys = [];

        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key) {
                const value = localStorage.getItem(key);
                const size = new Blob([value]).size;
                totalSize += size;
                keys.push({ key, size });
            }
        }

        keys.sort((a, b) => b.size - a.size);

        console.log('📊 Статистика localStorage:');
        console.log(`   Всего ключей: ${keys.length}`);
        console.log(`   Общий размер: ${(totalSize / 1024).toFixed(2)}KB`);
        console.log(`   Топ-5 по размеру:`);
        keys.slice(0, 5).forEach(item => {
            console.log(`     - ${item.key}: ${(item.size / 1024).toFixed(2)}KB`);
        });

        return { totalSize, keys };
    } catch (error) {
        console.error('❌ Ошибка получения статистики:', error);
        return null;
    }
}

// ============================================
// 🚀 ЭКСПОРТ (для использования в тренажерах)
// ============================================

// Автоматическая очистка старых backup-ов при загрузке
if (typeof window !== 'undefined') {
    window.addEventListener('load', () => {
        cleanOldBackups(7);
    });

    // Очередь уведомлений о backup-ах
    const backupQueue = [];
    let modalShown = false;

    // Публичный уведомитель, чтобы вызывать из safeLocalStorageGet
    window.__notifyStorageBackup = function(originalKey, backupKey, reason) {
        backupQueue.push({ originalKey, backupKey, reason, ts: Date.now() });
        maybeShowBackupModal();
    };

    function maybeShowBackupModal() {
        if (modalShown) return;
        if (!backupQueue.length) return;
        const { originalKey, backupKey, reason } = backupQueue[0];
        modalShown = true;
        showBackupModal(originalKey, backupKey, reason);
    }

    function showBackupModal(originalKey, backupKey, reason) {
        const existing = document.getElementById('storage-backup-modal');
        if (existing) {
            existing.remove();
        }

        const modal = document.createElement('div');
        modal.id = 'storage-backup-modal';
        modal.innerHTML = `
            <style>
                #storage-backup-modal {
                    position: fixed;
                    inset: 0;
                    background: rgba(0,0,0,0.4);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 999999;
                    padding: 20px;
                }
                #storage-backup-modal .card {
                    background: #fff;
                    color: #1f2937;
                    max-width: 420px;
                    width: 100%;
                    border-radius: 14px;
                    box-shadow: 0 12px 40px rgba(0,0,0,0.25);
                    padding: 20px 22px;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
                }
                #storage-backup-modal h3 { margin: 0 0 10px; font-size: 1.1rem; color: #111827; }
                #storage-backup-modal p { margin: 0 0 14px; font-size: 0.95rem; line-height: 1.45; }
                #storage-backup-modal .pill {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    padding: 6px 10px;
                    border-radius: 999px;
                    font-size: 0.85rem;
                    background: #eef2ff;
                    color: #4338ca;
                    margin-bottom: 10px;
                }
                #storage-backup-modal .actions {
                    display: flex;
                    gap: 10px;
                    margin-top: 12px;
                }
                #storage-backup-modal button {
                    flex: 1;
                    border: none;
                    border-radius: 10px;
                    padding: 12px;
                    font-size: 0.95rem;
                    cursor: pointer;
                    font-weight: 600;
                    transition: transform 0.1s ease, box-shadow 0.1s ease;
                }
                #storage-backup-modal button:hover { transform: translateY(-1px); }
                #storage-backup-modal .primary {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: #fff;
                    box-shadow: 0 8px 18px rgba(102, 126, 234, 0.25);
                }
                #storage-backup-modal .ghost {
                    background: #f3f4f6;
                    color: #374151;
                }
            </style>
            <div class="card">
                <div class="pill">Восстановление данных</div>
                <h3>Нашли резервную копию</h3>
                <p>Данные по ключу <code>${originalKey}</code> выглядят повреждёнными${reason === 'stale' ? ' или устаревшими' : ''}. Восстановить из резервной копии?</p>
                <div class="actions">
                    <button class="ghost" id="storage-backup-skip">Позже</button>
                    <button class="primary" id="storage-backup-restore">Восстановить</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const closeModal = () => {
            modal.remove();
            backupQueue.shift();
            modalShown = false;
            // Показать следующий, если есть
            maybeShowBackupModal();
        };

        modal.querySelector('#storage-backup-skip').addEventListener('click', closeModal);

        modal.querySelector('#storage-backup-restore').addEventListener('click', () => {
            try {
                const raw = localStorage.getItem(backupKey);
                if (!raw) throw new Error('Backup пустой');
                // Пишем как есть — предполагаем валидный JSON внутри строки
                localStorage.setItem(originalKey, raw);
                console.log(`✓ Восстановлено из backup ${backupKey} → ${originalKey}`);
                closeModal();
                // Обновляем страницу, чтобы данные перечитались
                window.location.reload();
            } catch (e) {
                console.error('❌ Не удалось восстановить из backup:', e);
                alert('Не удалось восстановить данные из резервной копии');
                closeModal();
            }
        });
    }
}

console.log('✓ storage-protection.js загружен');
