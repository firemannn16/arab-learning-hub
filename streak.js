/**
 * Система серии дней (Streak) для арабских тренажеров
 * Считает день пройденным если пользователь ответил минимум на 5 слов
 * Хранит данные в localStorage (не сбрасывается при сбросе прогресса тренажеров)
 */

(function() {
  'use strict';

  const STREAK_KEY = 'arabStreak';
  const ACTIVITY_KEY = 'arabDailyActivity';
  const MIN_WORDS_PER_DAY = 5;

  // Получить данные серии
  function getStreakData() {
    try {
      const data = localStorage.getItem(STREAK_KEY);
      return data ? JSON.parse(data) : {
        currentStreak: 0,
        longestStreak: 0,
        lastActiveDate: null,
        completedDates: [],
        currentGoal: 7, // Первая цель - 7 дней
        goalsCompleted: 0
      };
    } catch (e) {
      console.warn('Ошибка чтения streak:', e);
      return {
        currentStreak: 0,
        longestStreak: 0,
        lastActiveDate: null,
        completedDates: [],
        currentGoal: 7,
        goalsCompleted: 0
      };
    }
  }

  // Сохранить данные серии
  function saveStreakData(data) {
    try {
      localStorage.setItem(STREAK_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('Ошибка сохранения streak:', e);
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
  function markTodayComplete() {
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

    saveStreakData(data);

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
    const data = checkStreak();
    const activity = getTodayActivity();
    const today = getTodayDate();

    return {
      currentStreak: data.currentStreak,
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

  console.log('🔥 Система серии дней загружена');
})();
