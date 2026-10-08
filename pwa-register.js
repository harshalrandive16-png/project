/* ═══════════════════════════════════════════════════════════
   BHOOMISURAKSHA — PWA REGISTRATION & INSTALL PROMPT
   Isko har HTML page me <script src="pwa-register.js"></script>
   add karna hai (just before </body>)
   ═══════════════════════════════════════════════════════════ */

(() => {

  /* ── 1. Register Service Worker ─────────────── */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./service-worker.js', { scope: './' })
        .then(reg => {
          console.log('[PWA] Service Worker registered:', reg.scope);

          // Check for updates every 60 seconds
          setInterval(() => reg.update(), 60000);

          // Show "update available" prompt
          reg.addEventListener('updatefound', () => {
            const newSW = reg.installing;
            if (!newSW) return;
            newSW.addEventListener('statechange', () => {
              if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
                showUpdateToast(newSW);
              }
            });
          });
        })
        .catch(err => console.warn('[PWA] SW registration failed:', err));
    });

    // Reload when SW takes control
    let refreshing;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
  }

  /* ── 2. Install Prompt (Android/Chrome) ─────── */
  let deferredPrompt = null;

  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
    console.log('[PWA] Install prompt ready');
    showInstallBanner();
  });

  window.addEventListener('appinstalled', () => {
    console.log('[PWA] App installed successfully');
    deferredPrompt = null;
    hideInstallBanner();
    showToast('✅ BhoomiSuraksha installed! Open from home screen.', 'ok');
  });

  /* ── 3. iOS Detection (Safari Add-to-Home) ──── */
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const isInStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;

  if (isIOS && !isInStandalone && !localStorage.getItem('bhoomi_ios_dismissed')) {
    setTimeout(showIOSBanner, 3000);
  }

  /* ═══════════════════════════════════════════════
     UI: Install Banner (Android/Chrome)
     ═══════════════════════════════════════════════ */
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
        <span>Get live alerts, offline access & faster experience</span>
      </div>
      <div class="pwa-banner-actions">
        <button class="pwa-btn-install" id="pwaInstallBtn">Install</button>
        <button class="pwa-btn-close" id="pwaCloseBtn" aria-label="Dismiss">×</button>
      </div>
    `;
    document.body.appendChild(b);
    requestAnimationFrame(() => b.classList.add('show'));

    document.getElementById('pwaInstallBtn').onclick = async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log('[PWA] User choice:', outcome);
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

  /* ═══════════════════════════════════════════════
     UI: iOS Add-to-Home Banner
     ═══════════════════════════════════════════════ */
  function showIOSBanner() {
    if (document.getElementById('pwaIOSBanner')) return;

    const b = document.createElement('div');
    b.id = 'pwaIOSBanner';
    b.className = 'pwa-banner pwa-ios';
    b.innerHTML = `
      <div class="pwa-banner-icon">📲</div>
      <div class="pwa-banner-text">
        <strong>Install on iPhone</strong>
        <span>Tap <b>Share</b> <svg viewBox="0 0 24 24" width="12" height="12" fill="#60a5fa"><path d="M12 2l-5 5h3v9h4v-9h3l-5-5zm-7 18h14v2H5v-2z"/></svg> then <b>"Add to Home Screen"</b></span>
      </div>
      <div class="pwa-banner-actions">
        <button class="pwa-btn-close" id="pwaIOSCloseBtn" aria-label="Dismiss">×</button>
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

  /* ═══════════════════════════════════════════════
     UI: Update Available Toast
     ═══════════════════════════════════════════════ */
  function showUpdateToast(worker) {
    const t = document.createElement('div');
    t.className = 'pwa-update-toast';
    t.innerHTML = `
      <span>🔄 New version available</span>
      <button id="pwaUpdateBtn">Update</button>
    `;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));

    document.getElementById('pwaUpdateBtn').onclick = () => {
      worker.postMessage('SKIP_WAITING');
    };
  }

  /* ═══════════════════════════════════════════════
     Minor toast helper
     ═══════════════════════════════════════════════ */
  function showToast(msg, type) {
    const t = document.createElement('div');
    t.className = 'pwa-update-toast';
    t.innerHTML = `<span>${msg}</span>`;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3500);
  }

  /* ═══════════════════════════════════════════════
     Inject banner styles (once)
     ═══════════════════════════════════════════════ */
  const css = `
    .pwa-banner{
      position:fixed; left:16px; right:16px; bottom:16px; z-index:9999;
      display:flex; align-items:center; gap:12px;
      background:rgba(11,15,26,.97);
      border:1px solid rgba(16,185,129,.3);
      border-radius:16px; padding:14px 16px;
      box-shadow:0 20px 50px rgba(0,0,0,.5);
      backdrop-filter:blur(12px);
      transform:translateY(140%); opacity:0;
      transition:transform .35s cubic-bezier(.2,1.2,.4,1), opacity .3s;
      font-family:'Inter',system-ui,sans-serif;
      max-width:520px; margin:0 auto;
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
      background:linear-gradient(135deg,#10b981,#059669);
      color:#04140d; border:none; border-radius:9px;
      padding:9px 18px; font-size:12.5px; font-weight:800;
      cursor:pointer; font-family:inherit;
      box-shadow:0 6px 16px rgba(16,185,129,.3);
      transition:transform .2s;
    }
    .pwa-btn-install:hover{ transform:translateY(-1px); }
    .pwa-btn-close{
      background:transparent; border:1px solid rgba(255,255,255,.1);
      color:#94a3b8; border-radius:8px;
      width:30px; height:30px; cursor:pointer;
      font-size:18px; line-height:1; font-family:inherit;
      transition:.2s;
    }
    .pwa-btn-close:hover{ color:#fca5a5; border-color:rgba(220,38,38,.4); }

    .pwa-ios .pwa-banner-text span b{ color:#60a5fa; }

    .pwa-update-toast{
      position:fixed; top:16px; left:50%; z-index:9999;
      transform:translate(-50%,-120%);
      background:rgba(11,15,26,.97);
      border:1px solid rgba(16,185,129,.3);
      border-radius:12px; padding:10px 14px;
      display:flex; align-items:center; gap:10px;
      color:#e5e7eb; font-size:12.5px; font-weight:600;
      font-family:'Inter',system-ui,sans-serif;
      box-shadow:0 14px 34px rgba(0,0,0,.5);
      backdrop-filter:blur(12px);
      transition:transform .3s;
    }
    .pwa-update-toast.show{ transform:translate(-50%,0); }
    .pwa-update-toast button{
      background:linear-gradient(135deg,#10b981,#059669);
      color:#04140d; border:none; border-radius:8px;
      padding:6px 14px; font-size:11.5px; font-weight:800;
      cursor:pointer; font-family:inherit;
    }

    @media (max-width: 480px){
      .pwa-banner{ left:10px; right:10px; bottom:10px; padding:12px 14px; gap:10px; }
      .pwa-banner-icon{ width:40px; height:40px; font-size:22px; }
      .pwa-btn-install{ padding:8px 14px; font-size:11.5px; }
    }
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

})();