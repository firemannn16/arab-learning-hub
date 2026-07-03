/**
 * FSRS-5 (Free Spaced Repetition Scheduler v5) для браузера
 * Порт алгоритма из py-fsrs
 */
(function() {
  'use strict';

  // Default parameters from FSRS-5 research (19 params)
  const DEFAULT_W = [0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192, 1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621];

  // Card states
  const STATE = { NEW: 0, LEARNING: 1, REVIEW: 2, RELEARNING: 3 };

  // Rating labels
  const RATING = { AGAIN: 0, HARD: 1, GOOD: 2, EASY: 3 };

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
      due: null
    };
  }

  function FSRS(w) {
    this.w = w || DEFAULT_W;
  }

  FSRS.prototype.repeat = function(card, now) {
    now = now || Date.now();
    const s = this;
    const cardCopy = Object.assign({}, card);
    
    if (cardCopy.state === STATE.NEW) {
      cardCopy.elapsedDays = 0;
    } else {
      cardCopy.elapsedDays = (now - (cardCopy.lastReview || now)) / 86400000;
    }
    cardCopy.lastReview = now;

    const ratings = {};
    ratings[RATING.AGAIN] = s._compute(cardCopy, RATING.AGAIN, now);
    ratings[RATING.HARD] = s._compute(cardCopy, RATING.HARD, now);
    ratings[RATING.GOOD] = s._compute(cardCopy, RATING.GOOD, now);
    ratings[RATING.EASY] = s._compute(cardCopy, RATING.EASY, now);

    return ratings;
  };

  FSRS.prototype._compute = function(card, rating, now) {
    const w = this.w;
    let next = Object.assign({}, card);
    next.lastReview = now;
    next.due = now;

    // Initial stability
    let s = 0;
    let d = 0;

    if (card.state === STATE.NEW) {
      // First rating for a new card
      d = this._initDifficulty(w, rating);
      s = this._initStability(w, rating, d);
      
      next.state = STATE.LEARNING;
      next.reps = 1;
      next.lapses = 0;
    } else {
      // Review or relearning
      d = this._nextDifficulty(w, card.difficulty, card.state, card.lapses, rating);
      
      if (card.state === STATE.LEARNING) {
        // Still in learning
        s = this._learningStability(w, card.stability, rating, d);
        next.reps = card.reps + 1;
        next.lapses = card.lapses;
      } else if (card.state === STATE.REVIEW || card.state === STATE.RELEARNING) {
        if (rating === RATING.AGAIN) {
          // Lapse
          s = this._lapseStability(w, card.stability, card.difficulty, card.elapsedDays, card.lapses + 1, d);
          next.lapses = card.lapses + 1;
          next.reps = 0;
          next.state = STATE.RELEARNING;
        } else {
          // Successful review
          s = this._reviewStability(w, card.stability, card.difficulty, card.elapsedDays, card.lapses, rating, d);
          next.reps = card.reps + 1;
          next.lapses = card.lapses;
          next.state = STATE.REVIEW;
        }
      }
    }

    next.difficulty = d;
    next.stability = s;

    // Calculate interval
    let interval = 0;
    if (next.state === STATE.LEARNING) {
      interval = this._learningInterval(rating, s, d, w);
    } else {
      interval = Math.round(s);
    }

    // Minimum interval for review cards
    if (next.state === STATE.REVIEW) {
      interval = Math.max(1, interval);
    }

    next.scheduledDays = interval;
    next.due = now + interval * 86400000;

    return next;
  };

  // Initialize difficulty based on first rating
  FSRS.prototype._initDifficulty = function(w, rating) {
    const init = w[2]; // initial difficulty
    const delta = w[3] * (rating - 2); // adjust by rating
    return Math.min(10, Math.max(1, init + delta));
  };

  // Initialize stability based on first rating
  FSRS.prototype._initStability = function(w, rating, difficulty) {
    const s0 = Math.max(0.1, w[0] + w[1] * (rating - 1));
    return s0;
  };

  // Next difficulty after review
  FSRS.prototype._nextDifficulty = function(w, difficulty, state, lapses, rating) {
    let d = difficulty;
    // Mean reversion
    const mean = w[2];
    d = mean + (d - mean) * (1 - w[7]);
    // Delta based on rating
    let delta = w[4] * (rating - 2);
    if (rating === RATING.AGAIN) {
      delta = w[4] * (-1);
    }
    d = d + delta;
    // Hard factor
    if (rating === RATING.HARD) {
      d = d + w[5];
    }
    // Easy factor
    if (rating === RATING.EASY) {
      d = d + w[6];
    }
    return Math.min(10, Math.max(1, d));
  };

  // Stability during learning
  FSRS.prototype._learningStability = function(w, stability, rating, difficulty) {
    return w[8] + w[9] * (rating - 1);
  };

  // Stability increase after successful review
  FSRS.prototype._reviewStability = function(w, stability, difficulty, elapsed, lapses, rating, newDifficulty) {
    const r = Math.min(elapsed / stability, 1);
    const a = Math.pow(1 + w[10] * (1 - r), w[11] + w[12] * (difficulty - 5) + w[13] * (lapses + 1) * r);
    const b = Math.exp(w[14] * (newDifficulty - 5));
    const c = Math.exp(w[15] * (rating - 2));
    return stability * a * b * c;
  };

  // Stability after lapse (forgotten card)
  FSRS.prototype._lapseStability = function(w, stability, difficulty, elapsed, lapses, newDifficulty) {
    const r = Math.min(elapsed / stability, 1);
    const a = Math.pow(r, w[16]);
    const b = Math.exp(w[17] * (newDifficulty - 5));
    const c = Math.exp(w[18] * (lapses + 1));
    return Math.max(0.1, stability * a * b * c);
  };

  // Interval during learning phase
  FSRS.prototype._learningInterval = function(rating, stability, difficulty, w) {
    if (rating === RATING.AGAIN) {
      return 0.01; // ~15 minutes
    }
    if (rating === RATING.HARD) {
      return 0.1; // ~2.4 hours
    }
    if (rating === RATING.GOOD) {
      return 1; // 1 day
    }
    return 3; // 3 days for easy
  };

  // Get cards due for review
  FSRS.prototype.getDueCards = function(cards, now) {
    now = now || Date.now();
    return cards.filter(c => c.due === null || c.due <= now);
  };

  // Get retrieval probability for a card
  FSRS.prototype.getRetrievability = function(card, now) {
    now = now || Date.now();
    if (!card.lastReview || card.state === STATE.NEW) return null;
    const elapsed = (now - card.lastReview) / 86400000;
    if (card.stability <= 0) return null;
    return Math.pow(1 + Math.pow(0.9, -1 / 0.25) * elapsed / card.stability, -0.25);
  };

  // Export
  window.FSRS = FSRS;
  window.FSRS_STATE = STATE;
  window.FSRS_RATING = RATING;
  window.FSRS_defaultCard = defaultCard;

  console.log('FSRS-5 loaded');
})();
