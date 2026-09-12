// 🔄 Синхронизация тренажёров (Заучивание + Пустой тренажёр) через Firestore.
// Хранит документы в users/{uid}/sr_cards (правила уже разрешают эту коллекцию).
// Конфликты решаются по updatedAt (last-write-wins), эхо собственных записей игнорируется.
(function (global) {
  'use strict';

  var registered = {};
  var listeners = {};
  var lastPushed = {};
  var lastAtState = {};
  var started = false;

  function ready() {
    return !!(global.firestore && global.auth && global.authUser &&
      global.authUser.uid &&
      typeof global.firestore.collection === 'function');
  }

  function docRef(docId) {
    return global.firestore
      .collection('users').doc(global.authUser.uid)
      .collection('sr_cards').doc(docId);
  }

  function push(docId, obj) {
    if (!ready()) return 0;
    var toWrite = { updatedAt: Date.now() };
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      Object.keys(obj).forEach(function (k) {
        toWrite[k] = obj[k];
      });
    }
    lastAtState[docId] = toWrite.updatedAt;
    lastPushed[docId] = JSON.stringify(toWrite);
    docRef(docId).set(toWrite).catch(function (e) {
      console.warn('[trainer-sync] set ' + docId + ': ' + (e && e.message));
    });
    return toWrite.updatedAt;
  }

  function startListeners() {
    Object.keys(registered).forEach(function (docId) {
      if (listeners[docId]) return;
      var conf = registered[docId];
      try {
        listeners[docId] = docRef(docId).onSnapshot(function (snap) {
          if (!snap.exists) {
            if (conf.onMissing) {
              try { conf.onMissing(); } catch (e) { console.warn(e); }
            }
            return;
          }
          var data = snap.data();
          if (lastPushed[docId] === JSON.stringify(data)) return;
          if (conf.onRemote) {
            try { conf.onRemote(data); } catch (e) { console.warn(e); }
          }
        }, function (e) {
          console.warn('[trainer-sync] listen ' + docId + ': ' + (e && e.message));
        });
      } catch (e) {
        console.warn('[trainer-sync] start ' + docId + ': ' + (e && e.message));
      }
    });
  }

  function stopListeners() {
    Object.keys(listeners).forEach(function (k) {
      try { listeners[k](); } catch (e) {}
    });
    listeners = {};
    lastPushed = {};
  }

  global.TrainerSync = {
    ready: ready,
    register: function (docId, conf) {
      registered[docId] = conf;
      if (started && ready()) startListeners();
    },
    push: push,
    lastAt: function (docId) { return lastAtState[docId] || 0; },
    start: function () {
      if (started) return;
      started = true;
      startListeners();
    },
    stop: function () {
      started = false;
      stopListeners();
      lastAtState = {};
    }
  };

  global.addEventListener('authChanged', function () {
    if (global.authUser && global.authUser.uid) {
      global.TrainerSync.start();
    } else {
      global.TrainerSync.stop();
    }
  });
})(window);