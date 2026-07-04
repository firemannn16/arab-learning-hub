(function() {
  'use strict';

  const AUTH_STORAGE_KEY = 'arabAuthEmail';
  const DEVICE_CODE_KEY = 'userProgressCode';

  let initialized = false;
  let authModal = null;

  const firebaseConfig = {
    apiKey: "AIzaSyC2yC_BlLuP3dEzWUlWe57hhI4CezNZCy0",
    authDomain: "arab-learning-hub.firebaseapp.com",
    projectId: "arab-learning-hub",
    storageBucket: "arab-learning-hub.firebasestorage.app",
    messagingSenderId: "377334822830",
    appId: "1:377334822830:web:7cb045a81824741f427a3f"
  };

  function initFirebase() {
    if (window.firebaseAuth) return;
    const needsApp = !window.firebase;
    if (needsApp) {
      const appScript = document.createElement('script');
      appScript.src = 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js';
      document.head.appendChild(appScript);
    }
    // Also ensure Firestore SDK is loaded
    const needsFirestore = !window.firebase || !window.firebase.firestore;
    if (needsFirestore) {
      const fsScript = document.createElement('script');
      fsScript.src = 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore-compat.js';
      document.head.appendChild(fsScript);
    }
    function setupAuth() {
      if (!firebase.apps || !firebase.apps.length) {
        try { firebase.initializeApp(firebaseConfig); } catch(e) { console.warn('Auth init:', e.message); }
      }
      // Init Firestore globally (needed by favorites.js, streak.js)
      try {
        if (!window.firestore) {
          window.firestore = firebase.firestore();
          window.firestore.settings({
            experimentalForceLongPolling: true,
            useFetchStreams: false
          });
          window.firebaseEnabled = true;
        }
      } catch(e) {
        console.warn('Firestore init error:', e);
      }
      try {
        window.firebaseAuth = firebase.auth();
        window.firebaseAuth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
        window.firebaseAuth.onAuthStateChanged(onAuthChanged);
      } catch(e) {
        console.warn('Auth setup error:', e);
      }
      window.dispatchEvent(new CustomEvent('firebaseReady'));
    }
    const allLoaded = () => {
      if (window.firebase && window.firebase.auth && window.firebase.firestore) {
        setupAuth();
      } else {
        setTimeout(allLoaded, 100);
      }
    };
    if (window.firebase && window.firebase.auth && window.firebase.firestore) {
      setupAuth();
    } else {
      const authScript = document.createElement('script');
      authScript.src = 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth-compat.js';
      authScript.onload = allLoaded;
      document.head.appendChild(authScript);
    }
  }

  function onAuthChanged(user) {
    window.authUser = user;
    if (user) {
      localStorage.setItem(AUTH_STORAGE_KEY, user.email);
      migrateDeviceProgress(user.uid, user.email);
    } else {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    }
    window.dispatchEvent(new CustomEvent('authChanged', { detail: { user } }));
  }

  async function migrateDeviceProgress(uid, email) {
    const deviceCode = localStorage.getItem(DEVICE_CODE_KEY);
    if (!deviceCode) return;
    try {
      let db = window.firestore;
      if (!db) return;

      // If modular API (no .collection()), use compat fallback
      if (typeof db.collection !== 'function' && window.firebase && window.firebase.firestore) {
        db = window.firebase.firestore();
      }

      const compat = typeof db.collection === 'function';
      if (!compat) { console.log('Migration: no compat firestore, skipping'); return; }

      const from = deviceCode;
      const to = uid;

      const dataTypes = [
        { path: ['users', from, 'favorites', 'data'], target: ['users', to, 'favorites', 'data'] },
        { path: ['users', from, 'streak', 'data'], target: ['users', to, 'streak', 'data'] }
      ];

      for (const item of dataTypes) {
        // Check if uid path already has data — if so, do NOT overwrite
        const targetSnap = await db.collection(item.target[0]).doc(item.target[1]).collection(item.target[2]).doc(item.target[3]).get();
        if (targetSnap.exists) continue;
        const snap = await db.collection(item.path[0]).doc(item.path[1]).collection(item.path[2]).doc(item.path[3]).get();
        if (snap.exists) {
          await db.collection(item.target[0]).doc(item.target[1]).collection(item.target[2]).doc(item.target[3]).set(snap.data(), { merge: true });
        }
      }

      // Migrate all trainer progress (input, choice, phases, rules, etc.)
      try {
        const trainerDocs = await db.collection('users').doc(from).collection('trainers').get();
        for (const td of trainerDocs.docs) {
          const targetSnap = await db.collection('users').doc(to).collection('trainers').doc(td.id).get();
          if (targetSnap.exists) continue;
          await db.collection('users').doc(to).collection('trainers').doc(td.id).set(td.data(), { merge: true });
        }
      } catch(e) {
        console.warn('Trainer migration error:', e);
      }

      // Save mapping in favorites/migration (favorites path is covered by existing rules)
      await db.collection('users').doc(to).collection('favorites').doc('migration').set({ migratedFrom: from, email }, { merge: true });

      console.log('Progress migrated from', deviceCode, 'to', uid);
    } catch (e) {
      console.warn('Migration error:', e);
    }
  }

  function buildModal() {
    if (authModal) return;
    authModal = document.createElement('div');
    authModal.id = 'auth-modal';
    authModal.innerHTML = `
      <style>
        #auth-modal {
          position: fixed; inset: 0; background: rgba(0,0,0,0.5);
          display: none; align-items: center; justify-content: center;
          z-index: 99999; padding: 20px;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
        }
        #auth-modal.show { display: flex; }
        #auth-modal .auth-card {
          background: #fff; border-radius: 16px; padding: 30px;
          max-width: 400px; width: 100%; box-shadow: 0 12px 40px rgba(0,0,0,0.25);
        }
        #auth-modal .dark-theme & .auth-card { background: #1e293b; color: #e0e0e0; }
        #auth-modal h2 { margin: 0 0 6px; font-size: 1.4rem; color: #111; }
        #auth-modal .dark-theme & h2 { color: #e0e0e0; }
        #auth-modal .sub { color: #666; font-size: 0.9rem; margin-bottom: 20px; }
        #auth-modal .dark-theme & .sub { color: #999; }
        #auth-modal input {
          width: 100%; padding: 12px 14px; margin-bottom: 12px;
          border: 2px solid #e0e0e0; border-radius: 10px;
          font-size: 1rem; box-sizing: border-box;
          background: #fff; color: #111;
        }
        #auth-modal .dark-theme & input {
          background: #334155; border-color: #475569; color: #e0e0e0;
        }
        #auth-modal input:focus { outline: none; border-color: #667eea; }
        #auth-modal .auth-btn {
          width: 100%; padding: 12px; border: none; border-radius: 10px;
          font-size: 1rem; font-weight: 600; cursor: pointer;
          background: linear-gradient(135deg, #667eea, #764ba2);
          color: #fff; margin-bottom: 8px; transition: opacity 0.2s;
        }
        #auth-modal .auth-btn:hover { opacity: 0.9; }
        #auth-modal .auth-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        #auth-modal .link-btn {
          background: none; border: none; color: #667eea;
          font-size: 0.9rem; cursor: pointer; padding: 4px;
          width: 100%; text-align: center;
        }
        #auth-modal .dark-theme & .link-btn { color: #93a5ff; }
        #auth-modal .link-btn:hover { text-decoration: underline; }
        #auth-modal .error-msg {
          color: #dc2626; font-size: 0.85rem; margin-bottom: 10px;
          display: none;
        }
        #auth-modal .dark-theme & .error-msg { color: #f87171; }
        #auth-modal .skip-link {
          display: block; text-align: center; color: #999;
          font-size: 0.85rem; cursor: pointer; padding: 8px;
          margin-top: 4px;
        }
        #auth-modal .skip-link:hover { color: #666; }
        #auth-modal .divider {
          height: 1px; background: #e0e0e0; margin: 14px 0;
        }
        #auth-modal .dark-theme & .divider { background: #475569; }
        #auth-modal .progress-notice {
          background: #eef2ff; border: 1px solid #c7d2fe;
          border-radius: 10px; padding: 12px; margin-bottom: 16px;
          font-size: 0.9rem; color: #4338ca; line-height: 1.4;
        }
        #auth-modal .dark-theme & .progress-notice {
          background: #1e1b4b; border-color: #4338ca; color: #c7d2fe;
        }
        #auth-modal .auth-loader {
          display: inline-block; width: 16px; height: 16px;
          border: 2px solid rgba(255,255,255,0.3); border-top-color: #fff;
          border-radius: 50%; animation: authSpin 0.6s linear infinite;
          vertical-align: middle; margin-right: 6px;
        }
        @keyframes authSpin { to { transform: rotate(360deg); } }
      </style>
      <div class="auth-card" id="authCard">
        <div id="authViewLogin">
          <h2>Вход</h2>
          <div class="sub">Войдите, чтобы синхронизировать прогресс между устройствами</div>
          <div class="error-msg" id="authError"></div>
          <input type="email" id="authEmail" placeholder="Email" autocomplete="email">
          <input type="password" id="authPass" placeholder="Пароль" autocomplete="current-password">
          <button class="auth-btn" id="authLoginBtn">Войти</button>
          <button class="link-btn" id="authToRegister">Нет аккаунта? Зарегистрироваться</button>
          <div class="divider"></div>
          <span class="skip-link" id="authSkip">Продолжить без входа</span>
        </div>
        <div id="authViewRegister" style="display:none">
          <h2>Регистрация</h2>
          <div class="sub">Создайте аккаунт, чтобы прогресс сохранялся на всех устройствах</div>
          <div class="error-msg" id="authRegError"></div>
          <input type="email" id="authRegEmail" placeholder="Email" autocomplete="email">
          <input type="password" id="authRegPass" placeholder="Пароль (минимум 6 символов)" autocomplete="new-password">
          <input type="password" id="authRegPass2" placeholder="Повторите пароль" autocomplete="new-password">
          <button class="auth-btn" id="authRegisterBtn">Зарегистрироваться</button>
          <button class="link-btn" id="authToLogin">Уже есть аккаунт? Войти</button>
          <div class="divider"></div>
          <span class="skip-link" id="authSkip2">Продолжить без входа</span>
        </div>
      </div>
    `;
    document.body.appendChild(authModal);

    const emailInput = authModal.querySelector('#authEmail');
    const passInput = authModal.querySelector('#authPass');
    const regEmail = authModal.querySelector('#authRegEmail');
    const regPass = authModal.querySelector('#authRegPass');
    const regPass2 = authModal.querySelector('#authRegPass2');

    authModal.querySelector('#authLoginBtn').addEventListener('click', () => doLogin(emailInput.value, passInput.value));
    authModal.querySelector('#authRegisterBtn').addEventListener('click', () => doRegister(regEmail.value, regPass.value, regPass2.value));
    authModal.querySelector('#authToRegister').addEventListener('click', () => switchView('register'));
    authModal.querySelector('#authToLogin').addEventListener('click', () => switchView('login'));
    authModal.querySelector('#authSkip').addEventListener('click', closeModal);
    authModal.querySelector('#authSkip2').addEventListener('click', closeModal);

    [emailInput, passInput].forEach(f => f.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(emailInput.value, passInput.value); }));
    [regEmail, regPass, regPass2].forEach(f => f.addEventListener('keydown', e => { if (e.key === 'Enter') doRegister(regEmail.value, regPass.value, regPass2.value); }));
  }

  function switchView(view) {
    const login = authModal.querySelector('#authViewLogin');
    const register = authModal.querySelector('#authViewRegister');
    login.style.display = view === 'login' ? '' : 'none';
    register.style.display = view === 'register' ? '' : 'none';
    authModal.querySelector('#authError').style.display = 'none';
    authModal.querySelector('#authRegError').style.display = 'none';
  }

  function setLoading(btnId, loading) {
    const btn = authModal.querySelector(`#${btnId}`);
    if (loading) {
      btn.disabled = true;
      btn.innerHTML = '<span class="auth-loader"></span> Подождите...';
    } else {
      btn.disabled = false;
      btn.textContent = btnId === 'authLoginBtn' ? 'Войти' : 'Зарегистрироваться';
    }
  }

  function showError(elId, msg) {
    const el = authModal.querySelector(`#${elId}`);
    el.textContent = msg;
    el.style.display = 'block';
  }

  async function doLogin(email, password) {
    const errorEl = authModal.querySelector('#authError');
    errorEl.style.display = 'none';
    if (!email || !password) { showError('authError', 'Заполните email и пароль'); return; }
    setLoading('authLoginBtn', true);
    try {
      await window.firebaseAuth.signInWithEmailAndPassword(email, password);
      closeModal();
    } catch (e) {
      const msgs = { 'auth/user-not-found': 'Пользователь не найден', 'auth/wrong-password': 'Неверный пароль', 'auth/invalid-email': 'Неверный email', 'auth/invalid-credential': 'Неверный email или пароль' };
      showError('authError', msgs[e.code] || 'Ошибка входа. Попробуйте позже.');
    } finally {
      setLoading('authLoginBtn', false);
    }
  }

  async function doRegister(email, password, password2) {
    const errorEl = authModal.querySelector('#authRegError');
    errorEl.style.display = 'none';
    if (!email || !password) { showError('authRegError', 'Заполните email и пароль'); return; }
    if (password.length < 6) { showError('authRegError', 'Пароль минимум 6 символов'); return; }
    if (password !== password2) { showError('authRegError', 'Пароли не совпадают'); return; }
    setLoading('authRegisterBtn', true);
    try {
      await window.firebaseAuth.createUserWithEmailAndPassword(email, password);
      closeModal();
    } catch (e) {
      const msgs = { 'auth/email-already-in-use': 'Этот email уже зарегистрирован', 'auth/invalid-email': 'Неверный email' };
      showError('authRegError', msgs[e.code] || 'Ошибка регистрации. Попробуйте позже.');
    } finally {
      setLoading('authRegisterBtn', false);
    }
  }

  function closeModal() {
    if (authModal) authModal.classList.remove('show');
    const notice = document.getElementById('progressNotice');
    if (notice) notice.remove();
  }

  function openModal() {
    if (!authModal) buildModal();
    switchView('login');
    // Check if there is existing device progress to show
    const code = localStorage.getItem(DEVICE_CODE_KEY);
    const progNotice = authModal.querySelector('#progressNotice');
    if (progNotice) progNotice.remove();
    if (code) {
      let favCount = 0;
      try {
        const fav = JSON.parse(localStorage.getItem('arabFavorites') || '[]');
        favCount = fav.length;
      } catch(e) {}
      if (favCount > 0 || localStorage.getItem('arabStreak')) {
        const notice = document.createElement('div');
        notice.id = 'progressNotice';
        notice.className = 'progress-notice';
        notice.innerHTML = `Найден прогресс: ${favCount > 0 ? favCount + ' слов в избранном' : ''}${favCount > 0 && localStorage.getItem('arabStreak') ? ', ' : ''}${localStorage.getItem('arabStreak') ? 'есть серия дней' : ''}<br>Привяжите к аккаунту, чтобы не потерять.`;
        const card = authModal.querySelector('.auth-card');
        card.insertBefore(notice, card.querySelector('#authViewLogin'));
      }
    }
    authModal.classList.add('show');
  }

  function logout() {
    if (window.firebaseAuth) {
      window.firebaseAuth.signOut();
    }
  }

  function getUserId() {
    if (window.authUser) return window.authUser.uid;
    return localStorage.getItem(DEVICE_CODE_KEY) || 'anonymous';
  }

  function isLoggedIn() {
    return !!window.authUser;
  }

  function getUserEmail() {
    return window.authUser ? window.authUser.email : null;
  }

  async function ensureAuth() {
    if (window.authUser) return window.authUser;
    return new Promise(resolve => {
      const handler = (e) => {
        window.removeEventListener('authChanged', handler);
        resolve(e.detail.user);
      };
      window.addEventListener('authChanged', handler);
      openModal();
    });
  }

  window.auth = {
    init: initFirebase,
    openModal,
    closeModal,
    logout,
    getUserId,
    isLoggedIn,
    getUserEmail,
    ensureAuth
  };

  // Auto-init
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFirebase);
  } else {
    initFirebase();
  }

  // Build modal on load
  if (document.readyState === 'complete') {
    buildModal();
  } else {
    window.addEventListener('load', buildModal);
  }

  console.log('auth.js loaded');
})();
