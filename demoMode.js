/**
 * BhoomiSuraksha — Judges Demo Mode (Step 5)
 *
 * Mount (server.js me app.listen se PEHLE):
 *   require('./services/demoMode')(app, { express });
 *
 * Endpoints:
 *   GET  /api/demo/stream?cid=&role=phone|console&lat=&lon=   (SSE)
 *   POST /api/demo/location   { cid, lat, lon }               (phone apni location bhejta hai)
 *   POST /api/demo/scenario   { scenario, lat, lon, radiusKm, instant, includeUnknown, sms }   [AUTH]
 *   POST /api/demo/stop                                       [AUTH]
 *   GET  /api/demo/status                                     (public, koi secret nahi)
 *
 * AUTH: admin JWT (role=admin) YA header x-demo-pin == DEMO_PIN. Dono na ho to 401 (fail-closed).
 *
 * WALLET SAFETY:
 *   - Demo kabhi registered users ko SMS nahi bhejta.
 *   - SMS sirf DEMO_SMS=on ho, DEMO_SMS_NUMBERS (allowlist) set ho, aur daily cap (DEMO_SMS_MAX, default 5) bacha ho.
 *   - Cap file me persist hota hai (restart se reset nahi hota), din IST se badalta hai.
 *   - Do scenarios ke beech minimum gap (DEMO_MIN_GAP_MS, default 10s).
 *
 * Sensor data yahan SIMULATED hai (har event me simulated:true). Real sensor/autopilot pipeline ko touch nahi karta.
 */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

let jwt = null;
try { jwt = require('jsonwebtoken'); } catch (e) { /* admin JWT auth off, PIN chalega */ }

const SCENARIOS = {
  flood: {
    hazard: 'FLOOD', emoji: '🌊', label: 'Flood',
    primary: { key: 'waterLevel', label: 'Water level', unit: 'cm', start: 150, rate: 7, threshold: 300 },
    secondary: { key: 'rainfall', label: 'Rainfall', unit: 'mm/h', start: 38, inc: 2.5 },
    action: 'Move to higher ground now.'
  },
  landslide: {
    hazard: 'LANDSLIDE', emoji: '⛰️', label: 'Landslide',
    primary: { key: 'slopeTilt', label: 'Slope tilt', unit: '°', start: 2, rate: 0.5, threshold: 12 },
    secondary: { key: 'vibration', label: 'Vibration', unit: 'Hz', start: 1.2, inc: 0.6 },
    action: 'Stay away from slopes and leave the area.'
  },
  fire: {
    hazard: 'FIRE', emoji: '🔥', label: 'Forest fire',
    primary: { key: 'temperature', label: 'Temperature', unit: '°C', start: 38, rate: 1.6, threshold: 70 },
    secondary: { key: 'co', label: 'CO', unit: 'ppm', start: 8, inc: 4 },
    action: 'Move upwind, away from smoke and flames.'
  }
};

const PREDICT_ETA_MIN = 15;   // itne minute bache ho to early warning
const SIM_TICK_MS = 2000;     // 1 tick = 2 sec real = 1 simulated minute
const SIM_MAX_TICKS = 24;

