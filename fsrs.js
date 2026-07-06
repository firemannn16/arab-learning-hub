/**
 * FSRS-5 (Free Spaced Repetition Scheduler v5) для браузера
 * Настоящие формулы FSRS-5 + шаги обучения (Learning Steps) как в Anki
 */
(function() {
  'use strict';

  // Дефолтные веса FSRS-5 (w0..w18)
  const DEFAULT_W = [0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192, 1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621];

  // Кривая забывания FSRS-5: R(t) = (1 + FACTOR * t / S) ^ DECAY
  // При t = S вероятность вспомнить ровно 90%
  const DECAY = -0.5;
  const FACTOR = 19 / 81;

  const STATE = { NEW: 0, LEARNING: 1, REVIEW: 2, RELEARNING: 3 };
  const RATING = { AGAIN: 0, HARD: 1, GOOD: 2, EASY: 3 };

  // Шаги обучения (в днях) — как Anki: 1мин, 10мин
  const DEFAULT_STEPS = { learning: [1/1440, 10/1440], relearning: [10/1440] };

  function defaultCard() {
    return {
      state: STATE.NEW,
      stability: 0,
      difficulty: 0,
      elapsedDays: 0,
      scheduledDays: 0,
      reps: 0,
      lapses: 0,
      lastReview: null,
      due: null,
      step: -1       // текущий шаг обучения (-1 = не в обучении)
    };
  }

  function retrievability(elapsedDays, stability) {
    if (stability <= 0) return 0;
    return Math.pow(1 + FACTOR * Math.max(0, elapsedDays) / stability, DECAY);
  }

  function FSRS(w) {
    this.w = (w && w.length === 19) ? w.slice() : DEFAULT_W.slice();
    this.learningSteps = DEFAULT_STEPS.learning.slice();
    this.relearningSteps = DEFAULT_STEPS.relearning.slice();
    this.requestRetention = 0.9; // желаемая вероятность вспомнить в момент повторения
    this.maxInterval = 0;
  }

  FSRS.prototype.repeat = function(card, now) {
    now = now || Date.now();
    const cardCopy = Object.assign({}, card);

    if (cardCopy.state === STATE.NEW) {
      cardCopy.elapsedDays = 0;
    } else {
      cardCopy.elapsedDays = Math.max(0, (now - (cardCopy.lastReview || now)) / 86400000);
    }
    cardCopy.lastReview = now;

    const ratings = {};
    ratings[RATING.AGAIN] = this._compute(cardCopy, RATING.AGAIN, now);
    ratings[RATING.HARD] = this._compute(cardCopy, RATING.HARD, now);
    ratings[RATING.GOOD] = this._compute(cardCopy, RATING.GOOD, now);
    ratings[RATING.EASY] = this._compute(cardCopy, RATING.EASY, now);
    return ratings;
  };

  FSRS.prototype._capInterval = function(interval) {
    const max = this.maxInterval || 0;
    return max > 0 ? Math.min(interval, max) : interval;
  };

  // Интервал (в днях), при котором R упадёт до requestRetention.
  // При retention = 0.9 интервал равен стабильности.
  FSRS.prototype._nextInterval = function(stability) {
    const r = this.requestRetention;
    return (stability / FACTOR) * (Math.pow(r, 1 / DECAY) - 1);
  };

  FSRS.prototype._compute = function(card, rating, now) {
    const w = this.w;
    let next = Object.assign({}, card);
    next.lastReview = now;
    next.due = now;

    let s = 0;
    let d = 0;

    if (card.state === STATE.NEW) {
      d = this._initDifficulty(w, rating);
      s = this._initStability(w, rating);
      next.reps = 1;
      next.lapses = 0;
      if (rating === RATING.EASY) {
        next.state = STATE.REVIEW;
        next.step = -1;
      } else {
        next.state = STATE.LEARNING;
        next.step = 0;
      }

    } else if (card.state === STATE.LEARNING || card.state === STATE.RELEARNING) {
      d = this._nextDifficulty(w, card.difficulty, rating);
      // Стабильность на коротких интервалах (short-term formula FSRS-5)
      const baseS = card.stability > 0 ? card.stability : this._initStability(w, rating);
      s = this._shortTermStability(w, baseS, rating);
      next.reps = card.reps + 1;
      next.lapses = card.lapses;

      if (rating === RATING.AGAIN) {
        next.lapses = (card.lapses || 0) + 1;
        if (next.lapses >= 5) {
          // Защита от бесконечного цикла в сессии: выпускаем с минимальным интервалом
          next.state = STATE.REVIEW;
          next.step = -1;
          s = Math.min(s, 1);
        } else {
          next.step = 0;
          next.state = card.state;
        }
      } else if (rating === RATING.HARD) {
        next.step = Math.max(0, (card.step || 0));
        next.state = card.state;
      } else if (rating === RATING.GOOD) {
        const activeSteps = card.state === STATE.RELEARNING ? this.relearningSteps : this.learningSteps;
        const nextStep = (card.step || 0) + 1;
        if (nextStep >= activeSteps.length) {
          next.state = STATE.REVIEW;
          next.step = -1;
        } else {
          next.step = nextStep;
          next.state = card.state;
        }
      } else {
        // EASY — сразу выпускаем в REVIEW
        next.state = STATE.REVIEW;
        next.step = -1;
      }

    } else if (card.state === STATE.REVIEW) {
      d = this._nextDifficulty(w, card.difficulty, rating);
      const r = retrievability(card.elapsedDays, card.stability);

      if (rating === RATING.AGAIN) {
        s = this._lapseStability(w, card.stability, card.difficulty, r);
        next.lapses = card.lapses + 1;
        next.reps = card.reps + 1;
        next.state = STATE.RELEARNING;
        next.step = 0;
      } else {
        s = this._reviewStability(w, card.stability, card.difficulty, r, rating);
        next.reps = card.reps + 1;
        next.lapses = card.lapses;
        next.state = STATE.REVIEW;
        next.step = -1;
      }
    }

    next.difficulty = d;
    next.stability = s;

    let interval = 0;
    if (next.state === STATE.LEARNING || next.state === STATE.RELEARNING) {
      const activeSteps = next.state === STATE.RELEARNING ? this.relearningSteps : this.learningSteps;
      if (next.step >= 0 && next.step < activeSteps.length) {
        interval = activeSteps[next.step];
      } else {
        interval = Math.max(0.01, this._nextInterval(s));
      }
    } else {
      interval = Math.max(1, Math.round(this._nextInterval(s)));
    }

    next.scheduledDays = this._capInterval(interval);
    next.due = now + next.scheduledDays * 86400000;
    return next;
  };

  // Начальная стабильность: S0(G) = w[G] (w0..w3 — готовые значения в днях)
  FSRS.prototype._initStability = function(w, rating) {
    return Math.max(0.1, w[rating]);
  };

  // Начальная сложность: D0(G) = w4 - e^(w5 * (G-1)) + 1, здесь rating = G-1
  FSRS.prototype._initDifficulty = function(w, rating) {
    return Math.min(10, Math.max(1, w[4] - Math.exp(w[5] * rating) + 1));
  };

  // Следующая сложность: линейное демпфирование + возврат к среднему (FSRS-5)
  FSRS.prototype._nextDifficulty = function(w, difficulty, rating) {
    const d = difficulty > 0 ? difficulty : this._initDifficulty(w, RATING.GOOD);
    const deltaD = -w[6] * (rating - 2);
    const dPrime = d + deltaD * (10 - d) / 9;
    const d0Easy = this._initDifficulty(w, RATING.EASY);
    const dNext = w[7] * d0Easy + (1 - w[7]) * dPrime;
    return Math.min(10, Math.max(1, dNext));
  };

  // Стабильность на коротких интервалах: S' = S * e^(w17 * (G - 3 + w18)), rating = G-1
  FSRS.prototype._shortTermStability = function(w, stability, rating) {
    return Math.max(0.1, stability * Math.exp(w[17] * (rating - 2 + w[18])));
  };

  // Стабильность после успешного повторения (FSRS-5)
  FSRS.prototype._reviewStability = function(w, stability, difficulty, r, rating) {
    const hardPenalty = rating === RATING.HARD ? w[15] : 1;
    const easyBonus = rating === RATING.EASY ? w[16] : 1;
    const sInc = Math.exp(w[8]) *
      (11 - difficulty) *
      Math.pow(stability, -w[9]) *
      (Math.exp(w[10] * (1 - r)) - 1) *
      hardPenalty *
      easyBonus + 1;
    return Math.max(0.1, stability * sInc);
  };

  // Стабильность после забывания (лапс, FSRS-5). Не может превышать прежнюю.
  FSRS.prototype._lapseStability = function(w, stability, difficulty, r) {
    const sNew = w[11] *
      Math.pow(difficulty, -w[12]) *
      (Math.pow(stability + 1, w[13]) - 1) *
      Math.exp(w[14] * (1 - r));
    return Math.max(0.1, Math.min(sNew, stability));
  };

  FSRS.prototype.getDueCards = function(cards, now) {
    now = now || Date.now();
    return cards.filter(c => c.due === null || c.due <= now);
  };

  FSRS.prototype.getRetrievability = function(card, now) {
    now = now || Date.now();
    if (!card.lastReview || card.state === STATE.NEW) return null;
    if (card.stability <= 0) return null;
    const elapsed = (now - card.lastReview) / 86400000;
    return retrievability(elapsed, card.stability);
  };

  window.FSRS = FSRS;
  window.FSRS_STATE = STATE;
  window.FSRS_RATING = RATING;
  window.FSRS_defaultCard = defaultCard;
  window.FSRS_retrievability = retrievability;
})();
