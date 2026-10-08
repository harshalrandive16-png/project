/* ============================================================
   BhoomiSuraksha — Push Notification Request Banner
   Include: <script src="push-notify.js"></script> before </body>
============================================================ */

(function () {
  'use strict';

  if (window.__BHOOMI_PUSH_LOADED__) return;
  window.__BHOOMI_PUSH_LOADED__ = true;

  const API_BASE = window.BHOOMI_API || window.location.origin;
  
  // Dummy VAPID Key for SIH Prototype (Prevents crashing if backend doesn't have web-push setup yet)
  const PUBLIC_VAPID_KEY = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLcg05SRmq3I';

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

  // ---- Styles for Notification Banner ----
  const style = document.createElement('style');
  style.textContent = `
    .bs-push-banner{
      position:fixed; top:-100px; left:50%; transform:translateX(-50%);
      width:90%; max-width:500px; background:linear-gradient(145deg,#060b11,#0b0f1a);
      border:1px solid #10b981; border-radius:12px;
      box-shadow:0 12px 40px rgba(16,185,129,0.25); z-index:10000;
      display:flex; align-items:center; justify-content:space-between;
      padding:16px 20px; transition:top 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
      font-family:'Inter',sans-serif;
    }
    .bs-push-banner.show{ top:20px; }
    .bs-push-icon{
      font-size:2rem; margin-right:16px;
      animation:bsRing 2s infinite;
    }
    @keyframes bsRing{ 0%,100%{transform:rotate(0)} 10%,30%,50%{transform:rotate(10deg)} 20%,40%{transform:rotate(-10deg)} }
    .bs-push-text{ flex:1; color:#fff; }
    .bs-push-title{ font-weight:700; font-size:1rem; margin-bottom:4px; }
    .bs-push-desc{ font-size:0.8rem; color:#94a3b8; line-height:1.4; }
    .bs-push-actions{ display:flex; gap:10px; margin-left:16px; flex-shrink:0; }
    .bs-push-btn{
      padding:8px 16px; border-radius:8px; font-size:0.85rem; font-weight:600;
      cursor:pointer; border:none; transition:all 0.2s;
    }
    .bs-push-btn.allow{ background:linear-gradient(135deg,#10b981,#059669); color:#fff; }
    .bs-push-btn.allow:hover{ box-shadow:0 4px 12px rgba(16,185,129,0.4); transform:translateY(-2px); }
    .bs-push-btn.deny{ background:rgba(255,255,255,0.1); color:#cbd5e1; }
    .bs-push-btn.deny:hover{ background:rgba(255,255,255,0.15); }
    @media(max-width:480px){
      .bs-push-banner{ flex-direction:column; text-align:center; padding:16px; }
      .bs-push-icon{ margin:0 0 10px 0; }
      .bs-push-actions{ margin:12px 0 0 0; width:100%; justify-content:center; }
    }
  `;
  document.head.appendChild(style);

  // ---- Create Banner DOM ----
  const banner = document.createElement('div');
  banner.className = 'bs-push-banner';
  banner.innerHTML = `
    <div class="bs-push-icon">🔔</div>
    <div class="bs-push-text">
      <div class="bs-push-title">Enable Geofenced Alerts</div>
      <div class="bs-push-desc">Get instant life-saving warnings when a disaster approaches your location (5-10km).</div>
    </div>
    <div class="bs-push-actions">
      <button class="bs-push-btn deny" id="bsPushLater">Later</button>
      <button class="bs-push-btn allow" id="bsPushAllow">Enable</button>
    </div>
  `;
  document.body.appendChild(banner);

  // ---- Logic ----
  async function subscribeUser() {
    try {
      // 1. Register Service Worker
      const registration = await navigator.serviceWorker.register('/sw.js');
      console.log('✅ [Push] Service Worker Registered');

      // 2. Request Notification Permission
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        throw new Error('Permission not granted');
      }

      // 3. Subscribe to Push Manager
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(PUBLIC_VAPID_KEY)
      });

      console.log('✅ [Push] Subscription created:', subscription);

      // 4. Send to Backend
      let userId = 'anonymous';
      try {
        const user = JSON.parse(localStorage.getItem('bhoomiUser') || '{}');
        if (user && user.uid) userId = user.uid;
      } catch(e){}

      const res = await fetch(API_BASE + '/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription, userId })
      });

      if(res.ok) {
        // Show success toast if you have a toast function, else alert
        alert("✅ Real-time Disaster Alerts Enabled Successfully!");
      }
    } catch (err) {
      console.error('❌ [Push] Error:', err);
    }
  }

  // ---- Initialize ----
  function checkPush() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      console.log('⚠️ [Push] Notifications not supported in this browser.');
      return;
    }

    if (Notification.permission === 'default' && !localStorage.getItem('bhoomi_push_dismissed')) {
      // Show banner after 3 seconds of page load
      setTimeout(() => banner.classList.add('show'), 3000);
    }
  }

  document.getElementById('bsPushLater').addEventListener('click', () => {
    banner.classList.remove('show');
    localStorage.setItem('bhoomi_push_dismissed', 'true');
  });

  document.getElementById('bsPushAllow').addEventListener('click', async () => {
    banner.classList.remove('show');
    await subscribeUser();
  });

  // Start Check
  checkPush();
})();