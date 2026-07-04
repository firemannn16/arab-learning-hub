/**
 * FSRS-5 (Free Spaced Repetition Scheduler v5) для браузера
 * С шагами обучения (Learning Steps) как в Anki
 */
(function() {
  'use strict';

  const DEFAULT_W = [0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192, 1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621];

  const STATE = { NEW: 0, LEARNING: 1, REVIEW: 2, RELEARNING: 3 };
  const RATING = { AGAIN: 0, HARD: 1, GOOD: 2, EASY: 3 };

  // Шаги обучения (в днях): 1мин, 10мин, 1день
  const DEFAULT_STEPS = [1/1440, 10/1440, 1];

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

  function FSRS(w) {
    this.w = w || DEFAULT_W;
    this.steps = DEFAULT_STEPS.slice();
  }

  FSRS.prototype.repeat = function(card, now) {
    now = now || Date.now();
    const cardCopy = Object.assign({}, card);

    if (cardCopy.state === STATE.NEW) {
      cardCopy.elapsedDays = 0;
    } else {
      cardCopy.elapsedDays = (now - (cardCopy.lastReview || now)) / 86400000;
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

  FSRS.prototype._compute = function(card, rating, now) {
    const w = this.w;
    const steps = this.steps;
    let next = Object.assign({}, card);
    next.lastReview = now;
    next.due = now;

    let s = 0;
    let d = 0;

    if (card.state === STATE.NEW) {
      d = this._initDifficulty(w, rating);
      s = this._initStability(w, rating, d);
      next.state = STATE.LEARNING;
      next.reps = 1;
      next.lapses = 0;
      next.step = 0;

    } else {
      d = this._nextDifficulty(w, card.difficulty, card.state, card.lapses, rating);

      if (card.state === STATE.LEARNING || card.state === STATE.RELEARNING) {
        s = this._learningStability(w, card.stability, rating, d);
        next.reps = card.reps + 1;
        next.lapses = card.lapses;

        if (rating === RATING.AGAIN) {
          next.step = 0;
          next.state = STATE.LEARNING;
        } else if (rating === RATING.HARD) {
          next.step = Math.max(0, (card.step || 0));
          next.state = STATE.LEARNING;
        } else if (rating === RATING.GOOD) {
          const nextStep = (card.step || 0) + 1;
          if (nextStep >= steps.length) {
            next.state = STATE.REVIEW;
            next.step = -1;
          } else {
            next.step = nextStep;
            next.state = STATE.LEARNING;
          }
        } else {
          // EASY — выпустить сразу
          s = Math.max(s, this._reviewStability(w, card.stability, d, card.elapsedDays, card.lapses, rating, d));
          next.state = STATE.REVIEW;
          next.step = -1;
        }

      } else if (card.state === STATE.REVIEW) {
        if (rating === RATING.AGAIN) {
          s = this._lapseStability(w, card.stability, card.difficulty, card.elapsedDays, card.lapses + 1, d);
          next.lapses = card.lapses + 1;
          next.reps = 0;
          next.state = STATE.RELEARNING;
          next.step = 0;
        } else {
          s = this._reviewStability(w, card.stability, card.difficulty, card.elapsedDays, card.lapses, rating, d);
          next.reps = card.reps + 1;
          next.lapses = card.lapses;
          next.state = STATE.REVIEW;
          next.step = -1;
        }
      }
    }

    next.difficulty = d;
    next.stability = s;

    let interval = 0;
    if (next.state === STATE.LEARNING || next.state === STATE.RELEARNING) {
      if (next.step >= 0 && next.step < steps.length) {
        interval = steps[next.step];
      } else {
        interval = Math.max(0.01, s);
      }
    } else {
      interval = Math.round(s);
    }

    if (next.state === STATE.REVIEW) {
      interval = Math.max(1, interval);
    }

    next.scheduledDays = this._capInterval(interval);
    next.due = now + next.scheduledDays * 86400000;
    return next;
  };

  FSRS.prototype._initDifficulty = function(w, rating) {
    return Math.min(10, Math.max(1, w[2] + w[3] * (rating - 2)));
  };

  FSRS.prototype._initStability = function(w, rating, difficulty) {
    return Math.max(0.1, w[0] + w[1] * (rating - 1));
  };

  FSRS.prototype._nextDifficulty = function(w, difficulty, state, lapses, rating) {
    let d = difficulty;
    const mean = w[2];
    d = mean + (d - mean) * (1 - w[7]);
    let delta = w[4] * (rating === RATING.AGAIN ? -1 : (rating - 2));
    d = d + delta;
    if (rating === RATING.HARD) d = d + w[5];
    if (rating === RATING.EASY) d = d + w[6];
    return Math.min(10, Math.max(1, d));
  };

  FSRS.prototype._learningStability = function(w, stability, rating, difficulty) {
    return w[8] + w[9] * (rating - 1);
  };

  FSRS.prototype._reviewStability = function(w, stability, difficulty, elapsed, lapses, rating, newDifficulty) {
    const r = Math.min(elapsed / stability, 1);
    const a = Math.pow(1 + w[10] * (1 - r), w[11] + w[12] * (difficulty - 5) + w[13] * (lapses + 1) * r);
    const b = Math.exp(w[14] * (newDifficulty - 5));
    const c = Math.exp(w[15] * (rating - 2));
    return stability * a * b * c;
  };

  FSRS.prototype._lapseStability = function(w, stability, difficulty, elapsed, lapses, newDifficulty) {
    const r = Math.min(elapsed / stability, 1);
    const a = Math.pow(r, w[16]);
    const b = Math.exp(w[17] * (newDifficulty - 5));
    const c = Math.exp(w[18] * (lapses + 1));
    return Math.max(0.1, stability * a * b * c);
  };

  FSRS.prototype.getDueCards = function(cards, now) {
    now = now || Date.now();
    return cards.filter(c => c.due === null || c.due <= now);
  };

  FSRS.prototype.getRetrievability = function(card, now) {
    now = now || Date.now();
    if (!card.lastReview || card.state === STATE.NEW) return null;
    const elapsed = (now - card.lastReview) / 86400000;
    if (card.stability <= 0) return null;
    return Math.pow(1 + Math.pow(0.9, -1 / 0.25) * elapsed / card.stability, -0.25);
  };

  window.FSRS = FSRS;
  window.FSRS_STATE = STATE;
  window.FSRS_RATING = RATING;
  window.FSRS_defaultCard = defaultCard;

  console.log('FSRS-5 loaded');
})();
