/* ============================================================
   BhoomiSuraksha — Floating AI Disaster Assistant Chatbot
   FIXED: SOS ke upar stack hota hai — no clash
   
   Include: <script src="chatbot.js"></script> before </body>
============================================================ */

(function () {
  'use strict';

  if (window.__BHOOMI_CHATBOT_LOADED__) return;
  window.__BHOOMI_CHATBOT_LOADED__ = true;

  const API_BASE = window.BHOOMI_API || window.location.origin;

  /* ---- Styles (SOS-safe positions) ---- */
  const style = document.createElement('style');
  style.textContent = `
    /* Chat FAB sits ABOVE SOS button (SOS is usually bottom:20-24px) */
    .bs-chat-fab{
      position:fixed;
      bottom:96px;          /* SOS ke upar */
      right:24px;
      width:58px;height:58px;
      border-radius:50%;
      background:linear-gradient(135deg,#10b981,#059669);
      color:#fff;border:none;cursor:pointer;
      box-shadow:0 8px 24px rgba(16,185,129,.5);
      z-index:9997;
      display:flex;align-items:center;justify-content:center;
      font-size:1.6rem;
      transition:all .3s;
      animation:bsPulse 2.5s infinite;
    }
    .bs-chat-fab:hover{
      transform:scale(1.08);
      box-shadow:0 12px 32px rgba(16,185,129,.7);
    }
    .bs-chat-fab.hidden{display:none !important}
    .bs-chat-fab .badge{
      position:absolute;top:-2px;right:-2px;
      background:#dc2626;color:#fff;
      font-size:.6rem;font-weight:800;
      padding:2px 5px;border-radius:8px;
      border:2px solid #060b11;
      line-height:1.2;
    }
    @keyframes bsPulse{
      0%,100%{box-shadow:0 8px 24px rgba(16,185,129,.45)}
      50%{box-shadow:0 8px 28px rgba(16,185,129,.85)}
    }

    /* Ensure SOS stays below chatbot, never covered */
    .sos-fab, .sos-button, #sosFab, #sosBtn, .floating-sos,
    button.sos-fab, a.sos-fab, .sos-float{
      bottom:20px !important;
      right:24px !important;
      z-index:9996 !important;
    }

    .bs-chat-window{
      position:fixed;
      bottom:170px;         /* FAB ke upar open hota hai */
      right:24px;
      width:380px;
      max-width:calc(100vw - 32px);
      height:520px;
      max-height:calc(100vh - 200px);
      background:linear-gradient(145deg,#0b0f1a,#060b11);
      border:1px solid rgba(16,185,129,.3);
      border-radius:20px;
      box-shadow:0 20px 60px rgba(0,0,0,.65);
      z-index:9999;
      display:none;
      flex-direction:column;
      overflow:hidden;
      font-family:'Inter',system-ui,sans-serif;
    }
    .bs-chat-window.open{
      display:flex;
      animation:bsSlideUp .28s ease-out;
    }
    @keyframes bsSlideUp{
      from{opacity:0;transform:translateY(16px) scale(.98)}
      to{opacity:1;transform:translateY(0) scale(1)}
    }

    .bs-chat-header{
      padding:14px 16px;
      background:linear-gradient(135deg,rgba(16,185,129,.22),rgba(6,11,17,.95));
      border-bottom:1px solid rgba(16,185,129,.25);
      display:flex;align-items:center;justify-content:space-between;
      flex-shrink:0;
    }
    .bs-chat-title{
      display:flex;align-items:center;gap:10px;
      color:#fff;font-weight:700;font-size:.95rem;
    }
    .bs-chat-avatar{
      width:36px;height:36px;border-radius:50%;
      background:linear-gradient(135deg,#10b981,#059669);
      display:flex;align-items:center;justify-content:center;
      font-size:1.1rem;
      box-shadow:0 4px 12px rgba(16,185,129,.4);
      flex-shrink:0;
    }
    .bs-chat-status{
      font-size:.68rem;color:#10b981;
      display:flex;align-items:center;gap:5px;font-weight:500;
    }
    .bs-status-dot{
      width:7px;height:7px;background:#10b981;border-radius:50%;
      animation:bsBlink 1.5s infinite;
    }
    @keyframes bsBlink{0%,100%{opacity:1}50%{opacity:.35}}
    .bs-chat-close{
      background:rgba(255,255,255,.08);border:none;color:#fff;
      width:32px;height:32px;border-radius:50%;cursor:pointer;
      font-size:1.1rem;transition:all .2s;flex-shrink:0;
    }
    .bs-chat-close:hover{background:rgba(220,38,38,.35)}

    .bs-chat-body{
      flex:1;overflow-y:auto;padding:14px;
      display:flex;flex-direction:column;gap:10px;
      background:radial-gradient(ellipse at top,rgba(16,185,129,.05),transparent 60%);
    }
    .bs-chat-body::-webkit-scrollbar{width:5px}
    .bs-chat-body::-webkit-scrollbar-thumb{
      background:rgba(16,185,129,.3);border-radius:3px;
    }

    .bs-msg{
      max-width:88%;padding:11px 13px;border-radius:14px;
      font-size:.88rem;line-height:1.5;
      animation:bsMsgIn .25s;word-wrap:break-word;
    }
    @keyframes bsMsgIn{
      from{opacity:0;transform:translateY(6px)}
      to{opacity:1;transform:translateY(0)}
    }
    .bs-msg.bot{
      background:rgba(16,185,129,.12);
      border:1px solid rgba(16,185,129,.22);
      color:#e2e8f0;align-self:flex-start;
      border-bottom-left-radius:4px;
    }
    .bs-msg.user{
      background:linear-gradient(135deg,#10b981,#059669);
      color:#fff;align-self:flex-end;
      border-bottom-right-radius:4px;
      box-shadow:0 4px 12px rgba(16,185,129,.28);
    }
    .bs-msg.typing{
      background:rgba(16,185,129,.08);color:#94a3b8;
      font-style:italic;padding:12px 16px;
    }
    .bs-msg.typing .dots{display:inline-flex;gap:3px;margin-left:4px}
    .bs-msg.typing .dots span{
      width:6px;height:6px;background:#10b981;border-radius:50%;
      animation:bsDot 1.4s infinite;
    }
    .bs-msg.typing .dots span:nth-child(2){animation-delay:.2s}
    .bs-msg.typing .dots span:nth-child(3){animation-delay:.4s}
    @keyframes bsDot{
      0%,60%,100%{transform:translateY(0);opacity:.4}
      30%{transform:translateY(-5px);opacity:1}
    }

    .bs-chips{
      padding:0 12px 10px;display:flex;flex-wrap:wrap;gap:6px;
      flex-shrink:0;
    }
    .bs-chip{
      background:rgba(16,185,129,.1);
      border:1px solid rgba(16,185,129,.25);
      color:#10b981;padding:6px 11px;border-radius:14px;
      font-size:.72rem;cursor:pointer;transition:all .2s;
      font-family:inherit;
    }
    .bs-chip:hover{
      background:rgba(16,185,129,.22);
      transform:translateY(-1px);
    }

    .bs-chat-input{
      padding:10px 12px;
      border-top:1px solid rgba(255,255,255,.08);
      background:rgba(6,11,17,.95);
      display:flex;gap:8px;align-items:center;
      flex-shrink:0;
    }
    .bs-input-field{
      flex:1;background:rgba(255,255,255,.05);
      border:1px solid rgba(255,255,255,.1);
      color:#fff;padding:10px 14px;border-radius:22px;
      font-size:.88rem;font-family:inherit;outline:none;
      transition:all .2s;
    }
    .bs-input-field:focus{
      border-color:#10b981;
      background:rgba(16,185,129,.08);
    }
    .bs-input-field::placeholder{color:#64748b}
    .bs-send-btn{
      width:40px;height:40px;border-radius:50%;
      background:linear-gradient(135deg,#10b981,#059669);
      color:#fff;border:none;cursor:pointer;font-size:1rem;
      display:flex;align-items:center;justify-content:center;
      transition:all .2s;
      box-shadow:0 4px 12px rgba(16,185,129,.35);
      flex-shrink:0;
    }
    .bs-send-btn:hover:not(:disabled){transform:scale(1.06)}
    .bs-send-btn:disabled{opacity:.5;cursor:not-allowed}

    .bs-chat-footer{
      padding:7px 14px;text-align:center;
      font-size:.68rem;color:#64748b;
      background:rgba(6,11,17,.95);
      border-top:1px solid rgba(255,255,255,.05);
      flex-shrink:0;
    }
    .bs-chat-footer .bs-emergency{
      color:#ef4444;font-weight:700;
    }

    /* ---- Mobile: left side chatbot, right side SOS ---- */
    @media(max-width:640px){
      .bs-chat-fab{
        bottom:90px;
        right:16px;
        width:52px;height:52px;
        font-size:1.4rem;
      }
      .bs-chat-window{
        right:8px;left:8px;
        width:auto;
        bottom:160px;
        height:calc(100vh - 190px);
        max-height:none;
      }
      .sos-fab, .sos-button, #sosFab, #sosBtn, .floating-sos,
      button.sos-fab, a.sos-fab, .sos-float{
        bottom:16px !important;
        right:16px !important;
      }
    }
  `;
  document.head.appendChild(style);

  /* ---- Rule-based Fallback ---- */
  const FALLBACK = {
    flood: {
      en: "🌊 **Flood Safety:**\n• Move to higher ground immediately\n• Do NOT walk/drive through moving water\n• Turn OFF electricity and gas\n• Drink only boiled water\n• Call 1078 (NDRF) for rescue",
      hi: "🌊 **बाढ़ सुरक्षा:**\n• तुरंत ऊँची जगह जाएँ\n• बहते पानी में मत चलें\n• बिजली और गैस बंद करें\n• केवल उबला पानी पिएँ\n• बचाव के लिए 1078 (NDRF) कॉल करें"
    },
    earthquake: {
      en: "🌍 **Earthquake Safety:**\n• DROP-COVER-HOLD under sturdy desk\n• Stay indoors, don't run out\n• If outside — move to open area\n• Expect aftershocks\n• Emergency: 112",
      hi: "🌍 **भूकंप सुरक्षा:**\n• DROP-COVER-HOLD मज़बूत मेज़ के नीचे\n• घर के अंदर रहें, बाहर न भागें\n• बाहर हैं तो खुली जगह जाएँ\n• आफ्टरशॉक की उम्मीद रखें\n• आपातकालीन: 112"
    },
    cyclone: {
      en: "🌀 **Cyclone Safety:**\n• Stay indoors, away from windows\n• Stock 7 days food and water\n• Do NOT go out during eye of storm\n• Charge all devices\n• Follow IMD alerts",
      hi: "🌀 **चक्रवात सुरक्षा:**\n• घर के अंदर रहें, खिड़कियों से दूर\n• 7 दिन का भोजन और पानी रखें\n• तूफ़ान की आँख में बाहर न जाएँ\n• सारे डिवाइस चार्ज करें\n• IMD अलर्ट सुनें"
    },
    landslide: {
      en: "⛰️ **Landslide Safety:**\n• Move perpendicular (sideways) to slide\n• Watch for cracks in walls, tilting trees\n• Avoid rivers below slide area\n• Call NDRF 1078\n• Never enter debris zone",
      hi: "⛰️ **भूस्खलन सुरक्षा:**\n• स्लाइड के साइड में (लंबवत) भागें\n• दीवारों में दरार, झुके पेड़ देखें\n• स्लाइड क्षेत्र के नीचे नदियों से बचें\n• NDRF 1078 कॉल करें\n• मलबे में कभी न जाएँ"
    },
    cloudburst: {
      en: "💧 **Cloudburst Safety:**\n• Move to higher ground IMMEDIATELY\n• Don't cross streams, even small ones\n• Avoid valleys and river beds\n• Call 112 with exact location if trapped",
      hi: "💧 **बादल फटना:**\n• तुरंत ऊँची जगह जाएँ\n• छोटी धारा भी पार न करें\n• घाटियों से बचें\n• फँसे तो 112 पर लोकेशन दें"
    },
    sos: {
      en: "🆘 **Emergency Contacts:**\n• All Emergency: 112\n• NDRF: 1078\n• Disaster: 1070\n• Ambulance: 108\n• Fire: 101\n• Police: 100",
      hi: "🆘 **आपातकालीन संपर्क:**\n• सभी आपातकाल: 112\n• NDRF: 1078\n• आपदा: 1070\n• एम्बुलेंस: 108\n• अग्निशमन: 101\n• पुलिस: 100"
    },
    about: {
      en: "🏔️ **About BhoomiSuraksha:**\nAI-based Multi-Disaster Early Warning System for Pan-India. Covers Floods, Cyclones, Landslides, Earthquakes & Cloudbursts. Uses AI + Open-Meteo + geofenced alerts (5-10km).",
      hi: "🏔️ **BhoomiSuraksha के बारे में:**\nपूरे भारत के लिए AI-आधारित मल्टी-डिज़ास्टर अर्ली वार्निंग सिस्टम। बाढ़, चक्रवात, भूस्खलन, भूकंप और बादल फटना कवर करता है।"
    },
    heatwave: {
      en: "🔥 **Heat Wave Safety:**\n• Drink water every 15-20 min\n• Avoid outdoor work 12 PM–4 PM\n• Wear light cotton clothes\n• Keep ORS ready\n• Heat stroke signs → Call 108",
      hi: "🔥 **लू सुरक्षा:**\n• हर 15-20 मिनट में पानी पिएँ\n• दोपहर 12-4 बाहर मत जाओ\n• हल्के सूती कपड़े पहनें\n• ORS घर में रखें\n• लू के लक्षण → 108 कॉल करें"
    },
    default: {
      en: "🤖 I can help with disaster safety! Try:\n• Flood safety tips\n• Earthquake preparedness\n• Cyclone warnings\n• Landslide precautions\n• Emergency numbers\n\nHindi me bhi pooch sakte ho!",
      hi: "🤖 मैं आपदा सुरक्षा में मदद कर सकता हूँ! पूछें:\n• बाढ़ सुरक्षा टिप्स\n• भूकंप की तैयारी\n• चक्रवात चेतावनी\n• भूस्खलन सावधानियाँ\n• आपातकालीन नंबर"
    }
  };

  function isHindi(text) {
    return /[\u0900-\u097F]/.test(text);
  }

  function ruleBasedAnswer(query) {
    const q = query.toLowerCase();
    const lang = isHindi(query) ? 'hi' : 'en';
    if (/flood|baadh|बाढ़|पानी|drown/i.test(q)) return FALLBACK.flood[lang];
    if (/earthquake|bhookamp|भूकंप|zalzala|tremor/i.test(q)) return FALLBACK.earthquake[lang];
    if (/cyclone|toofan|तूफ़ान|चक्रवात|storm|hurricane/i.test(q)) return FALLBACK.cyclone[lang];
    if (/landslide|bhusakhalan|भूस्खलन|पहाड़|mudslide/i.test(q)) return FALLBACK.landslide[lang];
    if (/cloudburst|baadal|बादल|फटना|heavy rain|flash flood/i.test(q)) return FALLBACK.cloudburst[lang];
    if (/heat|loo|लू|गर्मी|heatwave/i.test(q)) return FALLBACK.heatwave[lang];
    if (/sos|emergency|help|मदद|आपात|number|contact|call/i.test(q)) return FALLBACK.sos[lang];
    if (/about|bhoomi|what is|kya hai|hello|hi|hey|namaste/i.test(q)) return FALLBACK.about[lang];
    return FALLBACK.default[lang];
  }

  /* ---- Chat State ---- */
  let chatHistory = [];
  try {
    chatHistory = JSON.parse(localStorage.getItem('bhoomi_chat_history') || '[]');
  } catch (e) { chatHistory = []; }

  /* ---- Build FAB (above SOS) ---- */
  const fab = document.createElement('button');
  fab.className = 'bs-chat-fab';
  fab.setAttribute('aria-label', 'Open AI Chatbot');
  fab.innerHTML = '<span>💬</span><span class="badge">AI</span>';
  fab.title = 'Ask BhoomiSuraksha AI Assistant';
  document.body.appendChild(fab);

  /* ---- Build Chat Window ---- */
  const win = document.createElement('div');
  win.className = 'bs-chat-window';
  win.innerHTML = `
    <div class="bs-chat-header">
      <div class="bs-chat-title">
        <div class="bs-chat-avatar">🤖</div>
        <div>
          <div>BhoomiSuraksha AI</div>
          <div class="bs-chat-status"><span class="bs-status-dot"></span> Online • Multilingual</div>
        </div>
      </div>
      <button class="bs-chat-close" title="Close" type="button">✕</button>
    </div>
    <div class="bs-chat-body" id="bsChatBody"></div>
    <div class="bs-chips" id="bsChips">
      <button class="bs-chip" type="button" data-q="Flood safety tips?">🌊 Flood</button>
      <button class="bs-chip" type="button" data-q="Earthquake me kya karna chahiye?">🌍 Earthquake</button>
      <button class="bs-chip" type="button" data-q="Cyclone warning kaise samjhein?">🌀 Cyclone</button>
      <button class="bs-chip" type="button" data-q="Landslide se kaise bachein?">⛰️ Landslide</button>
      <button class="bs-chip" type="button" data-q="Emergency numbers batao">🆘 SOS</button>
    </div>
    <div class="bs-chat-input">
      <input type="text" class="bs-input-field" id="bsInput"
        placeholder="Poochho disaster safety..." autocomplete="off" />
      <button class="bs-send-btn" id="bsSend" type="button" title="Send">➤</button>
    </div>
    <div class="bs-chat-footer">
      Powered by Kira AI 🧠 • Emergency? Call <span class="bs-emergency">112</span>
    </div>
  `;
  document.body.appendChild(win);

  const body = win.querySelector('#bsChatBody');
  const input = win.querySelector('#bsInput');
  const sendBtn = win.querySelector('#bsSend');
  const closeBtn = win.querySelector('.bs-chat-close');
  const chips = win.querySelectorAll('.bs-chip');

  /* ---- Helpers ---- */
  function formatMsg(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');
  }

  function addMsg(text, who) {
    const div = document.createElement('div');
    div.className = 'bs-msg ' + who;
    div.innerHTML = formatMsg(text);
    body.appendChild(div);
    body.scrollTop = body.scrollHeight;
    return div;
  }

  function saveHistory() {
    try {
      localStorage.setItem('bhoomi_chat_history', JSON.stringify(chatHistory.slice(-20)));
    } catch (e) {}
  }

  function showTyping() {
    const div = document.createElement('div');
    div.className = 'bs-msg typing';
    div.id = 'bsTyping';
    div.innerHTML = 'AI soch raha hai <span class="dots"><span></span><span></span><span></span></span>';
    body.appendChild(div);
    body.scrollTop = body.scrollHeight;
  }

  function hideTyping() {
    const t = document.getElementById('bsTyping');
    if (t) t.remove();
  }

  /* ---- Send ---- */
  async function sendMessage(text) {
    if (!text || !text.trim()) return;
    const q = text.trim();
    addMsg(q, 'user');
    chatHistory.push({ role: 'user', content: q });
    saveHistory();
    input.value = '';
    sendBtn.disabled = true;
    showTyping();

    let answer = null;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const res = await fetch(API_BASE + '/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: q,
          history: chatHistory.slice(-6),
          lang: isHindi(q) ? 'hi' : 'en'
        }),
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (res.ok) {
        const data = await res.json();
        if (data && data.reply) answer = data.reply;
      }
    } catch (e) {
      console.warn('[Chatbot] AI failed, using fallback:', e.message);
    }

    if (!answer) answer = ruleBasedAnswer(q);

    hideTyping();
    addMsg(answer, 'bot');
    chatHistory.push({ role: 'assistant', content: answer });
    saveHistory();
    sendBtn.disabled = false;
    input.focus();
  }

  /* ---- Events ---- */
  fab.addEventListener('click', function () {
    win.classList.add('open');
    fab.classList.add('hidden');
    input.focus();
    if (!body.children.length) {
      addMsg(
        "👋 Namaste! Main **BhoomiSuraksha AI** hoon.\nAap Hindi ya English me disaster safety pooch sakte ho. Neeche quick options hain 👇",
        'bot'
      );
    }
  });

  closeBtn.addEventListener('click', function () {
    win.classList.remove('open');
    fab.classList.remove('hidden');
  });

  sendBtn.addEventListener('click', function () {
    sendMessage(input.value);
  });

  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input.value);
    }
  });

  chips.forEach(function (chip) {
    chip.addEventListener('click', function () {
      sendMessage(chip.getAttribute('data-q'));
    });
  });

  /* Restore last messages */
  if (chatHistory.length) {
    chatHistory.slice(-8).forEach(function (m) {
      addMsg(m.content, m.role === 'user' ? 'user' : 'bot');
    });
  }

  /* Force SOS position if it exists (extra safety) */
  function fixSosPosition() {
    var sosSelectors = [
      '.sos-fab', '.sos-button', '#sosFab', '#sosBtn',
      '.floating-sos', 'button.sos-fab', 'a.sos-fab', '.sos-float'
    ];
    sosSelectors.forEach(function (sel) {
      document.querySelectorAll(sel).forEach(function (el) {
        el.style.bottom = '20px';
        el.style.right = '24px';
        el.style.zIndex = '9996';
      });
    });
  }
  fixSosPosition();
  setTimeout(fixSosPosition, 800);
  setTimeout(fixSosPosition, 2000);

  console.log('✅ [BhoomiSuraksha] Chatbot loaded (SOS-safe stack). API:', API_BASE);
})();