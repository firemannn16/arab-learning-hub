/**
 * 🆕 Система "Новые слова"
 * Сравнивает текущий words.txt с сохранённым снапшотом (база) и возвращает:
 *  - новые слова (которых раньше не было)
 *  - изменённые слова (огласовки / перевод / формы)
 * Снапшот хранится в localStorage (кэш) и в Firestore (как избранное), чтобы
 * база была общей для всех устройств пользователя.
 * "Очистить" = принять текущий words.txt как новую базу.
 */
(function (global) {
  'use strict';

  var LS_KEY = 'arabNewWordsSnapshotNorms';
  var LS_TS_KEY = 'arabNewWordsTs';

  var cachedResult = null;
  var refreshing = null;
  // Последняя ошибка обмена с облаком. Раньше любая ошибка Firestore молча
  // проглатывалась и подменялась локальным снапшотом — из-за этого не
  // работала синхронизация между устройствами, и原因 был не виден.
  var lastCloudError = null;

  // ---------- Нормализация ----------

  // Приводим строку слова к единому виду: тире -> "-", лишние пробелы убираем.
  // Регистр НЕ трогаем: смена "дом" -> "Дом" тоже должна считаться правкой.
  function normLine(s) {
    s = String(s || '');
    s = s.replace(/^\uFEFF/, '');
    s = s.replace(/[\u2010-\u2015\u2013\u2014\u2212\u002D]/g, '-');
    s = s.replace(/\s*-\s*/g, ' - ');
    s = s.replace(/\s+/g, ' ').trim();
    return s;
  }

  // Убрать огласовки и знаки чтения из арабского текста
  function stripHarakat(text) {
    return String(text || '').replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7-\u06E8\u06EA-\u06ED\u08D3-\u08FF]/g, '');
  }

  // Разбить нормализованную строку на русскую часть и арабскую
  function splitLine(norm) {
    var sep = norm.indexOf(' - ');
    if (sep === -1) return null;
    return {
      ru: norm.slice(0, sep).trim(),
      ar: norm.slice(sep + 3).trim()
    };
  }

  // Приводит арабскую форму к каноничному виду, чтобы разные способы
  // набрать одно и то же слово сравнивались одинаково:
  //   огласовки и татвель  |  presentation forms (ﻻ) -> لا  |  знаки чтения
  //   أ إ آ ٱ -> ا   |   ى -> ي   |   ؤ -> و   |   ئ -> ي   |   ة -> ه
  function normArabic(s) {
    s = String(s || '');
    if (s.normalize) s = s.normalize('NFKC');
    s = stripHarakat(s);
    s = s.replace(/[ـ]/g, '');                       // татвель
    s = s.replace(/[أإآٱٲٳٵ]/g, '\u0627');   // алиф с хамзой -> алиф
    s = s.replace(/[ىۍيې]/g, '\u064A');   // максура -> йа
    s = s.replace(/ؤ/g, '\u0648');                            // хамза на вау -> вау
    s = s.replace(/ئ/g, '\u064A');                            // хамза на йа -> йа
    s = s.replace(/ة/g, '\u0647');                            // та марбута -> ха
    s = s.replace(/[^\u0600-\u06FF0-9\s]/g, '');
    s = s.replace(/\s+/g, ' ').trim();
    return s;
  }

  // Все арабские формы строки в каноничном виде: ["بيت", "بيوت", "بيت"].
  // Если разделителя нет или справа от него не арабский текст, берём первый
  // арабский блок строки — так строка "- بيت" или "بيت, дом" тоже узнаётся.
  function arForms(norm) {
    var parts = splitLine(norm);
    if (parts && parts.ar) {
      var forms = parts.ar.split(' - ').map(normArabic).filter(function (f) { return f; });
      if (forms.length) return forms;
    }
    var run = String(norm).match(/[\u0600-\u06FF][\u0600-\u06FF\u0640\u064B-\u065F\s\u06D6-\u06ED]*/);
    if (run) {
      var only = normArabic(run[0]);
      if (only) return [only];
    }
    run = String(norm).match(/[-–—]\s*([^\s-–—]+(?:\s+[^\s-–—]+)*)/);
    if (run) {
      var only2 = normArabic(run[1]);
      if (only2) return [only2];
    }
    return null;
  }

  // Русская часть нормализованной строки
  function ruOf(norm) {
    var parts = splitLine(norm);
    return parts ? parts.ru : null;
  }

  // Слова внутри русского перевода (для "жилище, дом" -> ["жилище", "дом"])
  function ruTokens(ru) {
    return String(ru || '')
      .split(/[^\u0430-\u044f\u0410-\u042f0-9]+/i)
      .filter(function (t) { return t.length >= 2; });
  }

  // 0..1, насколько строки похожи (1 - расстояние Левенштейна / длина)
  function strSimilarity(a, b) {
    a = String(a || '');
    b = String(b || '');
    if (a === b) return 1;
    var m = a.length, n = b.length;
    if (!m || !n) return 0;
    var prev = new Array(n + 1);
    var cur = new Array(n + 1);
    for (var j = 0; j <= n; j++) prev[j] = j;
    for (var i = 1; i <= m; i++) {
      cur[0] = i;
      for (var j = 1; j <= n; j++) {
        var cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      }
      var tmp = prev; prev = cur; cur = tmp;
    }
    return 1 - prev[n] / Math.max(m, n);
  }

  // Является ли short подпоследовательностью long (буквы сохранились по порядку).
  // Ловит выкинутые буквы: "дом" -> "ом", "окно" -> "кно".
  function isSubsequence(short, long) {
    if (short.length > long.length) return false;
    var i = 0;
    for (var j = 0; j < long.length && i < short.length; j++) {
      if (short.charAt(i) === long.charAt(j)) i++;
    }
    return i === short.length;
  }

  // Считаем ли русские части одним и тем же переводом: опечатки
  // ("ом" вместо "дом"), пропавшая/добавленная форма ("дома") и новый
  // синоним в переводе ("жилище, дом"). Регистр не важен.
  function ruRelated(a, b) {
    a = String(a || '').toLowerCase();
    b = String(b || '').toLowerCase();
    if (a === b) return true;
    var ta = ruTokens(a);
    var tb = ruTokens(b);
    for (var i = 0; i < ta.length; i++) {
      for (var j = 0; j < tb.length; j++) {
        // одно слово перевода совпало с другим ("жилище, дом" ⊃ "дом")
        if (ta[i] === tb[j]) return true;
        // слово внутри слова, от 3 букв ("дома" ⊃ "дом")
        if (ta[i].length >= 3 && tb[j].length >= 3 &&
            (ta[i].indexOf(tb[j]) === 0 || tb[j].indexOf(ta[i]) === 0)) {
          return true;
        }
      }
    }
    // выкинули буквы из перевода ("дом" -> "ом")
    var shorter = a.length <= b.length ? a : b;
    var longer = a.length <= b.length ? b : a;
    if (shorter.length >= 2 && shorter.length / longer.length >= 0.5 &&
        isSubsequence(shorter, longer)) {
      return true;
    }
    // заменили букву ("дом" -> "дём")
    return strSimilarity(a, b) >= 0.6;
  }

  // Есть ли между двумя строками общее арабское слово (с точностью до огласовок,
  // хамзы, максуры, татвеля) или хотя бы одна почти одинаковая форма.
  // Арабская часть решает, то же это слово или совсем другое.
  function arRelated(formsA, formsB) {
    if (!formsA || !formsB) return false;
    for (var i = 0; i < formsA.length; i++) {
      for (var j = 0; j < formsB.length; j++) {
        if (formsA[i] === formsB[j]) return true;
        // опечатка в арабском слове: "بيت" -> "بيتن"
        if (formsA[i].length >= 3 && formsB[j].length >= 3 &&
            strSimilarity(formsA[i], formsB[j]) >= 0.75) {
          return true;
        }
      }
    }
    return false;
  }

  // ---------- Firebase (как в favorites.js) ----------

  function getUserCode() {
    try {
      if (global.auth && global.auth.isLoggedIn && global.auth.isLoggedIn()) {
        return global.auth.getUserId ? global.auth.getUserId() : '';
      }
      return '';
    } catch (e) {
      return '';
    }
  }

  function canUseFirebase() {
    return !!(global.firebaseEnabled && global.firestore && getUserCode());
  }

  function getFirebaseContext() {
    if (!canUseFirebase()) return null;
    var code = getUserCode();
    var firestore = global.firestore;
    var fm = global.firebaseModules || {};

    // Compat API (firebase.firestore.*)
    if (firestore && typeof firestore.collection === 'function') {
      // Обращаемся к firebase через global: голое имя firebase отсутствует,
      // если SDK грузится модульно, и обрывало весь расчёт исключением.
      var fbs = global.firebase;
      var fv = fbs && fbs.firestore && fbs.firestore.FieldValue;
      return {
        mode: 'compat',
        ref: firestore
          .collection('users')
          .doc(code)
          .collection('newwords')
          .doc('data'),
        serverTimestamp: (typeof fv === 'function' && fv.serverTimestamp)
          ? fv.serverTimestamp()
          : new Date()
      };
    }

    // Modular API
    if (fm.doc && fm.getDoc && fm.setDoc) {
      var serverTimestampFn = fm.serverTimestamp
        ? fm.serverTimestamp
        : (fm.Timestamp && typeof fm.Timestamp.now === 'function')
          ? fm.Timestamp.now
          : (function () { return Date.now(); });
      return {
        mode: 'modular',
        ref: fm.doc(firestore, 'users', code, 'newwords', 'data'),
        getDoc: fm.getDoc,
        setDoc: fm.setDoc,
        serverTimestamp: serverTimestampFn
      };
    }

    return null;
  }

  function toMillis(v) {
    if (v && typeof v.toMillis === 'function') return v.toMillis();
    if (typeof v === 'number' && isFinite(v)) return v;
    return 0;
  }

  function readLocal() {
    try {
      var normsRaw = localStorage.getItem(LS_KEY);
      var ts = Number(localStorage.getItem(LS_TS_KEY) || '0');
      if (!normsRaw) return null;
      var norms = JSON.parse(normsRaw);
      if (!Array.isArray(norms)) return null;
      return { norms: norms, ts: isFinite(ts) ? ts : 0 };
    } catch (e) {
      console.warn('🆕 Ошибка чтения локального снапшота:', e);
      return null;
    }
  }

  function writeLocal(norms, ts) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(norms || []));
      localStorage.setItem(LS_TS_KEY, String(ts || Date.now()));
    } catch (e) {
      console.warn('🆕 Ошибка сохранения локального снапшота:', e);
    }
  }

  async function readCloud() {
    var ctx = getFirebaseContext();
    if (!ctx) return null;
    if (ctx.mode === 'compat') {
      var snap = await ctx.ref.get();
      if (!snap.exists) return null;
      var data = snap.data() || {};
      return {
        norms: Array.isArray(data.norms) ? data.norms : [],
        updatedAt: toMillis(data.updatedAt)
      };
    }
    if (ctx.getDoc) {
      var modularSnap = await ctx.getDoc(ctx.ref);
      if (!modularSnap.exists()) return null;
      var d = modularSnap.data() || {};
      return {
        norms: Array.isArray(d.norms) ? d.norms : [],
        updatedAt: toMillis(d.updatedAt)
      };
    }
    return null;
  }

  async function writeCloud(norms, opts) {
    var ctx = getFirebaseContext();
    if (!ctx) return;
    var onlyIfMissing = !!(opts && opts.onlyIfMissing);
    try {
      // onlyIfMissing: база должна появиться в облаке лишь однажды. Проверяем
      // это отдельно, потому что set с merge создал бы документ поверх чужой
      // базы на том устройстве, где её ещё не было.
      if (onlyIfMissing) {
        var existing = null;
        if (ctx.mode === 'compat') {
          existing = await ctx.ref.get();
          if (existing && existing.exists) return;
        } else if (ctx.getDoc) {
          var exSnap = await ctx.getDoc(ctx.ref);
          if (exSnap && exSnap.exists()) return;
        } else {
          return;
        }
      }
      if (ctx.mode === 'compat') {
        await ctx.ref.set({ norms: norms, updatedAt: ctx.serverTimestamp }, { merge: true });
      } else if (ctx.setDoc) {
        await ctx.setDoc(ctx.ref, { norms: norms, updatedAt: ctx.serverTimestamp() }, { merge: true });
      }
      lastCloudError = null;
    } catch (e) {
      lastCloudError = e;
      console.warn('🆕 Ошибка записи снапшота в облако:', e && (e.code || e.message) || e, e);
    }
  }

  function describeError(e) {
    if (!e) return '';
    var code = e.code || '';
    var msg = e.message || String(e);
    if (/permission|insufficient/i.test(code + ' ' + msg)) {
      return 'Нет доступа к облаку (правила Firestore). Проверь правило для users/{id}/newwords/data';
    }
    if (/unavailable|network|deadline/i.test(code + ' ' + msg)) return 'Нет связи с Firestore';
    if (/not-found|404/i.test(code + ' ' + msg)) return 'Документ не найден';
    return (code ? code + ': ' : '') + msg;
  }

  // Снапшот — общая база для всех устройств, поэтому при наличии облака
  // доверяем ему, а не локальной копии. Раньше выбор шёл по метке времени:
  // телефон успевал записать к себе локальную базу позже, чем ПК обновлял
  // облако, и свежая по времени копия перебивала настоящую общую базу.
  // Локальный снапшот остаётся запасным вариантом для офлайна и на случай,
  // когда в облаке записи ещё нет.
  async function loadSnapshot() {
    var local = readLocal();
    var result = local;

    if (canUseFirebase()) {
      try {
        var cloud = await readCloud();
        var cloudNorms = cloud && Array.isArray(cloud.norms) ? cloud.norms : null;
        if (cloudNorms && cloudNorms.length) {
          lastCloudError = null;
          result = { norms: cloudNorms, ts: (cloud && cloud.updatedAt) || 0 };
          if (!local || !local.norms || local.norms.length !== cloudNorms.length ||
              JSON.stringify(local.norms) !== JSON.stringify(cloudNorms)) {
            writeLocal(result.norms, result.ts || Date.now());
          }
        } else if (result && result.norms && result.norms.length) {
          // В облаке ещё нет базы — поднимаем локальную на все устройства.
          await writeCloud(result.norms);
        }
      } catch (e) {
        lastCloudError = e;
        console.warn('🆕 Ошибка чтения снапшота из облака:', e && (e.code || e.message) || e, e);
      }
    }

    return result;
  }

  // ---------- Загрузка текущих строк из words.txt ----------
  async function fetchCurrentLines() {
    var response = await fetch('words.txt');
    if (!response.ok) throw new Error('Не удалось загрузить words.txt');
    var text = await response.text();
    return text.split(/\r?\n/)
      .map(function (l) { return l.trim(); })
      .filter(function (l) { return l && !l.startsWith('#'); });
  }

  // ---------- Diff ----------
  // Идея: строка изменилась, если арабское слово осталось узнаваемым.
  // Отличаем "правку" от "нового слова" по тому, осталась ли старая строка
  // в файле: если исчезла — это правка, если на месте — добавили новое.
  function computeDiff(currentLines, prevNorms) {
    // База всегда пишется нормализованной, но не полагаемся на это:
    // старый или облачный снапшот мог прийти сырым.
    prevNorms = prevNorms.map(normLine);

    // Сравниваем строки БЕЗ учёта регистра. Снапшоты, записанные прошлой
    // версией, лежат в localStorage целиком в нижнем регистре (там был
    // .toLowerCase()). Без fold() каждое слово с заглавной буквы в переводе
    // не совпало бы с точной копией в базе и помечалось как «изменённое».
    function fold(s) { return String(s || '').toLowerCase(); }

    var currentNorms = currentLines.map(normLine);
    var currentSet = new Set(currentNorms.map(fold));
    var base = prevNorms;

    // Какие базовые строки всё ещё присутствуют в текущем файле
    var stillThere = new Set();
    base.forEach(function (n) { if (currentSet.has(fold(n))) stillThere.add(fold(n)); });

    // Базовые строки, которые ещё не сопоставлены
    var openBase = new Set();
    base.forEach(function (n, i) { openBase.add(i); });

    // Арабская форма -> индексы базовых строк с такой формой
    var byForm = new Map();
    var baseForms = new Array(base.length);
    base.forEach(function (n, i) {
      var forms = arForms(n);
      baseForms[i] = forms;
      if (!forms) return;
      forms.forEach(function (f) {
        if (!byForm.has(f)) byForm.set(f, []);
        byForm.get(f).push(i);
      });
    });

    var result = new Array(currentLines.length).fill(null);

    // Проход 1: точное совпадение всей строки -> не изменилась
    var exactPool = new Map();
    base.forEach(function (n, i) {
      var k = fold(n);
      if (!exactPool.has(k)) exactPool.set(k, []);
      exactPool.get(k).push(i);
    });
    currentNorms.forEach(function (norm, ci) {
      var pool = exactPool.get(fold(norm));
      while (pool && pool.length) {
        var bi = pool.shift();
        if (openBase.has(bi)) {
          openBase.delete(bi);
          result[ci] = { index: ci, kind: 'unchanged', prev: base[bi] };
          return;
        }
      }
    });

    // Проход 2: всё остальное ищем по арабской части
    currentNorms.forEach(function (norm, ci) {
      if (result[ci]) return;
      var forms = arForms(norm);
      var ru = ruOf(norm);
      var candidates = [];
      var seen = new Set();

      if (forms) {
        forms.forEach(function (f) {
          (byForm.get(f) || []).forEach(function (bi) { if (!seen.has(bi)) { seen.add(bi); candidates.push(bi); } });
        });
      } else {
        base.forEach(function (_n, bi) { if (!seen.has(bi)) { seen.add(bi); candidates.push(bi); } });
      }

      // Арабскую часть не нашли или она не сошлась — пробуем перевод
      if (!forms) {
        candidates = candidates.filter(function (bi) {
          if (baseForms[bi] && arRelated(forms, baseForms[bi])) return true;
          return ruRelated(ru || norm, ruOf(base[bi]) || base[bi]);
        });
      } else {
        candidates = candidates.filter(function (bi) {
          if (baseForms[bi]) return arRelated(forms, baseForms[bi]);
          return ruRelated(ru || norm, ruOf(base[bi]) || base[bi]);
        });
      }
      candidates = candidates.filter(function (bi) { return openBase.has(bi); });
      if (!candidates.length) return;

      // Старые строки, которые уже исчезли из файла, — это правки.
      // Оставшиеся на месте — значит добавили новое слово, а не переписали.
      var gone = candidates.filter(function (bi) { return !stillThere.has(fold(base[bi])); });
      var pool = gone.length ? gone : [];
      if (!pool.length) {
        // Правок не нашлось, но строка похожа на ещё существующую:
        // пользователь добавил новое слово, а старую оставил.
        result[ci] = { index: ci, kind: 'new' };
        return;
      }

      // Из нескольких кандидатов берём самый близкий по переводу
      var best = pool[0];
      if (ru) {
        for (var i = 1; i < pool.length; i++) {
          var a = ru || norm, b = ruOf(base[pool[i]]);
          if (b && !ruRelated(ru, ruOf(base[best])) && ruRelated(a, b)) best = pool[i];
        }
      }
      openBase.delete(best);
      result[ci] = { index: ci, kind: 'changed', prev: base[best] };
    });

    var items = [];
    for (var ci2 = 0; ci2 < currentLines.length; ci2++) {
      if (result[ci2] && result[ci2].kind === 'unchanged') continue;
      items.push({
        line: currentLines[ci2],
        norm: currentNorms[ci2],
        kind: result[ci2] ? result[ci2].kind : 'new',
        prev: result[ci2] ? result[ci2].prev : undefined
      });
    }
    return items;
  }

  // ---------- Публичный API ----------

  async function refresh() {
    if (refreshing) return refreshing;
    refreshing = (async function () {
      try {
        var lines = await fetchCurrentLines();
        if (lines.length === 0) {
          cachedResult = { items: [], error: 'empty' };
          return cachedResult;
        }
        var snapshot = await loadSnapshot();
        if (!snapshot || !snapshot.norms || snapshot.norms.length === 0) {
          // Первый запуск: берём текущий список как базу, ничего не показываем.
          // База общая, поэтому записываем её в облако только когда правки
          // пользователя ещё нигде нет: иначе новый телефон затёр бы список
          // «новых слов», посчитанный на другом устройстве.
          var baseNorms = lines.map(normLine);
          var now = Date.now();
          writeLocal(baseNorms, now);
          if (canUseFirebase()) writeCloud(baseNorms, { onlyIfMissing: true });
          cachedResult = { items: [], firstRun: true };
          return cachedResult;
        }
        cachedResult = { items: computeDiff(lines, snapshot.norms) };
        return cachedResult;
      } catch (e) {
        console.warn('🆕 Ошибка расчёта новых слов:', e);
        cachedResult = { items: [], error: (e && e.message) || 'error' };
        return cachedResult;
      } finally {
        refreshing = null;
      }
    })();
    return refreshing;
  }

  // Принять текущий words.txt как новую базу
  async function accept() {
    var lines = await fetchCurrentLines();
    var norms = lines.map(normLine);
    var now = Date.now();
    writeLocal(norms, now);
    if (canUseFirebase()) writeCloud(norms);
    cachedResult = { items: [] };
    return cachedResult;
  }

  function count() {
    if (!cachedResult || !cachedResult.items) return 0;
    return cachedResult.items.length;
  }

  function copyText() {
    if (!cachedResult || !cachedResult.items) return '';
    return cachedResult.items.map(function (item) { return item.line; }).join('\n');
  }

  // Результат зависит от того, вошёл ли пользователь: без авторизации облако
  // не читается. Поэтому сбрасываем кэш и пересчитываем, как только вход
  // подтвердится или Firebase дозагрузится.
  function invalidate() {
    cachedResult = null;
  }

  function resync() {
    invalidate();
    return refresh();
  }

  global.NewWords = {
    refresh: refresh,
    resync: resync,
    invalidate: invalidate,
    accept: accept,
    count: count,
    copyText: copyText,
    get result() { return cachedResult; },
    get cloudError() { return lastCloudError; },
    cloudErrorText: function () { return describeError(lastCloudError); }
  };

  // Страница должна успеть подписаться на это событие до первого refresh(),
  // поэтому подписываемся сразу, а сам пересчёт откладываем в макрозадачу.
  function scheduleResync() {
    setTimeout(function () {
      if (!canUseFirebase()) return;
      resync().then(function (r) {
        try { global.dispatchEvent(new CustomEvent('newWordsUpdated', { detail: r })); } catch (e) {}
      });
    }, 0);
  }

  global.addEventListener('authChanged', scheduleResync);
  global.addEventListener('firebaseReady', scheduleResync);

  console.log('🆕 Система новых слов загружена');
})(window);