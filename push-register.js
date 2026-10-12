/**
 * ═══════════════════════════════════════════════════════════════
 * 🏔️ BhoomiSuraksha v5.2 — WebPush Client & Banner Controller
 * Handles Auto-Dismiss, Enable/Later clicks, and VAPID Push Sub
 * ═══════════════════════════════════════════════════════════════
 */

(function () {
  const API_BASE = window.BHOOMI_API || (
    (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
      ? 'http://localhost:5000'
      : (location.hostname.includes('github.io')
          ? 'https://project-2-wszb.onrender.com'
          : location.origin)
  );

  // Helper to convert VAPID Key
  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  // Find Notification Banner Element in DOM
  function getBannerElement() {
    return document.getElementById('pushBanner') ||
           document.getElementById('notificationBanner') ||
           document.querySelector('.push-banner') ||
           document.querySelector('.notification-prompt') ||
           Array.from(document.querySelectorAll('div')).find(el => 
             el.textContent && el.textContent.includes('Get instant life-saving warnings')
           );
  }

  // Hide Banner Smoothly
  function hideBanner() {
    const banner = getBannerElement();
    if (banner) {
      banner.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
      banner.style.opacity = '0';
      banner.style.transform = 'translateY(-20px)';
      setTimeout(() => {
        banner.style.display = 'none';
      }, 300);
    }
  }

  // Register Service Worker & Subscribe to WebPush
  async function registerPushSubscription() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

    try {
      const reg = await navigator.serviceWorker.register('./sw.js');
      
      const keyRes = await fetch(`${API_BASE}/api/push/vapid-public-key`);
      const keyData = await keyRes.json();

      if (!keyData.success || !keyData.publicKey) return;

      const applicationServerKey = urlBase64ToUint8Array(keyData.publicKey);
      let subscription = await reg.pushManager.getSubscription();

      if (!subscription) {
        subscription = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: applicationServerKey
        });
      }

      await fetch(`${API_BASE}/api/push/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription)
      });

      console.log('🔔 WebPush Subscription Active!');
    } catch (err) {
      console.warn('⚠️ WebPush registration note:', err.message);
    }
  }

  // Bind Click Events to Banner Buttons
  function setupBannerEvents() {
    const banner = getBannerElement();
    if (!banner) return;

    // Check if user previously dismissed in last 24 hrs or already granted
    const dismissedTime = localStorage.getItem('bhoomi_push_dismissed');
    const isRecentlyDismissed = dismissedTime && (Date.now() - parseInt(dismissedTime, 10) < 86400000);
    
    if (Notification.permission === 'granted' || Notification.permission === 'denied' || isRecentlyDismissed) {
      banner.style.display = 'none';
      if (Notification.permission === 'granted') {
        registerPushSubscription();
      }
      return;
    }

    // Find "Enable" and "Later" buttons inside banner
    const buttons = banner.querySelectorAll('button');
    let enableBtn = null;
    let laterBtn = null;

    buttons.forEach(btn => {
      const text = btn.textContent.trim().toLowerCase();
      if (text.includes('enable') || text.includes('allow') || text.includes('turn on')) {
        enableBtn = btn;
      } else if (text.includes('later') || text.includes('dismiss') || text.includes('cancel') || text.includes('close')) {
        laterBtn = btn;
      }
    });

    // "Later" Click Action
    if (laterBtn) {
      laterBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        localStorage.setItem('bhoomi_push_dismissed', Date.now().toString());
        hideBanner();
      });
    }

    // "Enable" Click Action
    if (enableBtn) {
      enableBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        hideBanner(); // Close banner instantly for instant UI feedback
        
        try {
          const perm = await Notification.requestPermission();
          if (perm === 'granted') {
            await registerPushSubscription();
          } else {
            localStorage.setItem('bhoomi_push_dismissed', Date.now().toString());
          }
        } catch (err) {
          console.warn('Notification permission error:', err);
        }
      });
    }
  }

  // Init on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupBannerEvents);
  } else {
    setupBannerEvents();
  }
})();