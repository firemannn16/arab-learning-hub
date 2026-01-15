/**
 * Система серии дней (Streak) для арабских тренажеров
 * Считает день пройденным если пользователь ответил минимум на 5 слов
 * Хранит данные в localStorage + синхронизирует с Firebase
 */

(function() {
  'use strict';

  const STREAK_KEY = 'arabStreak';
  const ACTIVITY_KEY = 'arabDailyActivity';
  const MIN_WORDS_PER_DAY = 5;
  const SHARED_CODE_KEY = 'userProgressCode';
  
  let firebaseLoaded = false;
  let syncInProgress = false;

  // Получить код пользователя
  function getUserCode() {
    try {
      return localStorage.getItem(SHARED_CODE_KEY) || '';
    } catch (e) {
      return '';
    }
  }

  // Получить данные серии из localStorage
  function getStreakData() {
    try {
      const data = localStorage.getItem(STREAK_KEY);
      return data ? JSON.parse(data) : getDefaultStreakData();
    } catch (e) {
      console.warn('Ошибка чтения streak:', e);
      return getDefaultStreakData();
    }
  }

  // Данные по умолчанию
  function getDefaultStreakData() {
    return {
      currentStreak: 0,
      longestStreak: 0,
      lastActiveDate: null,
      completedDates: [],
      currentGoal: 7,
      goalsCompleted: 0
    };
  }

  // Сохранить данные серии в localStorage
  function saveStreakDataLocal(data) {
    try {
      localStorage.setItem(STREAK_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('Ошибка сохранения streak:', e);
    }
  }

  // Сохранить данные серии (localStorage + Firebase)
  async function saveStreakData(data) {
    // Сначала сохраняем локально
    saveStreakDataLocal(data);
    
    // Затем синхронизируем с Firebase
    await syncStreakToFirebase(data);
  }

  // Синхронизировать streak с Firebase
  async function syncStreakToFirebase(data) {
    const userCode = getUserCode();
    if (!userCode || syncInProgress) return;
    
    // Проверяем доступность Firebase
    if (!window.firebaseEnabled || !window.firestore) {
      return;
    }

    syncInProgress = true;
    
    try {
      const firebaseData = {
        ...data,
        code: userCode,
        timestamp: Date.now(),
        lastUpdated: new Date().toISOString()
      };
      
      // Используем compat API (как в phases.html)
      if (window.firestore && window.firestore.collection) {
        await window.firestore
          .collection('users')
          .doc(userCode)
          .collection('streak')
          .doc('data')
          .set(firebaseData, { merge: true });
        console.log('🔥 Streak синхронизирован с Firebase');
      }
      // Используем modular API (как в choice.html)
      else if (window.firebaseModules && window.firebaseModules.doc) {
        const docRef = window.firebaseModules.doc(
          window.firestore, 
          'users', userCode, 
          'streak', 'data'
        );
        await window.firebaseModules.setDoc(docRef, firebaseData, { merge: true });
        console.log('🔥 Streak синхронизирован с Firebase (modular)');
      }
    } catch (e) {
      console.warn('Ошибка синхронизации streak с Firebase:', e);
    } finally {
      syncInProgress = false;
    }
  }

  // Загрузить streak из Firebase
  async function loadStreakFromFirebase() {
    const userCode = getUserCode();
    if (!userCode) return null;
    
    // Проверяем доступность Firebase
    if (!window.firebaseEnabled || !window.firestore) {
      return null;
    }

    try {
      let firebaseData = null;
      
      // Compat API
      if (window.firestore && window.firestore.collection) {
        const doc = await window.firestore
          .collection('users')
          .doc(userCode)
          .collection('streak')
          .doc('data')
          .get();
        
        if (doc.exists) {
          firebaseData = doc.data();
          console.log('🔥 Streak загружен из Firebase');
        }
      }
      // Modular API
      else if (window.firebaseModules && window.firebaseModules.doc) {
        const docRef = window.firebaseModules.doc(
          window.firestore, 
          'users', userCode, 
          'streak', 'data'
        );
        const docSnap = await window.firebaseModules.getDoc(docRef);
        if (docSnap.exists()) {
          firebaseData = docSnap.data();
          console.log('🔥 Streak загружен из Firebase (modular)');
        }
      }
      
      return firebaseData;
    } catch (e) {
      console.warn('Ошибка загрузки streak из Firebase:', e);
      return null;
    }
  }

  // Объединить локальные и Firebase данные (берём лучшие показатели)
  function mergeStreakData(local, firebase) {
    if (!firebase) return local;
    if (!local) return firebase;

    // Объединяем completedDates (уникальные даты из обоих источников)
    const allDates = [...new Set([
      ...(local.completedDates || []),
      ...(firebase.completedDates || [])
    ])].sort();

    // Берём максимальные значения
    return {
      currentStreak: Math.max(local.currentStreak || 0, firebase.currentStreak || 0),
      longestStreak: Math.max(local.longestStreak || 0, firebase.longestStreak || 0),
      lastActiveDate: (local.lastActiveDate > firebase.lastActiveDate) 
        ? local.lastActiveDate 
        : firebase.lastActiveDate,
      completedDates: allDates,
      currentGoal: Math.max(local.currentGoal || 7, firebase.currentGoal || 7),
      goalsCompleted: Math.max(local.goalsCompleted || 0, firebase.goalsCompleted || 0)
    };
  }

  // Инициализация с Firebase
  async function initWithFirebase() {
    if (firebaseLoaded) return;
    
    const userCode = getUserCode();
    if (!userCode) return;
    
    try {
      const firebaseData = await loadStreakFromFirebase();
      if (firebaseData) {
        const localData = getStreakData();
        const mergedData = mergeStreakData(localData, firebaseData);
        
        // Сохраняем объединённые данные локально
        saveStreakDataLocal(mergedData);
        
        // Если данные изменились - синхронизируем обратно
        if (JSON.stringify(mergedData) !== JSON.stringify(firebaseData)) {
          await syncStreakToFirebase(mergedData);
        }
        
        firebaseLoaded = true;
        console.log('🔥 Streak инициализирован с Firebase');
        
        // Обновляем UI
        window.dispatchEvent(new CustomEvent('streakUpdated', { detail: mergedData }));
      }
    } catch (e) {
      console.warn('Ошибка инициализации streak с Firebase:', e);
    }
  }

  // Получить сегодняшнюю дату в формате YYYY-MM-DD
  function getTodayDate() {
    return new Date().toISOString().split('T')[0];
  }

  // Получить вчерашнюю дату
  function getYesterdayDate() {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday.toISOString().split('T')[0];
  }

  // Получить активность за сегодня
  function getTodayActivity() {
    try {
      const data = localStorage.getItem(ACTIVITY_KEY);
      if (!data) return { date: getTodayDate(), wordsAnswered: 0 };
      
      const activity = JSON.parse(data);
      // Если дата не сегодня - сбросить
      if (activity.date !== getTodayDate()) {
        return { date: getTodayDate(), wordsAnswered: 0 };
      }
      return activity;
    } catch (e) {
      return { date: getTodayDate(), wordsAnswered: 0 };
    }
  }

  // Сохранить активность
  function saveTodayActivity(activity) {
    try {
      localStorage.setItem(ACTIVITY_KEY, JSON.stringify(activity));
    } catch (e) {
      console.warn('Ошибка сохранения активности:', e);
    }
  }

  // Добавить ответ на слово
  window.recordWordAnswer = function() {
    const activity = getTodayActivity();
    activity.wordsAnswered++;
    saveTodayActivity(activity);

    // Проверяем, достигли ли цели на сегодня
    if (activity.wordsAnswered === MIN_WORDS_PER_DAY) {
      markTodayComplete();
    }
  };

  // Отметить сегодня как завершённый
  async function markTodayComplete() {
    const data = getStreakData();
    const today = getTodayDate();
    const yesterday = getYesterdayDate();

    // Если сегодня уже отмечен - пропустить
    if (data.completedDates.includes(today)) {
      return;
    }

    // Добавляем сегодня
    data.completedDates.push(today);

    // Проверяем серию
    if (data.lastActiveDate === yesterday) {
      // Продолжаем серию
      data.currentStreak++;
    } else if (data.lastActiveDate !== today) {
      // Начинаем новую серию
      data.currentStreak = 1;
    }

    data.lastActiveDate = today;

    // Обновляем рекорд
    if (data.currentStreak > data.longestStreak) {
      data.longestStreak = data.currentStreak;
    }

    // Проверяем достижение цели
    if (data.currentStreak >= data.currentGoal) {
      data.goalsCompleted++;
      // Следующая цель
      if (data.currentGoal === 7) {
        data.currentGoal = 30; // 1 месяц
      } else {
        data.currentGoal += 30; // +1 месяц
      }
    }

    // Сохраняем локально и в Firebase
    await saveStreakData(data);

    // Отправляем событие
    window.dispatchEvent(new CustomEvent('streakUpdated', { detail: data }));
  }

  // Проверить и обновить серию (вызывать при загрузке)
  window.checkStreak = function() {
    const data = getStreakData();
    const today = getTodayDate();
    const yesterday = getYesterdayDate();

    // Если последняя активность была не вчера и не сегодня - серия прервана
    if (data.lastActiveDate && data.lastActiveDate !== today && data.lastActiveDate !== yesterday) {
      data.currentStreak = 0;
      saveStreakData(data);
    }

    return data;
  };

  // Получить данные для отображения
  window.getStreakInfo = function() {
    const data = getStreakData();
    const activity = getTodayActivity();
    const today = getTodayDate();
    const yesterday = getYesterdayDate();
    
    // Проверяем прерывание серии
    let currentStreak = data.currentStreak;
    if (data.lastActiveDate && data.lastActiveDate !== today && data.lastActiveDate !== yesterday) {
      currentStreak = 0;
    }

    return {
      currentStreak: currentStreak,
      longestStreak: data.longestStreak,
      currentGoal: data.currentGoal,
      goalsCompleted: data.goalsCompleted,
      todayComplete: data.completedDates.includes(today),
      todayWords: activity.wordsAnswered,
      wordsNeeded: MIN_WORDS_PER_DAY,
      completedDates: data.completedDates.slice(-7) // Последние 7 дат
    };
  };

  // Получить последние N дней для отображения
  window.getStreakDays = function(n = 7) {
    const data = getStreakData();
    const days = [];
    const today = new Date();

    for (let i = n - 1; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      days.push({
        date: dateStr,
        day: date.getDate(),
        completed: data.completedDates.includes(dateStr),
        isToday: i === 0
      });
    }

    return days;
  };

  // Принудительная синхронизация с Firebase
  window.syncStreak = async function() {
    await initWithFirebase();
  };

  // Слушаем событие готовности Firebase
  window.addEventListener('firebaseReady', () => {
    console.log('🔥 Firebase готов, инициализируем streak...');
    setTimeout(initWithFirebase, 500);
  });

  // Также пробуем инициализировать через некоторое время после загрузки
  // (на случай если firebaseReady уже был вызван)
  setTimeout(() => {
    if (window.firebaseEnabled && window.firestore && !firebaseLoaded) {
      initWithFirebase();
    }
  }, 2000);

  console.log('🔥 Система серии дней загружена (с поддержкой Firebase)');
})()
