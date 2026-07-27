(function() {
  'use strict';

  const AUTH_STORAGE_KEY = 'arabAuthEmail';

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
      // Init Firestore globally (needed by favorites.js)
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
    } else {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    }
    window.dispatchEvent(new CustomEvent('authChanged', { detail: { user } }));
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
        #auth-modal .dark-theme & .success-msg { color: #4ade80; }
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
          <button class="link-btn" id="authForgot" style="text-align:right;margin:-4px 0 12px;font-size:0.85rem">Забыли пароль?</button>
          <button class="auth-btn" id="authLoginBtn">Войти</button>
          <button class="link-btn" id="authToRegister">Нет аккаунта? Зарегистрироваться</button>
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
        </div>
        <div id="authViewReset" style="display:none">
          <h2>Восстановление пароля</h2>
          <div class="sub">Введите email, и мы отправим ссылку для сброса пароля</div>
          <div class="error-msg" id="authResetError"></div>
          <div class="success-msg" id="authResetSuccess" style="display:none;color:#16a34a;font-size:0.9rem;margin-bottom:12px;"></div>
          <input type="email" id="authResetEmail" placeholder="Email" autocomplete="email">
          <button class="auth-btn" id="authResetBtn">Отправить ссылку</button>
          <button class="link-btn" id="authResetBack">← Вернуться ко входу</button>
        </div>
      </div>
    `;
    document.body.appendChild(authModal);

    const emailInput = authModal.querySelector('#authEmail');
    const passInput = authModal.querySelector('#authPass');
    const regEmail = authModal.querySelector('#authRegEmail');
    const regPass = authModal.querySelector('#authRegPass');
    const regPass2 = authModal.querySelector('#authRegPass2');

    const resetEmail = authModal.querySelector('#authResetEmail');

    authModal.querySelector('#authLoginBtn').addEventListener('click', () => doLogin(emailInput.value, passInput.value));
    authModal.querySelector('#authRegisterBtn').addEventListener('click', () => doRegister(regEmail.value, regPass.value, regPass2.value));
    authModal.querySelector('#authForgot').addEventListener('click', () => switchView('reset'));
    authModal.querySelector('#authResetBtn').addEventListener('click', () => doResetPassword(resetEmail.value));
    authModal.querySelector('#authResetBack').addEventListener('click', () => switchView('login'));
    authModal.querySelector('#authToRegister').addEventListener('click', () => switchView('register'));
    authModal.querySelector('#authToLogin').addEventListener('click', () => switchView('login'));
    [emailInput, passInput].forEach(f => f.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(emailInput.value, passInput.value); }));
    [regEmail, regPass, regPass2].forEach(f => f.addEventListener('keydown', e => { if (e.key === 'Enter') doRegister(regEmail.value, regPass.value, regPass2.value); }));
    resetEmail.addEventListener('keydown', e => { if (e.key === 'Enter') doResetPassword(resetEmail.value); });
  }

  function switchView(view) {
    const login = authModal.querySelector('#authViewLogin');
    const register = authModal.querySelector('#authViewRegister');
    const reset = authModal.querySelector('#authViewReset');
    login.style.display = view === 'login' ? '' : 'none';
    register.style.display = view === 'register' ? '' : 'none';
    reset.style.display = view === 'reset' ? '' : 'none';
    authModal.querySelector('#authError').style.display = 'none';
    authModal.querySelector('#authRegError').style.display = 'none';
    authModal.querySelector('#authResetError').style.display = 'none';
    authModal.querySelector('#authResetSuccess').style.display = 'none';
  }

  function setLoading(btnId, loading) {
    const btn = authModal.querySelector(`#${btnId}`);
    if (loading) {
      btn.disabled = true;
      btn.innerHTML = '<span class="auth-loader"></span> Подождите...';
    } else {
      btn.disabled = false;
      const labels = { 'authLoginBtn': 'Войти', 'authRegisterBtn': 'Зарегистрироваться', 'authResetBtn': 'Отправить ссылку' };
      btn.textContent = labels[btnId] || '';
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

  async function doResetPassword(email) {
    const errorEl = authModal.querySelector('#authResetError');
    const successEl = authModal.querySelector('#authResetSuccess');
    errorEl.style.display = 'none';
    successEl.style.display = 'none';
    if (!email) { showError('authResetError', 'Введите email'); return; }
    setLoading('authResetBtn', true);
    try {
      await window.firebaseAuth.sendPasswordResetEmail(email);
      successEl.innerHTML = 'Ссылка для сброса пароля отправлена на ' + email + '<br><small style="opacity:0.75">Если письмо не пришло — проверьте папку «Спам»</small>';
      successEl.style.display = 'block';
    } catch (e) {
      const msgs = { 'auth/user-not-found': 'Пользователь с таким email не найден', 'auth/invalid-email': 'Неверный email' };
      showError('authResetError', msgs[e.code] || 'Ошибка. Попробуйте позже.');
    } finally {
      setLoading('authResetBtn', false);
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
    const progNotice = authModal.querySelector('#progressNotice');
    if (progNotice) progNotice.remove();
    let favCount = 0;
    try {
      const fav = JSON.parse(localStorage.getItem('arabFavorites') || '[]');
      favCount = fav.length;
    } catch(e) {}
    if (favCount > 0 || localStorage.getItem('arabStreak')) {
      const notice = document.createElement('div');
      notice.id = 'progressNotice';
      notice.className = 'progress-notice';
      notice.innerHTML = `Найден прогресс: ${favCount > 0 ? favCount + ' слов в избранном' : ''}${favCount > 0 && localStorage.getItem('arabStreak') ? ', ' : ''}${localStorage.getItem('arabStreak') ? 'есть серия дней' : ''}<br>Войдите, чтобы сохранить в облаке.`;
      const card = authModal.querySelector('.auth-card');
      card.insertBefore(notice, card.querySelector('#authViewLogin'));
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
    return null;
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
