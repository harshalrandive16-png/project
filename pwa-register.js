/* ═══════════════════════════════════════════════════════════
   BHOOMISURAKSHA — SAFE PWA REGISTER (No Refresh Loop)
   ═══════════════════════════════════════════════════════════ */

(() => {
  // 1. Register Service Worker safely
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./service-worker.js', { scope: './' })
        .then(reg => {
          console.log('[PWA] Registered:', reg.scope);
        })
        .catch(err => console.warn('[PWA] SW failed:', err));
    });
  }

  // 2. Install Prompt (Android/Chrome)
  let deferredPrompt = null;

  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
    showInstallBanner();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    hideInstallBanner();
  });

  // 3. iOS Add-to-Home
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const isInStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

  if (isIOS && !isInStandalone && !localStorage.getItem('bhoomi_ios_dismissed')) {
    setTimeout(showIOSBanner, 3000);
  }

  function showInstallBanner() {
    if (localStorage.getItem('bhoomi_install_dismissed')) return;
    if (document.getElementById('pwaInstallBanner')) return;

    const b = document.createElement('div');
    b.id = 'pwaInstallBanner';
    b.className = 'pwa-banner';
    b.innerHTML = `
      <div class="pwa-banner-icon">🌍</div>
      <div class="pwa-banner-text">
        <strong>Install BhoomiSuraksha</strong>
        <span>Get live alerts & offline access</span>
      </div>
      <div class="pwa-banner-actions">
        <button class="pwa-btn-install" id="pwaInstallBtn">Install</button>
        <button class="pwa-btn-close" id="pwaCloseBtn">×</button>
      </div>
    `;
    document.body.appendChild(b);
    requestAnimationFrame(() => b.classList.add('show'));

    document.getElementById('pwaInstallBtn').onclick = async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      deferredPrompt = null;
      hideInstallBanner();
    };

    document.getElementById('pwaCloseBtn').onclick = () => {
      localStorage.setItem('bhoomi_install_dismissed', Date.now());
      hideInstallBanner();
    };
  }

  function hideInstallBanner() {
    const b = document.getElementById('pwaInstallBanner');
    if (b) { b.classList.remove('show'); setTimeout(() => b.remove(), 300); }
  }

  function showIOSBanner() {
    if (document.getElementById('pwaIOSBanner')) return;
    const b = document.createElement('div');
    b.id = 'pwaIOSBanner';
    b.className = 'pwa-banner pwa-ios';
    b.innerHTML = `
      <div class="pwa-banner-icon">📲</div>
      <div class="pwa-banner-text">
        <strong>Install on iPhone</strong>
        <span>Tap <b>Share</b> then <b>"Add to Home Screen"</b></span>
      </div>
      <div class="pwa-banner-actions">
        <button class="pwa-btn-close" id="pwaIOSCloseBtn">×</button>
      </div>
    `;
    document.body.appendChild(b);
    requestAnimationFrame(() => b.classList.add('show'));

    document.getElementById('pwaIOSCloseBtn').onclick = () => {
      localStorage.setItem('bhoomi_ios_dismissed', Date.now());
      b.classList.remove('show');
      setTimeout(() => b.remove(), 300);
    };
  }

  // Inject Styles
  const css = `
    .pwa-banner{
      position:fixed; left:16px; right:16px; bottom:16px; z-index:9999;
      display:flex; align-items:center; gap:12px;
      background:rgba(11,15,26,.97); border:1px solid rgba(16,185,129,.3);
      border-radius:16px; padding:14px 16px; box-shadow:0 20px 50px rgba(0,0,0,.5);
      backdrop-filter:blur(12px); transform:translateY(140%); opacity:0;
      transition:transform .35s cubic-bezier(.2,1.2,.4,1), opacity .3s;
      font-family:'Inter',system-ui,sans-serif; max-width:520px; margin:0 auto;
    }
    .pwa-banner.show{ transform:translateY(0); opacity:1; }
    .pwa-banner-icon{
      font-size:28px; width:48px; height:48px; flex-shrink:0;
      display:grid; place-items:center; border-radius:12px;
      background:linear-gradient(135deg,rgba(16,185,129,.22),rgba(16,185,129,.06));
      border:1px solid rgba(16,185,129,.3);
    }
    .pwa-banner-text{ flex:1; display:flex; flex-direction:column; line-height:1.3; min-width:0; }
    .pwa-banner-text strong{ color:#e5e7eb; font-size:13.5px; font-weight:800; }
    .pwa-banner-text span{ color:#94a3b8; font-size:11.5px; margin-top:2px; }
    .pwa-banner-actions{ display:flex; align-items:center; gap:6px; flex-shrink:0; }
    .pwa-btn-install{
      background:linear-gradient(135deg,#10b981,#059669); color:#04140d; border:none;
      border-radius:99px; padding:9px 18px; font-size:12.5px; font-weight:800; cursor:pointer;
    }
    .pwa-btn-close{
      background:transparent; border:1px solid rgba(255,255,255,.1);
      color:#94a3b8; border-radius:8px; width:30px; height:30px; cursor:pointer; font-size:18px;
    }
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
})();
