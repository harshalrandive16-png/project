/* ============================================================
   BHOOMISURAKSHA — PWA / SERVICE WORKER
   File: pwa.js

   Responsibilities:
   - Register Service Worker
   - Handle SW updates
   - Detect online/offline state
   - Provide install prompt
   - Keep PWA registration safe
   ============================================================ */

(function () {
  'use strict';


  /* ==========================================================
     CONFIG
     ========================================================== */

  const SW_PATH = './sw.js';

  let deferredInstallPrompt = null;

  let swRegistration = null;


  /* ==========================================================
     LOGGER
     ========================================================== */

  function log(...args) {
    console.log(
      '📱 [BhoomiSuraksha PWA]',
      ...args
    );
  }


  function warn(...args) {
    console.warn(
      '⚠️ [BhoomiSuraksha PWA]',
      ...args
    );
  }


  /* ==========================================================
     TOAST
     ========================================================== */

  function showToast(message, type = 'info') {

    /*
      Use existing authToast if available.
    */

    const existingToast =
      document.getElementById('authToast');

    const existingMessage =
      document.getElementById('toastMessage');

    const existingIcon =
      document.getElementById('toastIcon');


    if (
      existingToast &&
      existingMessage
    ) {

      existingMessage.textContent =
        message;


      if (existingIcon) {

        existingIcon.textContent =
          type === 'success'
            ? '✅'
            : type === 'error'
              ? '❌'
              : 'ℹ️';

      }


      existingToast.classList.remove(
        'hidden'
      );


      setTimeout(() => {

        existingToast.classList.add(
          'hidden'
        );

      }, 3500);


      return;

    }


    /*
      Fallback toast.
    */

    let container =
      document.getElementById(
        'bhoomiPwaToast'
      );


    if (!container) {

      container =
        document.createElement('div');

      container.id =
        'bhoomiPwaToast';


      Object.assign(
        container.style,
        {
          position: 'fixed',
          left: '50%',
          bottom: '24px',
          transform: 'translateX(-50%)',
          zIndex: '99999',
          maxWidth: '90%',
          padding: '12px 18px',
          borderRadius: '12px',
          background: '#111827',
          color: '#fff',
          fontSize: '14px',
          fontFamily: 'system-ui, sans-serif',
          boxShadow:
            '0 10px 30px rgba(0,0,0,.35)',
          transition:
            'opacity .25s ease'
        }
      );


      document.body.appendChild(
        container
      );

    }


    container.textContent =
      message;


    container.style.opacity =
      '1';


    setTimeout(() => {

      container.style.opacity =
        '0';

    }, 3000);

  }


  /* ==========================================================
     SERVICE WORKER UPDATE
     ========================================================== */

  function handleWaitingWorker(registration) {

    if (
      !registration ||
      !registration.waiting
    ) {
      return;
    }


    log(
      'A new version of BhoomiSuraksha is available.'
    );


    /*
      Tell waiting worker to activate.
    */

    try {

      registration.waiting.postMessage({
        type: 'SKIP_WAITING'
      });

    } catch (error) {

      warn(
        'Could not activate updated Service Worker:',
        error
      );

    }

  }


  /* ==========================================================
     SERVICE WORKER REGISTRATION
     ========================================================== */

  async function registerServiceWorker() {

    if (
      !('serviceWorker' in navigator)
    ) {

      warn(
        'Service Worker is not supported by this browser.'
      );

      return null;

    }


    /*
      Service Workers require a secure context.

      localhost is considered secure by browsers.
      HTTPS is required for deployed websites.
    */

    const isLocalhost =
      location.hostname === 'localhost' ||
      location.hostname === '127.0.0.1';


    if (
      location.protocol !== 'https:' &&
      !isLocalhost
    ) {

      warn(
        'Service Worker requires HTTPS in production.'
      );

      return null;

    }


    try {

      const registration =
        await navigator.serviceWorker.register(
          SW_PATH,
          {
            scope: './'
          }
        );


      swRegistration =
        registration;


      log(
        'Service Worker registered:',
        registration.scope
      );


      /*
        Check whether a new worker is already waiting.
      */

      if (registration.waiting) {

        handleWaitingWorker(
          registration
        );

      }


      /*
        Listen for a new Service Worker.
      */

      registration.addEventListener(
        'updatefound',
        () => {

          const newWorker =
            registration.installing;


          if (!newWorker) {
            return;
          }


          newWorker.addEventListener(
            'statechange',
            () => {

              if (
                newWorker.state ===
                'installed'
              ) {

                if (
                  navigator.serviceWorker
                    .controller
                ) {

                  log(
                    'New Service Worker installed.'
                  );


                  handleWaitingWorker(
                    registration
                  );

                } else {

                  log(
                    'Service Worker installed for the first time.'
                  );

                }

              }

            }
          );

        }
      );


      /*
        Check for updates when page becomes visible.
      */

      document.addEventListener(
        'visibilitychange',
        () => {

          if (
            document.visibilityState ===
            'visible'
          ) {

            registration.update()
              .catch(() => {
                /*
                  Ignore update errors silently.
                */
              });

          }

        }
      );


      return registration;

    } catch (error) {

      console.error(
        '❌ Service Worker registration failed:',
        error
      );


      return null;

    }

  }


  /* ==========================================================
     SERVICE WORKER CONTROLLER CHANGE
     ========================================================== */

  function setupControllerListener() {

    if (
      !('serviceWorker' in navigator)
    ) {
      return;
    }


    navigator.serviceWorker.addEventListener(
      'controllerchange',
      () => {

        log(
          'Service Worker controller changed.'
        );

      }
    );

  }


  /* ==========================================================
     ONLINE / OFFLINE
     ========================================================== */

  function updateNetworkStatus() {

    if (
      navigator.onLine
    ) {

      log(
        'Internet connection restored.'
      );


      window.BHOOMI_ONLINE =
        true;


      showToast(
        'Internet connection restored.',
        'success'
      );

    } else {

      warn(
        'You are offline. Cached features may still work.'
      );


      window.BHOOMI_ONLINE =
        false;


      showToast(
        'You are offline. Cached data may still be available.',
        'info'
      );

    }

  }


  function setupNetworkListeners() {

    window.addEventListener(
      'online',
      updateNetworkStatus
    );


    window.addEventListener(
      'offline',
      updateNetworkStatus
    );


    window.BHOOMI_ONLINE =
      navigator.onLine;

  }


  /* ==========================================================
     INSTALL PROMPT
     ========================================================== */

  function setupInstallPrompt() {

    window.addEventListener(
      'beforeinstallprompt',
      (event) => {

        /*
          Prevent automatic browser prompt.
        */

        event.preventDefault();


        deferredInstallPrompt =
          event;


        log(
          'PWA installation is available.'
        );


        /*
          Expose helper for UI buttons.
        */

        window.installBhoomiApp =
          installApp;

      }
    );


    window.addEventListener(
      'appinstalled',
      () => {

        log(
          'BhoomiSuraksha installed successfully.'
        );


        deferredInstallPrompt =
          null;


        showToast(
          'BhoomiSuraksha installed successfully.',
          'success'
        );

      }
    );

  }


  /* ==========================================================
     INSTALL APP
     ========================================================== */

  async function installApp() {

    if (!deferredInstallPrompt) {

      /*
        App may already be installed or
        browser may not support install prompt.
      */

      showToast(
        'App installation is not currently available.',
        'info'
      );


      return false;

    }


    try {

      deferredInstallPrompt.prompt();


      const result =
        await deferredInstallPrompt.userChoice;


      log(
        'Install prompt result:',
        result.outcome
      );


      deferredInstallPrompt =
        null;


      return result.outcome ===
        'accepted';

    } catch (error) {

      console.error(
        '❌ PWA install failed:',
        error
      );


      deferredInstallPrompt =
        null;


      return false;

    }

  }


  /* ==========================================================
     PUBLIC PWA API
     ========================================================== */

  window.BhoomiPWA = {

    register:
      registerServiceWorker,

    install:
      installApp,

    getRegistration:
      () => swRegistration,

    isOnline:
      () => navigator.onLine

  };


  /*
    Backward-compatible global.
  */

  window.installBhoomiApp =
    installApp;


  /* ==========================================================
     INITIALIZE
     ========================================================== */

  async function init() {

    log(
      'Initializing PWA...'
    );


    setupNetworkListeners();

    setupControllerListener();

    setupInstallPrompt();


    /*
      Register Service Worker after page load.
    */

    const registration =
      await registerServiceWorker();


    if (registration) {

      log(
        'PWA initialization complete.'
      );

    } else {

      log(
        'PWA initialized without Service Worker.'
      );

    }

  }


  /* ==========================================================
     START
     ========================================================== */

  if (
    document.readyState ===
    'loading'
  ) {

    document.addEventListener(
      'DOMContentLoaded',
      init,
      {
        once: true
      }
    );

  } else {

    init();

  }

})();