function ist() { return new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10); }
function toNum(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
function sha(s) { return crypto.createHash('sha256').update(String(s)).digest(); }
function safeEq(a, b) { return crypto.timingSafeEqual(sha(a), sha(b)); }
function clip(v, n) { return String(v == null ? '' : v).trim().slice(0, n); }

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371, r = Math.PI / 180;
  const dLat = (lat2 - lat1) * r, dLon = (lon2 - lon1) * r;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function phones(input) {
  return String(input || '').split(',')
    .map(p => p.replace(/\D/g, '').slice(-10))
    .filter(p => p.length === 10)
    .filter((p, i, a) => a.indexOf(p) === i);
}

module.exports = function mountDemoMode(app, opts = {}) {
  const express = opts.express || require('express');
  const jsonBody = express.json({ limit: '4kb' });

  const DEMO_PIN = (process.env.DEMO_PIN || '').trim();
  const SMS_ON = String(process.env.DEMO_SMS || '').trim().toLowerCase() === 'on';
  const SMS_NUMBERS = phones(process.env.DEMO_SMS_NUMBERS);
  const SMS_MAX = Math.max(0, parseInt(process.env.DEMO_SMS_MAX || '5', 10) || 0);
  const MIN_GAP_MS = Math.max(0, parseInt(process.env.DEMO_MIN_GAP_MS || '10000', 10) || 0);
  const MAX_CLIENTS = 500;
  const STATE_FILE = path.join(__dirname, '..', 'demo-sms-state.json');

  let sendSMS = opts.sendSMS || null;
  if (!sendSMS) {
    try { sendSMS = require('./smsService').sendGeofencedSMS; } catch (e) { sendSMS = null; }
  }

  /* ---------- SMS budget (persistent) ---------- */
  function loadState() {
    try {
      const s = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      if (s && s.day === ist() && Number.isFinite(s.used)) return s;
    } catch (e) { /* fresh */ }
    return { day: ist(), used: 0 };
  }
  function saveState(s) {
    try { fs.writeFileSync(STATE_FILE, JSON.stringify(s)); } catch (e) { console.warn('⚠️ demo SMS state save failed:', e.message); }
  }
  let smsState = loadState();
  function budget() {
    if (smsState.day !== ist()) { smsState = { day: ist(), used: 0 }; saveState(smsState); }
    return { enabled: SMS_ON && SMS_NUMBERS.length > 0 && !!sendSMS, used: smsState.used, cap: SMS_MAX, remaining: Math.max(0, SMS_MAX - smsState.used) };
  }

  /* ---------- clients ---------- */
  const clients = new Map();   // cid -> { res, role, lat, lon, lastLocPost }
  let presenceTimer = null;

  function send(client, event, data) {
    try { client.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); return true; } catch (e) { return false; }
  }
  function sendToRole(role, event, data) {
    clients.forEach(c => { if (c.role === role) send(c, event, data); });
  }
  function presence() {
    let phonesN = 0, withLoc = 0, consoles = 0;
    clients.forEach(c => {
      if (c.role === 'console') consoles++;
      else { phonesN++; if (c.lat != null) withLoc++; }
    });
    return { phones: phonesN, phonesWithLocation: withLoc, consoles };
  }
  function pushPresence() {
    if (presenceTimer) return;
    presenceTimer = setTimeout(() => { presenceTimer = null; sendToRole('console', 'presence', presence()); }, 400);
  }

  setInterval(() => { clients.forEach(c => { try { c.res.write(': ping\n\n'); } catch (e) {} }); }, 20000).unref();

  /* ---------- auth ---------- */
  const failures = new Map();  // ip -> { n, until }
  function authCheck(req) {
    const ip = req.ip || (req.socket && req.socket.remoteAddress) || 'x';
    const f = failures.get(ip);
    if (f && f.n >= 10 && Date.now() < f.until) return { ok: false, status: 429, error: 'Bahut galat attempts — 10 min baad try karo' };

    const pin = req.headers['x-demo-pin'];
    if (DEMO_PIN && pin && safeEq(pin, DEMO_PIN)) { failures.delete(ip); return { ok: true, by: 'pin' }; }

    const h = req.headers.authorization || '';
    if (jwt && h.startsWith('Bearer ') && process.env.JWT_SECRET) {
      try {
        const u = jwt.verify(h.slice(7), process.env.JWT_SECRET, { algorithms: ['HS256'] });
        if (u && u.role === 'admin') return { ok: true, by: 'admin' };
      } catch (e) { /* neeche fail */ }
    }

    const cur = failures.get(ip) || { n: 0, until: 0 };
    cur.n += 1; cur.until = Date.now() + 10 * 60 * 1000;
    failures.set(ip, cur);
    return { ok: false, status: 401, error: DEMO_PIN ? 'PIN galat ya admin login nahi' : 'Admin login chahiye (DEMO_PIN set nahi hai)' };
  }
  function requireAuth(req, res, next) {
    const a = authCheck(req);
    if (!a.ok) return res.status(a.status).json({ ok: false, error: a.error });
    req.demoAuth = a;
    next();
  }

  /* ---------- run state ---------- */
  let run = null;          // current scenario run
  let lastRunAt = 0;
  let lastSummary = null;

  function stopRun(reason) {
    if (run && run.timer) clearInterval(run.timer);
    if (run) sendToRole('console', 'sim_end', { runId: run.id, reason: reason || 'finished' });
    run = null;
  }

  function riskOf(v, thr) {
    const r = v / thr;
    return r >= 1 ? 'SEVERE' : r >= 0.8 ? 'HIGH' : r >= 0.55 ? 'MODERATE' : 'LOW';
  }

  // linear slope (per tick = per simulated minute) over last 5 points
  function slope(hist) {
    const pts = hist.slice(-5);
    if (pts.length < 3) return null;
    const n = pts.length;
    return (pts[n - 1] - pts[0]) / (n - 1);
  }

  async function fireAlert(r, etaMin) {
    if (r.alerted) return;
    r.alerted = true;
    const sc = SCENARIOS[r.scenario];
    const at = Date.now();

    const etaText = etaMin != null ? ` About ${Math.max(1, Math.round(etaMin))} min to danger level.` : '';
    const message = clip(`${sc.emoji} DEMO ${sc.hazard} WARNING: ${sc.primary.label} rising fast near you.${etaText} ${sc.action}`, 200);

    let ringing = 0, outside = 0, unknown = 0;
    clients.forEach((c, cid) => {
      if (c.role !== 'phone') return;
      let dist = null;
      if (c.lat != null && c.lon != null) dist = haversineKm(c.lat, c.lon, r.lat, r.lon);
      const inside = dist != null && dist <= r.radiusKm;
      if (dist == null) unknown++;
      if (inside || (dist == null && r.includeUnknown)) {
        ringing++;
        send(c, 'alert', {
          id: r.id, time: at, scenario: r.scenario, hazard: sc.hazard, demo: true, message,
          lat: r.lat, lon: r.lon, radiusKm: r.radiusKm,
          distanceKm: dist == null ? null : Math.round(dist * 10) / 10
        });
      } else {
        outside++;
        send(c, 'skipped', {
          id: r.id, time: at, hazard: sc.hazard, message,
          distanceKm: dist == null ? null : Math.round(dist * 10) / 10, radiusKm: r.radiusKm,
          reason: dist == null ? 'location unknown' : 'outside radius'
        });
      }
    });

    // SMS: sirf allowlist, sirf cap ke andar, sirf jab maanga gaya ho
    const sms = { requested: !!r.sms, sent: 0, skippedReason: null };
    if (r.sms) {
      const b = budget();
      if (!b.enabled) sms.skippedReason = 'SMS disabled (DEMO_SMS=on aur DEMO_SMS_NUMBERS chahiye)';
      else if (b.remaining <= 0) sms.skippedReason = `Daily cap (${b.cap}) khatam`;
      else {
        const list = SMS_NUMBERS.slice(0, b.remaining);
        smsState.used += list.length;          // attempt se pehle hi count (conservative)
        saveState(smsState);
        try {
          const text = `BhoomiSuraksha DEMO (simulation, real emergency nahi): ${sc.hazard} warning. ${sc.action} Helpline 112`;
          const out = await sendSMS(list.join(','), text);
          sms.sent = out && out.success ? list.length : 0;
          if (!out || !out.success) sms.skippedReason = (out && out.error) || 'SMS gateway error';
        } catch (e) {
          sms.skippedReason = e.message;
        }
      }
    }

    lastSummary = {
      runId: r.id, scenario: r.scenario, at, radiusKm: r.radiusKm,
      origin: { lat: r.lat, lon: r.lon },
      phones: { ringing, outsideRadius: outside, unknownLocation: unknown, total: ringing + outside },
      etaMin: etaMin == null ? null : Math.round(etaMin * 10) / 10,
      sms, smsBudget: budget()
    };
    sendToRole('console', 'summary', lastSummary);
  }

  function startRun(sc, params) {
    stopRun('replaced');
    const id = 'demo-' + Date.now().toString(36);
    const r = { id, scenario: sc, ...params, alerted: false, tick: 0, hist: [], sec: [] };
    run = r;
    const def = SCENARIOS[sc];
    sendToRole('console', 'sim_start', { runId: id, scenario: sc, label: def.label, simulated: true, radiusKm: r.radiusKm, origin: { lat: r.lat, lon: r.lon } });

    if (r.instant) fireAlert(r, null);

    let value = def.primary.start;
    r.timer = setInterval(() => {
      if (run !== r) return clearInterval(r.timer);
      r.tick += 1;
      value += def.primary.rate * (0.85 + Math.random() * 0.3);       // thoda noise: rate asli compute hota hai
      r.hist.push(value);
      const sec = def.secondary.start + def.secondary.inc * r.tick * (0.9 + Math.random() * 0.2);
      const rate = slope(r.hist);
      const eta = rate && rate > 0 ? Math.max(0, (def.primary.threshold - value) / rate) : null;
      const risk = riskOf(value, def.primary.threshold);

      sendToRole('console', 'sim', {
        runId: id, simulated: true, tick: r.tick, simMinute: r.tick, scenario: sc,
        primary: { label: def.primary.label, unit: def.primary.unit, value: Math.round(value * 10) / 10, threshold: def.primary.threshold },
        secondary: { label: def.secondary.label, unit: def.secondary.unit, value: Math.round(sec * 10) / 10 },
        ratePerMin: rate == null ? null : Math.round(rate * 100) / 100,
        etaMin: eta == null ? null : Math.round(eta * 10) / 10,
        risk, alerted: r.alerted
      });

      if (!r.alerted && eta != null && eta <= PREDICT_ETA_MIN) fireAlert(r, eta);
      if (r.tick >= SIM_MAX_TICKS || value >= def.primary.threshold * 1.05) stopRun('finished');
    }, SIM_TICK_MS);
    return id;
  }

  /* ---------- routes ---------- */
  app.get('/api/demo/stream', (req, res) => {
    if (clients.size >= MAX_CLIENTS) return res.status(503).json({ ok: false, error: 'Too many demo devices' });
    const cid = clip(req.query.cid, 64);
    if (!/^[a-z0-9-]{8,64}$/i.test(cid)) return res.status(400).json({ ok: false, error: 'valid cid chahiye' });
    const role = req.query.role === 'console' ? 'console' : 'phone';

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const old = clients.get(cid);
    if (old) { try { old.res.end(); } catch (e) {} }

    const lat = toNum(req.query.lat), lon = toNum(req.query.lon);
    const okLoc = lat != null && lon != null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
    const client = { res, role, lat: okLoc ? lat : null, lon: okLoc ? lon : null, lastLocPost: 0 };
    clients.set(cid, client);

    send(client, 'hello', { cid, role, time: Date.now(), presence: presence(), sms: budget() });
    pushPresence();

    req.on('close', () => {
      if (clients.get(cid) === client) clients.delete(cid);
      pushPresence();
    });
  });

  app.post('/api/demo/location', jsonBody, (req, res) => {
    const cid = clip(req.body && req.body.cid, 64);
    const lat = toNum(req.body && req.body.lat), lon = toNum(req.body && req.body.lon);
    const c = clients.get(cid);
    if (!c) return res.status(404).json({ ok: false, error: 'Stream connected nahi hai' });
    if (lat == null || lon == null || Math.abs(lat) > 90 || Math.abs(lon) > 180) return res.status(400).json({ ok: false, error: 'Invalid lat/lon' });
    if (Date.now() - c.lastLocPost < 3000) return res.status(429).json({ ok: false, error: 'Too fast' });
    c.lastLocPost = Date.now();
    c.lat = lat; c.lon = lon;
    pushPresence();
    res.json({ ok: true });
  });

  app.post('/api/demo/scenario', requireAuth, jsonBody, (req, res) => {
    const b = req.body || {};
    const sc = String(b.scenario || '').toLowerCase();
    if (!SCENARIOS[sc]) return res.status(400).json({ ok: false, error: 'scenario: flood | landslide | fire' });

    const lat = toNum(b.lat), lon = toNum(b.lon);
    if (lat == null || lon == null || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      return res.status(400).json({ ok: false, error: 'Alert origin (lat, lon) chahiye' });
    }
    const radiusKm = Math.min(50, Math.max(1, toNum(b.radiusKm) || 15));

    const wait = MIN_GAP_MS - (Date.now() - lastRunAt);
    if (wait > 0) return res.status(429).json({ ok: false, error: `${Math.ceil(wait / 1000)}s ruko, phir dobara chalao` });
    lastRunAt = Date.now();

    const runId = startRun(sc, {
      lat, lon, radiusKm,
      instant: !!b.instant,
      includeUnknown: b.includeUnknown !== false,
      sms: !!b.sms
    });
    res.json({ ok: true, runId, scenario: sc, radiusKm, sms: budget(), by: req.demoAuth.by });
  });

  app.post('/api/demo/stop', requireAuth, (req, res) => {
    stopRun('stopped');
    clients.forEach(c => { if (c.role === 'phone') send(c, 'stop', { time: Date.now() }); });
    res.json({ ok: true });
  });

  app.get('/api/demo/status', (req, res) => {
    res.json({
      ok: true,
      presence: presence(),
      sms: budget(),
      auth: { pinConfigured: !!DEMO_PIN, adminJwt: !!jwt },
      scenarios: Object.keys(SCENARIOS),
      running: !!run,
      last: lastSummary
    });
  });

  const b = budget();
  console.log(`🎬 Demo mode mounted — auth: ${DEMO_PIN ? 'PIN + admin' : 'admin only (DEMO_PIN unset)'} | SMS: ${b.enabled ? `ON (cap ${b.cap}/day, used ${b.used})` : 'OFF'}`);

  return { SCENARIOS, budget, _clients: clients };
};
