// dua.js - Единая модалка с дуа для всех тренажеров

(function() {
    'use strict';
    
    const FIVE_MINUTES = 5 * 60 * 1000; // 5 минут в миллисекундах
    const STORAGE_KEY = 'lastDuaShown';
    
    // Проверяем, нужно ли показывать дуа
    function shouldShowDua() {
        // Не показываем на главной странице и в словаре
        const currentPage = window.location.pathname.toLowerCase();
        if (currentPage.includes('index.html') || 
            currentPage.includes('dictionary.html') || 
            currentPage === '/' || 
            currentPage.endsWith('/')) {
            return false;
        }
        
        // Проверяем время последнего показа
        const lastShown = localStorage.getItem(STORAGE_KEY);
        if (!lastShown) return true;
        
        const now = Date.now();
        const timePassed = now - parseInt(lastShown);
        
        // Показываем только если прошло больше 5 минут
        return timePassed > FIVE_MINUTES;
    }
    
    // Сохраняем время показа
    function markDuaShown() {
        localStorage.setItem(STORAGE_KEY, Date.now().toString());
    }
    
    // Создаем модалку
    function createDuaModal() {
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
                animation: duaFadeIn 0.3s;
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
                font-size: 32px;
                color: white;
                text-align: center;
                direction: rtl;
                line-height: 1.8;
                padding: 25px 20px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                border-radius: 15px;
                box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
                margin-bottom: 12px;
                font-weight: 500;
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
                    font-size: 24px;
                    padding: 20px 15px;
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
                    <div class="dua-translation">«Господь мой! Приумножь мои знания»</div>
                </div>
                
                <div class="dua-divider"></div>
                
                <div class="dua-block">
                    <div class="dua-arabic">اللَّهُمَّ أَصْلِحْ أَحْوَالَ الْمُسْلِمِينَ فِي فِلَسْطِينَ</div>
                    <div class="dua-translation">«О Аллах, улучши положение мусульман в Палестине»</div>
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
        
        // Обработчик кнопки
        const button = document.getElementById('dua-done-button');
        button.addEventListener('click', () => {
            closeDuaModal();
            markDuaShown();
        });
    }
    
    // Показать модалку
    function showDuaModal() {
        const modal = document.getElementById('global-dua-modal');
        if (!modal) {
            createDuaModal();
        }
        
        const modalElement = document.getElementById('global-dua-modal');
        modalElement.classList.add('show');
        
        // Блокируем прокрутку body
        document.body.style.overflow = 'hidden';
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
        const userCode = localStorage.getItem('userProgressCode');
        
        // Создаем модалку если её нет
        if (!document.getElementById('global-dua-modal')) {
            createDuaModal();
        }
        
        const modal = document.getElementById('global-dua-modal');
        const content = modal.querySelector('.dua-modal-content');
        
        // Добавляем секцию с кодом
        const codeSection = document.createElement('div');
        codeSection.className = 'dua-code-section';
        codeSection.innerHTML = `
            <div class="dua-code-label">Ваш код для сохранения прогресса:</div>
            <div class="dua-code-box">
                <div class="dua-code-value">${userCode || 'НЕТ КОДА'}</div>
                <button class="dua-copy-btn" onclick="copyDuaCode()">📋 Копировать</button>
            </div>
        `;
        
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
    
    // Глобальная функция для копирования кода из дуа
    window.copyDuaCode = function() {
        const codeElement = document.querySelector('.dua-code-value');
        if (codeElement) {
            const code = codeElement.textContent;
            if (navigator.clipboard) {
                navigator.clipboard.writeText(code).then(() => {
                    alert('✅ Код скопирован!');
                }).catch(() => {
                    alert('❌ Не удалось скопировать');
                });
            } else {
                // Fallback
                const input = document.createElement('input');
                input.value = code;
                document.body.appendChild(input);
                input.select();
                document.execCommand('copy');
                document.body.removeChild(input);
                alert('✅ Код скопирован!');
            }
        }
    };
    
    // Слушаем событие сброса прогресса
    window.addEventListener('progressReset', () => {
        console.log('📢 Событие progressReset получено, показываем дуа с кодом');
        setTimeout(() => {
            showDuaWithCode();
        }, 300);
    });
    
    // Автоматический показ при загрузке страницы
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            if (shouldShowDua()) {
                setTimeout(showDuaModal, 300);
            }
        });
    } else {
        if (shouldShowDua()) {
            setTimeout(showDuaModal, 300);
        }
    }
    
})();
