// ═══════════════════════════════════════════════════════════════
// 🏔️ BhoomiSuraksha — config.js
// Universal API Configuration
// ═══════════════════════════════════════════════════════════════

(function () {
  'use strict';

  /**
   * ------------------------------------------------------------
   * API BASE URL
   * ------------------------------------------------------------
   *
   * Local development:
   *   http://localhost:5000
   *
   * Production:
   *   Same origin as the deployed website
   *
   * This allows the same frontend code to work locally
   * and on the deployed server.
   */

  const host = window.location.hostname;

  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0'
  ) {
    window.BHOOMI_API = 'http://localhost:5000';
  } else {
    window.BHOOMI_API = window.location.origin;
  }

  console.log(
    '🏔️ BhoomiSuraksha API Base:',
    window.BHOOMI_API
  );


  /**
   * ------------------------------------------------------------
   * BACKEND STATUS
   * ------------------------------------------------------------
   */

  window.BHOOMI_BACKEND_ONLINE = false;


  /**
   * ------------------------------------------------------------
   * UNIVERSAL API FETCH HELPER
   * ------------------------------------------------------------
   *
   * Usage:
   *
   *   bhoomiApiFetch('/api/health')
   *
   * or:
   *
   *   bhoomiApiFetch('api/health')
   *
   * Both formats are supported.
   */

  window.bhoomiApiFetch = async function (
    endpoint,
    options = {}
  ) {
    const cleanEndpoint = String(endpoint || '').startsWith('/')
      ? String(endpoint)
      : '/' + String(endpoint || '');

    const url =
      window.BHOOMI_API +
      cleanEndpoint;


    try {
      const response = await fetch(
        url,
        {
          ...options,
          headers: {
            Accept: 'application/json',
            ...(options.headers || {})
          }
        }
      );


      /**
       * Handle HTTP errors.
       */
      if (!response.ok) {
        let errorMessage =
          `HTTP ${response.status}: ${response.statusText}`;

        try {
          const errorData =
            await response.json();

          if (errorData?.message) {
            errorMessage =
              errorData.message;
          }
        } catch {
          // Response was not JSON.
        }

        throw new Error(errorMessage);
      }


      /**
       * Handle empty responses safely.
       */
      const contentType =
        response.headers.get('content-type') || '';

      if (
        contentType.includes('application/json')
      ) {
        return await response.json();
      }


      /**
       * Some endpoints may return plain text.
       */
      return await response.text();

    } catch (error) {

      console.error(
        `❌ API Fetch Error (${cleanEndpoint}):`,
        error
      );

      throw error;
    }
  };


  /**
   * ------------------------------------------------------------
   * BACKEND STATUS INDICATOR
   * ------------------------------------------------------------
   */

  function updateBackendIndicators(
    online
  ) {
    const indicators =
      document.querySelectorAll(
        '.backend-status-indicator, ' +
        '#backendStatus, ' +
        '.status-badge'
      );


    indicators.forEach(
      (element) => {

        if (!element) {
          return;
        }

        if (online) {
          element.innerHTML =
            '🟢 Live API Active';

          element.dataset.backendStatus =
            'online';

        } else {
          element.innerHTML =
            '🔴 API Offline';

          element.dataset.backendStatus =
            'offline';
        }
      }
    );
  }


  /**
   * ------------------------------------------------------------
   * BACKEND HEALTH CHECK
   * ------------------------------------------------------------
   *
   * Checks:
   *   GET /api/health
   *
   * This is intentionally non-blocking.
   * If the backend is unavailable, the website itself
   * should still be able to load.
   */

  async function checkBackendHealth() {

    try {

      const response =
        await fetch(
          window.BHOOMI_API +
          '/api/health',
          {
            method: 'GET',
            headers: {
              Accept:
                'application/json'
            }
          }
        );


      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status}`
        );
      }


      let data = {};

      try {
        data =
          await response.json();
      } catch {
        data = {};
      }


      window.BHOOMI_BACKEND_ONLINE =
        true;


      console.log(
        '✅ BhoomiSuraksha backend online:',
        data.status ||
          'healthy'
      );


      updateBackendIndicators(
        true
      );


      return {
        online: true,
        data
      };

    } catch (error) {

      window.BHOOMI_BACKEND_ONLINE =
        false;


      console.warn(
        '⚠️ BhoomiSuraksha backend is unavailable.',
        error.message
      );


      updateBackendIndicators(
        false
      );


      return {
        online: false,
        error
      };
    }
  }


  /**
   * ------------------------------------------------------------
   * EXPOSE HEALTH CHECK
   * ------------------------------------------------------------
   *
   * Other frontend files can manually call:
   *
   *   checkBhoomiBackend()
   */

  window.checkBhoomiBackend =
    checkBackendHealth;


  /**
   * ------------------------------------------------------------
   * INITIAL HEALTH CHECK
   * ------------------------------------------------------------
   *
   * Wait until DOM is available before updating
   * status indicators.
   */

  function initializeConfig() {

    checkBackendHealth();

  }


  if (
    document.readyState ===
    'loading'
  ) {

    document.addEventListener(
      'DOMContentLoaded',
      initializeConfig,
      {
        once: true
      }
    );

  } else {

    initializeConfig();

  }

})();
