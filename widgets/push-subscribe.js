// ═══════════════════════════════════════════════════
// 🏔️ BhoomiSuraksha — Browser Notification Subscribe
// ═══════════════════════════════════════════════════

(function () {
  function ensureButton() {
    if (document.getElementById('bhoomi-push-btn')) return;
    const btn = document.createElement('button');
    btn.id = 'bhoomi-push-btn';
    btn.textContent = '🔔 Subscribe Alerts';
    btn.style.cssText = `
      position:fixed;bottom:90px;right:20px;z-index:9998;
      background:linear-gradient(135deg,#059669,#10b981);color:#fff;
      border:none;border-radius:999px;padding:12px 16px;font-weight:700;
      font-family:Inter,sans-serif;font-size:13px;cursor:pointer;
      box-shadow:0 8px 24px rgba(16,185,129,.35);
    `;
    btn.onclick = subscribe;
    document.body.appendChild(btn);
  }

  async function subscribe() {
    if (!('Notification' in window)) {
      alert('Is browser me notifications support nahi hai');
      return;
    }
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') {
      alert('Permission nahi mili. Browser settings se allow karo.');
      return;
    }
    localStorage.setItem('bhoomiPush', 'yes');
    new Notification('🏔️ BhoomiSuraksha', {
      body: 'Alert subscription ON! High/Severe risk pe browser notify karega.',
      icon: '/favicon.ico'
    });
    const btn = document.getElementById('bhoomi-push-btn');
    if (btn) {
      btn.textContent = '✅ Alerts On';
      btn.style.background = '#065f46';
    }
  }

  // Demo: page pe local event se notify
  window.bhoomiNotify = function (title, body) {
    if (localStorage.getItem('bhoomiPush') === 'yes' && Notification.permission === 'granted') {
      new Notification(title || 'BhoomiSuraksha Alert', { body: body || 'New disaster risk nearby', icon: '/favicon.ico' });
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureButton);
  } else {
    ensureButton();
  }
})();