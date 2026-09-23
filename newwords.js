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

  // ---------- Нормализация ----------

  // Приводим строку слова к единому виду: тире -> "-", лишние пробелы убираем, в нижний регистр
  function normLine(s) {
    s = String(s || '');
    s = s.replace(/^\uFEFF/, '');
    s = s.replace(/[\u2010-\u2015\u2013\u2014\u2212\u002D]/g, '-');
    s = s.replace(/\s*-\s*/g, ' - ');
    s = s.replace(/\s+/g, ' ').trim().toLowerCase();
    return s;
  }

  // Убрать огласовки из арабского текста
  function stripHarakat(text) {
    return String(text || '').replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7-\u06E8\u06EA-\u06ED]/g, '');
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

  // Ключ "того же слова" для определения "изменено", а не "новое".
  // Русская часть + первое арабское слово без огласовок.
  function lineKey(norm) {
    var parts = splitLine(norm);
    if (!parts) return null;
    var firstAr = parts.ar.split(' - ')[0].trim();
    return parts.ru + '|' + stripHarakat(firstAr);
  }

  // Найти первое слово (русское) — используется для ссылки на notes (не нужно здесь)
  function parseFirstDash(line) {
    var sep = line.search(/-/);
    if (sep === -1) return null;
    return {
      ru: line.slice(0, sep).trim(),
      ar: line.slice(sep + 1).trim()
    };
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
      return {
        mode: 'compat',
        ref: firestore
          .collection('users')
          .doc(code)
          .collection('newwords')
          .doc('data'),
        serverTimestamp: (firebase && firebase.firestore && firebase.firestore.FieldValue
          && firebase.firestore.FieldValue.serverTimestamp)
          ? firebase.firestore.FieldValue.serverTimestamp()
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

  async function writeCloud(norms) {
    var ctx = getFirebaseContext();
    if (!ctx) return;
    try {
      if (ctx.mode === 'compat') {
        await ctx.ref.set({ norms: norms, updatedAt: ctx.serverTimestamp }, { merge: true });
      } else if (ctx.setDoc) {
        await ctx.setDoc(ctx.ref, { norms: norms, updatedAt: ctx.serverTimestamp() }, { merge: true });
      }
    } catch (e) {
      console.warn('🆕 Ошибка записи снапшота в облако:', e);
    }
  }

  // Выбрать снапшот: облако новее -> берём его, иначе локальный (и пишем его в облако)
  async function loadSnapshot() {
    var local = readLocal();
    var result = local;

    if (canUseFirebase()) {
      try {
        var cloud = await readCloud();
        var cloudTs = cloud ? cloud.updatedAt : 0;
        if (cloud && (!result || cloudTs > result.ts)) {
          result = { norms: cloud.norms || [], ts: cloudTs };
          writeLocal(result.norms, result.ts);
        } else if (result && result.norms && result.norms.length && !cloud) {
          writeCloud(result.norms);
        }
      } catch (e) {
        console.warn('🆕 Ошибка синхронизации снапшота с облаком:', e);
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
  function computeDiff(currentLines, prevNorms) {
    // Счётчики точных совпадений по нормализованной строке
    var prevMultiset = new Map();
    prevNorms.forEach(function (n) {
      prevMultiset.set(n, (prevMultiset.get(n) || 0) + 1);
    });

    // Поиск по ключу "того же слова": key -> norm -> count
    var keyMap = new Map();
    prevNorms.forEach(function (n) {
      var key = lineKey(n);
      if (key === null) return;
      if (!keyMap.has(key)) keyMap.set(key, new Map());
      var m = keyMap.get(key);
      m.set(n, (m.get(n) || 0) + 1);
    });

    function consumeFromKeyMap(key, norm) {
      if (key === null || !keyMap.has(key)) return;
      var m = keyMap.get(key);
      var c = m.get(norm);
      if (!c) return;
      if (c - 1 <= 0) m.delete(norm); else m.set(norm, c - 1);
    }

    var items = []; // { line, norm, kind: 'new'|'changed', prev? }

    currentLines.forEach(function (raw) {
      var norm = normLine(raw);
      var exact = prevMultiset.get(norm);
      if (exact > 0) {
        prevMultiset.set(norm, exact - 1);
        consumeFromKeyMap(lineKey(norm), norm);
        return; // не изменилось
      }

      var key = lineKey(norm);
      if (key !== null && keyMap.has(key) && keyMap.get(key).size > 0) {
        // То же слово, но строка другая -> изменённое
        var m = keyMap.get(key);
        var prevNorm = m.keys().next().value;
        if (m.get(prevNorm) <= 1) m.delete(prevNorm); else m.set(prevNorm, m.get(prevNorm) - 1);
        items.push({ line: raw, norm: norm, kind: 'changed', prev: prevNorm });
      } else {
        items.push({ line: raw, norm: norm, kind: 'new' });
      }
    });

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
          // Первый запуск: берём текущий список как базу, ничего не показываем
          var baseNorms = lines.map(normLine);
          var now = Date.now();
          writeLocal(baseNorms, now);
          if (canUseFirebase()) writeCloud(baseNorms);
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

  global.NewWords = {
    refresh: refresh,
    accept: accept,
    count: count,
    copyText: copyText,
    get result() { return cachedResult; }
  };

  console.log('🆕 Система новых слов загружена');
})(window);