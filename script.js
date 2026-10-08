/* ============================================================
   BhoomiSuraksha — Common Frontend Script
   File: script.js
   Purpose:
   - Common SOS menu
   - Mobile navigation
   - User session UI
   - Safe logout helper
   - Common toast utility
   - Backward-compatible global functions
   ============================================================ */

(function () {
  'use strict';

  /* ==========================================================
     USER SESSION HELPERS
     ========================================================== */

  function getStoredUser() {
    try {
      const raw =
        localStorage.getItem('bhoomiUser') ||
        localStorage.getItem('landslideUser');

      if (!raw) return null;

      const user = JSON.parse(raw);

      if (!user || typeof user !== 'object') {
        return null;
      }

      return user;
    } catch (error) {
      console.warn('BhoomiSuraksha: invalid stored user data', error);
      return null;
    }
  }

  function getAuthToken() {
    return (
      localStorage.getItem('bhoomiToken') ||
      localStorage.getItem('landslideToken') ||
      ''
    );
  }

  /* ==========================================================
     SOS MENU
     ========================================================== */

  function toggleSosMenu(event) {
    if (event && typeof event.stopPropagation === 'function') {
      event.stopPropagation();
    }

    const menu = document.getElementById('floatSosMenu');

    if (!menu) {
      return;
    }

    menu.classList.toggle('open');
  }

  function closeSosMenu() {
    const menu = document.getElementById('floatSosMenu');

    if (menu) {
      menu.classList.remove('open');
    }
  }

  function initSosMenu() {
    const container = document.getElementById('floatSosContainer');
    const menu = document.getElementById('floatSosMenu');

    if (!container || !menu) {
      return;
    }

    /*
     * Avoid installing duplicate listeners if another script
     * initializes the same page.
     */
    if (container.dataset.sosInitialized === 'true') {
      return;
    }

    container.dataset.sosInitialized = 'true';

    document.addEventListener('click', function (event) {
      if (!container.contains(event.target)) {
        menu.classList.remove('open');
      }
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        menu.classList.remove('open');
      }
    });
  }

  /* ==========================================================
     MOBILE NAVIGATION
     ========================================================== */

  function initMobileNavigation() {
    const hamburger = document.getElementById('hamburger');
    const navLinks = document.getElementById('navLinks');

    if (!hamburger || !navLinks) {
      return;
    }

    if (hamburger.dataset.navInitialized === 'true') {
      return;
    }

    hamburger.dataset.navInitialized = 'true';

    hamburger.addEventListener('click', function (event) {
      event.stopPropagation();

      navLinks.classList.toggle('mobile-open');
      navLinks.classList.toggle('open');

      const isOpen =
        navLinks.classList.contains('mobile-open') ||
        navLinks.classList.contains('open');

      hamburger.setAttribute('aria-expanded', String(isOpen));
    });

    document.addEventListener('click', function (event) {
      if (
        !hamburger.contains(event.target) &&
        !navLinks.contains(event.target)
      ) {
        navLinks.classList.remove('mobile-open');
        navLinks.classList.remove('open');
        hamburger.setAttribute('aria-expanded', 'false');
      }
    });

    navLinks.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        navLinks.classList.remove('mobile-open');
        navLinks.classList.remove('open');
        hamburger.setAttribute('aria-expanded', 'false');
      });
    });
  }

  /* ==========================================================
     COMMON TOAST
     ========================================================== */

  function showToast(message, icon) {
    const toast = document.getElementById('authToast');
    const toastMessage = document.getElementById('toastMessage');
    const toastIcon = document.getElementById('toastIcon');

    if (!toast) {
      /*
       * Do not break the application if a page doesn't have
       * the toast component.
       */
      console.log(message);
      return;
    }

    if (toastMessage) {
      toastMessage.textContent = message || '';
    }

    if (toastIcon) {
      toastIcon.textContent = icon || '✅';
    }

    toast.classList.remove('hidden');

    clearTimeout(window.__bhoomiCommonToastTimer);

    window.__bhoomiCommonToastTimer = setTimeout(function () {
      toast.classList.add('hidden');
    }, 2800);
  }

  /* ==========================================================
     SESSION UI
     ========================================================== */

  function updateCommonUserUI() {
    const user = getStoredUser();

    const authButtons = document.getElementById('authButtons');
    const userProfile = document.getElementById('userProfile');
    const userAvatar = document.getElementById('userAvatar');
    const userNameDisplay = document.getElementById('userNameDisplay');

    if (!user || !user.name) {
      return;
    }

    if (authButtons) {
      authButtons.classList.add('hidden');
    }

    if (userProfile) {
      userProfile.classList.remove('hidden');
    }

    if (userAvatar) {
      userAvatar.textContent = user.name
        .trim()
        .charAt(0)
        .toUpperCase();
    }

    if (userNameDisplay) {
      userNameDisplay.textContent =
        user.name.trim().split(/\s+/)[0] || 'User';
    }
  }

  /* ==========================================================
     LOGOUT
     ========================================================== */

  function logoutUser() {
    const confirmed = window.confirm(
      'Log out from BhoomiSuraksha?'
    );

    if (!confirmed) {
      return;
    }

    localStorage.removeItem('bhoomiUser');
    localStorage.removeItem('bhoomiToken');

    localStorage.removeItem('landslideUser');
    localStorage.removeItem('landslideToken');

    window.location.href = 'index.html';
  }

  /* ==========================================================
     ONLINE / OFFLINE STATUS
     ========================================================== */

  function updateConnectionStatus() {
    const indicators = document.querySelectorAll(
      '[data-connection-status]'
    );

    if (!indicators.length) {
      return;
    }

    const online = navigator.onLine;

    indicators.forEach(function (element) {
      element.textContent = online
        ? 'Online'
        : 'Offline';

      element.classList.toggle('online', online);
      element.classList.toggle('offline', !online);
    });
  }

  /* ==========================================================
     INITIALIZATION
     ========================================================== */

  function init() {
    initSosMenu();
    initMobileNavigation();
    updateCommonUserUI();
    updateConnectionStatus();
  }

  window.addEventListener('online', updateConnectionStatus);
  window.addEventListener('offline', updateConnectionStatus);

  /*
   * Expose functions because some HTML pages use:
   *
   * onclick="toggleSosMenu(event)"
   * onclick="logoutUser()"
   */

  window.toggleSosMenu = toggleSosMenu;
  window.closeSosMenu = closeSosMenu;
  window.logoutUser = logoutUser;
  window.showToast = showToast;

  window.BhoomiCommon = {
    getUser: getStoredUser,
    getToken: getAuthToken,
    toggleSosMenu: toggleSosMenu,
    closeSosMenu: closeSosMenu,
    logoutUser: logoutUser,
    showToast: showToast,
    updateUserUI: updateCommonUserUI
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
