// ═══════════════════════════════════════════════════════════════
// 🏔️ BhoomiSuraksha — server.js v5.2 (security-hardened)
// Fixes: admin auth on dangerous routes, rate limits, JWT secret
//        enforced, no secrets in repo, env-based alert numbers,
//        reports no longer trigger siren directly, honest health
//        check, single login error, input validation.
// ═══════════════════════════════════════════════════════════════

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const axios = require('axios');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');

// ── JWT secret: bina strong secret ke server start hi nahi hoga ──
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32 || JWT_SECRET === 'bhoomi_dev_secret_change_me') {
  console.error('❌ JWT_SECRET missing/weak hai. .env mein 32+ char ka random secret set karo.');
  console.error('   Generate: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"');
  process.exit(1);
}
const JWT_EXPIRES = '7d';

// ── Services (lazy / crash-proof) ──
const { fetchWeatherData } = require('./services/openmeteo');
const { analyzeDisasterRisk, getChatbotReply } = require('./services/kiraAI');
const { fallbackRisk } = require('./services/riskFallback');
const { sendGeofencedSMS, getSMSStatus } = require('./services/smsService');
const { haversineDistance } = require('./services/haversine');
const iotService = require('./services/iotService');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // Render/Heroku proxy ke peeche sahi client IP ke liye

const PORT = process.env.PORT || 5000;

// ── CORS: sirf apne frontend origins ──
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || `http://localhost:${PORT}`)
  .split(',').map(s => s.trim()).filter(Boolean);

app.use(cors({
  origin(origin, cb) {
    // origin nahi = same-origin / curl / mobile webview
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    return cb(null, false);
  }
}));
app.use(express.json({ limit: '1mb' }));

console.log('🚀 BhoomiSuraksha server v5.2 booting...');

// ═══════════════════════════════════════════════════════════════
// 🚦 RATE LIMITERS
// ═══════════════════════════════════════════════════════════════
const makeLimiter = (windowMs, max, extra = {}) => rateLimit({
  windowMs, max,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Too many requests. Thodi der baad try karo.' },
  ...extra
});

// Global /api limiter (SSE stream aur IoT ingest alag handle hote hain)
app.use('/api', makeLimiter(15 * 60 * 1000, 300, {
  skip: (req) => req.originalUrl.startsWith('/api/siren/stream') ||
                 req.originalUrl.startsWith('/api/sensors/ingest')
}));

const authLimiter = makeLimiter(15 * 60 * 1000, 10);
const reportLimiter = makeLimiter(60 * 1000, 5);
const chatLimiter = makeLimiter(60 * 1000, 20);
const analyzeLimiter = makeLimiter(60 * 1000, 15);

// ═══════════════════════════════════════════════════════════════
// 🔥 FIREBASE INIT
// Supports:
// 1. FIREBASE_SERVICE_ACCOUNT = JSON string
// 2. FIREBASE_SERVICE_ACCOUNT = path/to/serviceAccountKey.json
// 3. FIREBASE_KEY_PATH = path/to/serviceAccountKey.json
// ═══════════════════════════════════════════════════════════════

const admin = require('firebase-admin');

let db = null;

function readJsonFile(filePath) {
  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(__dirname, filePath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Firebase credential file not found: ${absolutePath}`);
  }

  const raw = fs.readFileSync(absolutePath, 'utf8').trim();

  if (!raw) {
    throw new Error(`Firebase credential file is empty: ${absolutePath}`);
  }

  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `Invalid Firebase credential JSON in ${absolutePath}: ${err.message}`
    );
  }
}

function parseFirebaseCredential(value, variableName) {
  if (!value || typeof value !== 'string') {
    return null;
  }

  const input = value.trim();

  if (!input) {
    return null;
  }

  // -----------------------------------------------------------
  // Case 1: Environment variable contains complete JSON
  // -----------------------------------------------------------
  if (input.startsWith('{')) {
    try {
      return JSON.parse(input);
    } catch (err) {
      throw new Error(
        `${variableName} contains invalid JSON: ${err.message}`
      );
    }
  }

  // -----------------------------------------------------------
  // Case 2: Environment variable contains a file path
  // -----------------------------------------------------------
  return readJsonFile(input);
}

function loadFirebaseCreds() {
  // First priority:
  // FIREBASE_SERVICE_ACCOUNT
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    return parseFirebaseCredential(
      process.env.FIREBASE_SERVICE_ACCOUNT,
      'FIREBASE_SERVICE_ACCOUNT'
    );
  }

  // Second priority:
  // FIREBASE_KEY_PATH
  if (process.env.FIREBASE_KEY_PATH) {
    return parseFirebaseCredential(
      process.env.FIREBASE_KEY_PATH,
      'FIREBASE_KEY_PATH'
    );
  }

  // Third fallback:
  // serviceAccountKey.json in project root
  const defaultKeyPath = path.join(
    __dirname,
    'serviceAccountKey.json'
  );

  if (fs.existsSync(defaultKeyPath)) {
    console.warn(
      '⚠️ Firebase: using local serviceAccountKey.json'
    );

    return readJsonFile(defaultKeyPath);
  }

  return null;
}

try {
  const creds = loadFirebaseCreds();

  if (!creds) {
    console.warn(
      '⚠️ Firebase credentials nahi mili — MOCK mode enabled'
    );
  } else {
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(creds)
      });
    }

    db = admin.firestore();

    console.log('🔥 Firebase connected ✅');
    console.log(
      `🔥 Firebase Project: ${creds.project_id || 'unknown'}`
    );
  }
} catch (err) {
  db = null;

  console.warn(
    '⚠️ Firebase init failed — MOCK mode enabled'
  );

  console.warn(
    `⚠️ Firebase error: ${err.message}`
  );
}

global.db = db;

async function safeSave(collection, data) {
  try {
    if (!db) return null;
    const ref = await db.collection(collection).add({
      ...data,
      createdAt: new Date().toISOString(),
      serverTime: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log(`🔥 Saved ${collection}/${ref.id}`);
    return ref.id;
  } catch (err) {
    console.warn(`⚠️ Firestore save failed (${collection}):`, err.message);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// 🧰 HELPERS
// ═══════════════════════════════════════════════════════════════
const clip = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) && s.length <= 254;

// Indian 10-digit mobile numbers (+91 / 0 prefix hata deta hai)
function cleanPhones(input, max = 50) {
  const arr = Array.isArray(input) ? input : String(input || '').split(',');
  const out = new Set();
  for (const raw of arr) {
    const d = String(raw).replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, '');
    if (/^[6-9]\d{9}$/.test(d)) out.add(d);
  }
  return [...out].slice(0, max);
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

async function getUsersWithinRadius(lat, lon, radiusKm) {
  if (!db) return [];
  const snap = await db.collection('users').get();
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(u => u.lastLocation && typeof u.lastLocation.lat === 'number' && typeof u.lastLocation.lon === 'number')
    .map(u => ({
      userId: u.id, name: u.name, email: u.email, phone: u.phone,
      lat: u.lastLocation.lat, lon: u.lastLocation.lon,
      distance: haversineDistance(lat, lon, u.lastLocation.lat, u.lastLocation.lon)
    }))
    .filter(u => u.distance <= radiusKm)
    .sort((a, b) => a.distance - b.distance);
}

// ═══════════════════════════════════════════════════════════════
// 🛡️ STATIC FILES — SECRETS-SAFE
// Best: frontend files ek `public/` folder mein rakho. Agar public/ hai
// to sirf wahi serve hoga. Nahi hai to purane tareeke ka (stricter) fallback.
// ═══════════════════════════════════════════════════════════════
const PUBLIC_DIR = path.join(__dirname, 'public');
const HAS_PUBLIC = fs.existsSync(PUBLIC_DIR);
const STATIC_ROOT = HAS_PUBLIC ? PUBLIC_DIR : __dirname;

const BLOCKED_SEGMENTS = new Set(['node_modules', 'services', 'uploads', 'logs', 'public-backup']);
const BLOCKED_FILES = new Set([
  'server.js', 'package.json', 'package-lock.json', 'serviceaccountkey.json',
  'iot-simulator.js', 'test-fast2sms.js', 'firebase.json', 'firestore.rules', 'render.yaml'
]);

// Debug logs, scripts, config, docs — kabhi serve nahi honge (firebase-debug.log jaisi leaks band)
const BLOCKED_EXT = /\.(log|py|c|md|toml|listen|json|zip|map|yml|yaml|lock|sh|bat|ps1)$/i;

if (!HAS_PUBLIC) {
  console.warn('⚠️ public/ folder nahi mila — poora project folder serve ho raha hai (strict blocklist ke saath). Frontend files public/ mein move karo.');
  app.use((req, res, next) => {
    let p;
    try { p = decodeURIComponent(req.path).toLowerCase(); }
    catch { return res.status(400).json({ ok: false, error: 'Bad request' }); }
    // Exact path segments check — "/blogs" jaise valid paths block nahi honge
    const segs = p.split('/').filter(Boolean);
    const last = segs[segs.length - 1] || '';
    const extBlocked = BLOCKED_EXT.test(last) && last !== 'manifest.json';
    const blocked = extBlocked || segs.some(s => s.startsWith('.') || BLOCKED_SEGMENTS.has(s) || BLOCKED_FILES.has(s));
    if (blocked) {
      console.warn(`🛡️ Blocked sensitive path access: ${req.path}`);
      return res.status(403).json({ ok: false, error: 'Forbidden' });
    }
    next();
  });
}

app.use(express.static(STATIC_ROOT, { dotfiles: 'ignore' }));

// ═══════════════════════════════════════════════════════════════
// 🔐 AUTH HELPERS
// ═══════════════════════════════════════════════════════════════
function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ ok: false, error: 'No token provided' });
  try {
    req.user = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    next();
  } catch (e) {
    return res.status(401).json({ ok: false, error: 'Invalid or expired token' });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ ok: false, error: 'Admin access required' });
  }
  next();
}

const adminOnly = [authMiddleware, requireAdmin];

// IoT devices: x-api-key (SENSOR_API_KEY) YA admin JWT
function sensorAuth(req, res, next) {
  const key = req.headers['x-api-key'];
  const expected = process.env.SENSOR_API_KEY;
  if (expected && key && safeEqual(key, expected)) return next();
  return authMiddleware(req, res, () => requireAdmin(req, res, next));
}

// Dummy hash — "user not found" aur "wrong password" ka timing same rakhne ke liye
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', 10);

// ═══════════════════════════════════════════════════════════════
// 🔊 SSE MOBILE SIREN ENGINE
// ═══════════════════════════════════════════════════════════════
let sirenClients = [];
let sirenState = { alertActive: false, message: '', triggeredAt: null };
let sirenResetTimer = null;
const MAX_SIREN_CLIENTS = 2000;

app.get('/api/siren/stream', (req, res) => {
  if (sirenClients.length >= MAX_SIREN_CLIENTS) {
    return res.status(503).json({ ok: false, error: 'Too many connected devices' });
  }
  // Optional: phone apni (approx) location bhej sakta hai ?lat=&lon= — tab sirf radius ke andar wale phones bajenge.
  // Location na ho to device ko har alert milta hai (admin screens ke liye).
  const qLat = parseFloat(req.query.lat);
  const qLon = parseFloat(req.query.lon);
  const hasLoc = Number.isFinite(qLat) && Number.isFinite(qLon) &&
    qLat >= -90 && qLat <= 90 && qLon >= -180 && qLon <= 180;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const clientId = Date.now() + Math.random();
  sirenClients.push({ id: clientId, res, lat: hasLoc ? qLat : null, lon: hasLoc ? qLon : null });
  console.log(`📱 Mobile siren client connected${hasLoc ? ' (located)' : ''}. Total: ${sirenClients.length}`);

  res.write(`data: ${JSON.stringify({ alertActive: false, connected: true, located: hasLoc, time: Date.now() })}\n\n`);

  req.on('close', () => {
    sirenClients = sirenClients.filter(c => c.id !== clientId);
    console.log(`📱 Siren client disconnected. Total: ${sirenClients.length}`);
  });
});

setInterval(() => {
  sirenClients.forEach(client => {
    try { client.res.write(': ping\n\n'); } catch (e) {}
  });
}, 25000);

/**
 * @param {string} message
 * @param {{origin?:{lat:number,lon:number}, radiusKm?:number, hazard?:string, kind?:string}} [opts]
 *   origin + radiusKm do to: sirf radius ke andar located phones (aur bina-location devices) ko jata hai.
 * @returns {{sent:number,total:number,skippedOutside:number}}
 */
function broadcastSirenToMobiles(message, opts = {}) {
  const origin = opts.origin && Number.isFinite(opts.origin.lat) && Number.isFinite(opts.origin.lon) ? opts.origin : null;
  const radiusKm = Number.isFinite(opts.radiusKm) ? opts.radiusKm : null;
  const base = {
    alertActive: true,
    message: clip(message, 200) || '🚨 EMERGENCY ALERT — BhoomiSuraksha',
    hazard: opts.hazard || null,
    kind: opts.kind || null,
    radiusKm,
    time: Date.now()
  };
  sirenState = { alertActive: true, message: base.message, triggeredAt: base.time };

  let sent = 0, skippedOutside = 0;
  sirenClients.forEach(client => {
    let distanceKm = null;
    if (origin && radiusKm != null && client.lat != null) {
      distanceKm = haversineDistance(origin.lat, origin.lon, client.lat, client.lon);
      if (distanceKm > radiusKm) { skippedOutside++; return; }
    }
    try {
      client.res.write(`data: ${JSON.stringify({ ...base, distanceKm })}\n\n`);
      sent++;
    } catch (e) {}
  });
  console.log(`🚨 SIREN broadcast → ${sent}/${sirenClients.length} devices` +
    (skippedOutside ? ` (${skippedOutside} radius ke bahar, skip)` : '') + ` | "${base.message}"`);

  if (sirenResetTimer) clearTimeout(sirenResetTimer);
  sirenResetTimer = setTimeout(() => {
    sirenState = { alertActive: false, message: '', triggeredAt: null };
    console.log('✅ Siren state auto-reset');
  }, 90000);
  return { sent, total: sirenClients.length, skippedOutside };
}

app.get('/api/siren/status', (req, res) => {
  res.json({ ...sirenState, connectedDevices: sirenClients.length });
});

// ═══════════════════════════════════════════════════════════════
// 🚨 AUTOPILOT ENGINE (v5.2)
// - ALERT_NUMBERS (.env): responders/officials — hamesha milta hai
// - Residents: registered users jinki saved location origin se radius ke andar hai
//   (flood 15km, landslide 10km, fire 15km — AUTOPILOT_RADIUS_KM default 15)
// - Siren: radius ke andar located phones + bina-location devices (admin)
// - Cooldown: PER HAZARD (flood ka alert fire alert ko block nahi karta)
// - Kinds: PREDICTED (trend se pehle warning) → SEVERE (confirmed) escalation allowed
// ═══════════════════════════════════════════════════════════════
const RESPONDER_NUMBERS = cleanPhones(process.env.ALERT_NUMBERS || '');
const clampNum = (v, lo, hi, dflt) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt; };
const AUTOPILOT_RADIUS_KM = clampNum(process.env.AUTOPILOT_RADIUS_KM, 5, 50, 15);
const COOLDOWN_MS = clampNum(process.env.AUTOPILOT_COOLDOWN_SEC, 30, 3600, 300) * 1000;
const MAX_RESIDENT_SMS = clampNum(process.env.AUTOPILOT_MAX_RESIDENT_SMS, 1, 500, 50);
const RADIUS_BY_HAZARD = { flood: 15, landslide: 10, forest_fire: 15, earthquake: 15, cyclone: 15 };

const hazardCooldowns = new Map();   // hazardKey -> { until, kind }

function hazardKeyOf(type) {
  return String(type || 'unknown').toLowerCase().replace(/^predicted\s+/, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'unknown';
}
function cooldownAllows(key, kind) {
  const c = hazardCooldowns.get(key);
  if (!c || Date.now() >= c.until) return true;
  return c.kind === 'PREDICTED' && kind === 'SEVERE';       // prediction → confirmed: ek baar allowed
}

/**
 * Do tarah se call hota hai:
 *   triggerAutopilotResponse('FLOOD', 'message', { lat, lon, name }, { hazard, kind, radiusKm, nodeName })
 *   triggerAutopilotResponse({ hazard, message, lat, lon|lng, kind, radiusKm, nodeName })   // object form
 */
async function triggerAutopilotResponse(disasterType, message, origin = null, meta = {}) {
  if (disasterType && typeof disasterType === 'object') {
    const o = disasterType;
    meta = { hazard: o.hazard, kind: o.kind, radiusKm: o.radiusKm, nodeName: o.nodeName, nodeId: o.nodeId };
    message = o.message;
    origin = { lat: o.lat, lon: o.lon != null ? o.lon : o.lng, name: o.location };
    disasterType = (o.kind === 'PREDICTED' ? 'PREDICTED ' : '') + String(o.hazard || 'ALERT').toUpperCase();
  }
  meta = meta || {};
  const type = clip(disasterType, 60) || 'UNKNOWN';
  const kind = ['PREDICTED', 'SEVERE', 'MANUAL'].includes(meta.kind) ? meta.kind : 'SEVERE';
  const hazardKey = hazardKeyOf(meta.hazard || type);

  if (!cooldownAllows(hazardKey, kind)) {
    const left = Math.ceil((hazardCooldowns.get(hazardKey).until - Date.now()) / 1000);
    console.log(`⏳ Autopilot cooldown [${hazardKey}] — ${left}s baaki, duplicate alert skip.`);
    return { ok: false, cooldown: true, hazard: hazardKey, cooldownLeftSec: left };
  }
  hazardCooldowns.set(hazardKey, { until: Date.now() + COOLDOWN_MS, kind });

  const msg = clip(message, 160);
  const radiusKm = clampNum(meta.radiusKm, 1, 50, RADIUS_BY_HAZARD[hazardKey] || AUTOPILOT_RADIUS_KM);
  console.log(`\n🚨🚨🚨 AUTOPILOT ${kind}: ${type} (radius ${radiusKm}km) 🚨🚨🚨`);

  const hasOrigin = origin && typeof origin === 'object' &&
    Number.isFinite(origin.lat) && Number.isFinite(origin.lon);

  // 0) Siren — origin ho to geofenced, warna sab devices
  const siren = broadcastSirenToMobiles(`AUTOPILOT: ${type} — ${msg}`, {
    origin: hasOrigin ? origin : null, radiusKm, hazard: hazardKey, kind
  });

  const results = { responders: null, residents: null };

  // 1) Responders / officials
  if (RESPONDER_NUMBERS.length) {
    const text = `BhoomiSuraksha ADMIN ALERT: ${type} ${kind === 'PREDICTED' ? 'forecast' : 'detected'}. ${msg} Please verify and respond. Helpline 112 / NDRF 1070`;
    try {
      results.responders = await sendGeofencedSMS(RESPONDER_NUMBERS.join(','), text);
    } catch (e) {
      console.error('❌ Responder SMS failed:', e.message);
      results.responders = { success: false, error: e.message };
    }
  } else {
    console.warn('⚠️ ALERT_NUMBERS set nahi hai — responders ko SMS nahi gaya');
  }

  // 2) Residents — saved location se radius ke andar, nearest pehle, wallet cap ke saath
  let residentCount = 0, residentsInRadius = 0;
  if (hasOrigin) {
    try {
      const users = await getUsersWithinRadius(origin.lat, origin.lon, radiusKm);
      const allPhones = cleanPhones(users.map(u => u.phone), 500).filter(p => !RESPONDER_NUMBERS.includes(p));
      residentsInRadius = allPhones.length;
      const phones = allPhones.slice(0, MAX_RESIDENT_SMS);
      residentCount = phones.length;
      if (allPhones.length > phones.length) {
        console.warn(`⚠️ ${allPhones.length} residents radius mein, SMS cap ${MAX_RESIDENT_SMS} (nearest pehle)`);
      }
      if (phones.length) {
        const text = `BhoomiSuraksha ALERT: ${type} ${kind === 'PREDICTED' ? 'forecast' : 'detected'} within ${radiusKm}km of your last known location. ${msg} Move to a safe place. Helpline 112 / NDRF 1070`;
        results.residents = await sendGeofencedSMS(phones.join(','), text);
      }
    } catch (e) {
      console.error('❌ Resident SMS failed:', e.message);
      results.residents = { success: false, error: e.message };
    }
  } else {
    console.log('ℹ️ Autopilot: origin location nahi mili — residents ko SMS skip (siren + responders only)');
  }

  safeSave('autopilot_events', {
    disasterType: type, hazard: hazardKey, kind, message: msg,
    nodeId: meta.nodeId || null, nodeName: meta.nodeName || null,
    origin: hasOrigin ? { lat: origin.lat, lon: origin.lon } : null,
    radiusKm,
    responderCount: RESPONDER_NUMBERS.length,
    residentsInRadius, residentCount,
    siren,
    results,
    triggeredAt: new Date().toISOString()
  });

  return { ok: true, kind, hazard: hazardKey, radiusKm, siren, responders: RESPONDER_NUMBERS.length, residentsInRadius, residents: residentCount, results };
}

global.triggerAutopilotResponse = triggerAutopilotResponse;

app.post('/api/autopilot/trigger', ...adminOnly, async (req, res) => {
  const { disasterType = 'MANUAL_TEST', message = 'Admin manual autopilot test', lat, lon, radiusKm } = req.body || {};
  const origin = Number.isFinite(parseFloat(lat)) && Number.isFinite(parseFloat(lon))
    ? { lat: parseFloat(lat), lon: parseFloat(lon) } : null;
  const result = await triggerAutopilotResponse(disasterType, message, origin, { kind: 'MANUAL', radiusKm: parseFloat(radiusKm), hazard: disasterType });
  res.json({ ok: true, result });
});

app.post('/api/autopilot/reset', ...adminOnly, (req, res) => {
  hazardCooldowns.clear();
  iotService.resetAlertState();
  res.json({ ok: true, message: 'Autopilot cooldowns + sensor alert state reset' });
});

// ═══════════════════════════════════════════════════════════════
// 📡 IOT SENSOR ROUTES
// ═══════════════════════════════════════════════════════════════
app.post('/api/sensors/ingest', sensorAuth, (req, res) => {
  try {
    const parsed = iotService.normalizeIngest(req.body);
    if (!parsed.ok) return res.status(400).json({ ok: false, error: parsed.error });
    const state = iotService.processSensorData(parsed.nodeId, parsed.data, { location: parsed.location, deviceId: parsed.deviceId });
    if (!state.ok) return res.status(400).json({ ok: false, error: state.error });
    res.json({ ok: true, success: true, state });
  } catch (error) {
    console.error('❌ Sensor ingest error:', error.message);
    res.status(500).json({ ok: false, error: 'Sensor ingest failed' });
  }
});

// ═══ STEP 2: radius ke andar ke saare hazards ═══
app.use('/api', require('./services/nearbyRisk'));

app.get('/api/sensors/live', (req, res) => {
  try {
    const data = iotService.getLiveSensors();
    res.json({ ok: true, success: true, data });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Sensor data unavailable' });
  }
});

// ═══════════════════════════════════════════════════════════════
// 🛰️ HEALTH CHECK (real measurements — koi hardcoded ms nahi)
// ═══════════════════════════════════════════════════════════════
async function pingService(url, name) {
  const start = Date.now();
  try {
    await axios.get(url, { timeout: 5000, validateStatus: s => s < 500 });
    return { name, ok: true, status: 'ok', ms: Date.now() - start };
  } catch (e) {
    return { name, ok: false, status: e.response ? 'degraded' : 'unreachable', ms: null };
  }
}

async function pingFirestore() {
  if (!db) return { name: 'Firebase Firestore', ok: false, status: 'mock mode', ms: null };
  const start = Date.now();
  try {
    await Promise.race([
      db.collection('alerts').limit(1).get(),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 5000))
    ]);
    return { name: 'Firebase Firestore', ok: true, status: 'connected', ms: Date.now() - start };
  } catch (e) {
    return { name: 'Firebase Firestore', ok: false, status: 'unreachable', ms: null };
  }
}

app.get('/api/health', async (req, res) => {
  const [meteo, usgs, firestore] = await Promise.all([
    pingService('https://api.open-meteo.com/v1/forecast?latitude=21&longitude=79&current_weather=true', 'Open-Meteo'),
    pingService('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson', 'USGS Earthquake'),
    pingFirestore()
  ]);

  const kiraConfigured = Boolean(
    process.env.KIRA_API_KEY || process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY
  );
  const smsStatus = getSMSStatus();

  const services = [
    meteo,
    usgs,
    { name: 'Kira AI (Risk Engine)', ok: kiraConfigured, status: kiraConfigured ? 'configured' : 'fallback mode', ms: null },
    { name: 'Fast2SMS Gateway', ok: Boolean(smsStatus.configured), status: smsStatus.configured ? 'configured' : 'API key missing', ms: null },
    firestore,
    { name: 'Mobile Siren (SSE)', ok: true, status: `${sirenClients.length} devices`, ms: null },
    { name: 'IoT Sensor Engine', ok: true, status: 'active (simulated)', ms: null },
    { name: 'Autopilot Engine', ok: RESPONDER_NUMBERS.length > 0, status: RESPONDER_NUMBERS.length ? 'armed' : 'ALERT_NUMBERS not set', ms: null },
    { name: 'CWC Flood API', ok: false, status: 'not set', ms: null },
    { name: 'IMD API', ok: false, status: 'pending partnership', ms: null }
  ];

  res.json({
    ok: true,
    status: (meteo.ok && firestore.ok) ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    services,
    connectedSirens: sirenClients.length
  });
});

// ═══════════════════════════════════════════════════════════════
// 👤 AUTH ROUTES
// ═══════════════════════════════════════════════════════════════
app.post('/api/signup', authLimiter, async (req, res) => {
  if (!db) return res.status(503).json({ ok: false, error: 'Database offline' });
  try {
    const b = req.body || {};
    const name = clip(b.name, 80);
    const email = clip(b.email, 254).toLowerCase();
    const password = String(b.password || '');
    const state = clip(b.state, 60) || 'India';
    const phoneRaw = clip(b.phone, 20);
    const phone = phoneRaw ? (cleanPhones(phoneRaw, 1)[0] || null) : '';

    if (name.length < 2) return res.status(400).json({ ok: false, error: 'Valid name required' });
    if (!isEmail(email)) return res.status(400).json({ ok: false, error: 'Valid email required' });
    if (password.length < 8 || password.length > 72) {
      return res.status(400).json({ ok: false, error: 'Password must be 8-72 characters' });
    }
    if (phone === null) return res.status(400).json({ ok: false, error: 'Valid 10-digit phone required' });

    const existing = await db.collection('users').where('email', '==', email).get();
    if (!existing.empty) {
      return res.status(409).json({ ok: false, error: 'Email already registered' });
    }

    const hashed = await bcrypt.hash(password, 10);
    // role HAMESHA citizen — admin role sirf Firestore console se manually set hota hai
    const docRef = await db.collection('users').add({
      name, email, phone, state,
      password: hashed, role: 'citizen', createdAt: new Date().toISOString()
    });

    const token = jwt.sign({ id: docRef.id, email, role: 'citizen' }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
    console.log(`✅ New signup: ${name}`);
    res.json({ ok: true, success: true, token, user: { id: docRef.id, name, email, role: 'citizen', phone, state } });
  } catch (e) {
    console.error('❌ Signup error:', e.message);
    res.status(500).json({ ok: false, error: 'Signup failed. Try again.' });
  }
});

app.post('/api/login', authLimiter, async (req, res) => {
  if (!db) return res.status(503).json({ ok: false, error: 'Database offline' });
  const GENERIC = 'Invalid email or password';
  try {
    const email = clip((req.body || {}).email, 254).toLowerCase();
    const password = String((req.body || {}).password || '');
    if (!email || !password) return res.status(401).json({ ok: false, error: GENERIC });

    const snap = await db.collection('users').where('email', '==', email).get();
    if (snap.empty) {
      await bcrypt.compare(password, DUMMY_HASH); // timing barabar rakho
      return res.status(401).json({ ok: false, error: GENERIC });
    }

    const doc = snap.docs[0];
    const data = doc.data();
    const match = await bcrypt.compare(password, data.password || DUMMY_HASH);
    if (!match) return res.status(401).json({ ok: false, error: GENERIC });

    const token = jwt.sign({ id: doc.id, email: data.email, role: data.role || 'citizen' }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
    console.log(`✅ Login: ${data.email}`);
    res.json({ ok: true, success: true, token, user: { id: doc.id, name: data.name, email: data.email, role: data.role || 'citizen', phone: data.phone, state: data.state } });
  } catch (e) {
    console.error('❌ Login error:', e.message);
    res.status(500).json({ ok: false, error: 'Login failed. Try again.' });
  }
});

app.get('/api/me', authMiddleware, async (req, res) => {
  if (!db) return res.json({ ok: true, user: req.user });
  try {
    const doc = await db.collection('users').doc(req.user.id).get();
    if (!doc.exists) return res.status(404).json({ ok: false, error: 'User not found' });
    const d = doc.data();
    res.json({ ok: true, user: { id: doc.id, name: d.name, email: d.email, phone: d.phone, state: d.state, role: d.role } });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'Could not load profile' });
  }
});

app.put('/api/profile', authMiddleware, async (req, res) => {
  if (!db) return res.json({ ok: true, demo: true });
  try {
    const { name, phone, state } = req.body || {};
    const updates = {};
    if (name) updates.name = clip(name, 80);
    if (phone !== undefined) {
      const p = clip(phone, 20) ? cleanPhones(phone, 1)[0] : '';
      if (p === undefined) return res.status(400).json({ ok: false, error: 'Valid 10-digit phone required' });
      updates.phone = p;
    }
    if (state) updates.state = clip(state, 60);
    await db.collection('users').doc(req.user.id).update(updates);
    res.json({ ok: true, success: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'Profile update failed' });
  }
});

// ═══════════════════════════════════════════════════════════════
// 📍 USER LOCATION
// ═══════════════════════════════════════════════════════════════
app.post('/api/user/location', authMiddleware, async (req, res) => {
  const { lat, lon, accuracy, source } = req.body || {};
  if (typeof lat !== 'number' || typeof lon !== 'number' ||
      lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return res.status(400).json({ ok: false, error: 'Valid lat/lon required' });
  }
  try {
    if (db) {
      await db.collection('users').doc(req.user.id).set({
        lastLocation: {
          lat, lon,
          accuracy: typeof accuracy === 'number' ? accuracy : null,
          source: clip(source, 20) || 'browser',
          updatedAt: new Date().toISOString()
        }
      }, { merge: true });
    }
    res.json({ ok: true, success: true, message: 'Location saved for geofence alerts' });
  } catch (e) {
    console.warn('⚠️ Location save failed (non-fatal):', e.message);
    res.json({ ok: true, success: true, demo: true });
  }
});

// ═══════════════════════════════════════════════════════════════
// 🧠 AI ANALYZE RISK
// ═══════════════════════════════════════════════════════════════
app.post('/api/analyze-risk', analyzeLimiter, async (req, res) => {
  const lat = parseFloat(req.body.lat);
  const lon = parseFloat(req.body.lon);

  if (Number.isNaN(lat) || Number.isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return res.status(400).json({ ok: false, error: 'Valid lat/lon required' });
  }

  const location = clip(req.body.location, 120) || `${lat.toFixed(3)}°N, ${lon.toFixed(3)}°E`;
  const disasterType = clip(req.body.disasterType, 40) || 'multi';

  console.log(`🧠 ANALYZE-RISK → ${location} [${lat}, ${lon}] type=${disasterType}`);

  const w = await fetchWeatherData(lat, lon);
  const kiraWeather = {
    temp: w.temperature,
    rain: w.totalRainfall24h,
    windSpeed: w.windSpeed,
    humidity: w.humidity
  };

  let analysis = null;
  let engine = 'kira-ai';

  try {
    const ai = await analyzeDisasterRisk({ lat, lon, location, disasterType, weather: kiraWeather });
    if (ai.ok) {
      analysis = ai.data;
      engine = 'kira-ai';
    } else {
      throw new Error(ai.error || 'AI unavailable');
    }
  } catch (e) {
    console.warn('⚠️ Kira AI down → rule fallback:', e.message);
    analysis = fallbackRisk({ weather: kiraWeather, disasterType, location });
    engine = 'rule-fallback';
  }

  safeSave('ai_analyses', { lat, lon, location, disasterType, weather: kiraWeather, analysis, engine });

  const weatherOut = {
    temperature: w.temperature,
    humidity: w.humidity,
    rainfall24h: w.totalRainfall24h,
    maxHourlyRainfall: w.maxHourlyRainfall,
    windSpeed: w.windSpeed,
    windGusts: w.maxWindGust,
    soilMoisture: w.avgSoilMoisture,
    cloudBurstRisk: w.cloudBurstRisk,
    source: w.source
  };

  console.log(`✅ Result: ${analysis.riskLevel} ${analysis.score}/100 (${analysis.primaryDisaster}) [${engine}]`);

  res.json({
    ok: true,
    success: true,
    lat, lon, location, disasterType,
    riskLevel: analysis.riskLevel,
    score: analysis.score,
    riskScore: analysis.score,
    primaryDisaster: analysis.primaryDisaster,
    explanation: analysis.explanation,
    explanationHindi: analysis.explanationHindi,
    smsEnglish: analysis.smsEnglish,
    smsHindi: analysis.smsHindi,
    recommendedAction: analysis.recommendedAction,
    confidence: analysis.confidence,
    engine,
    weather: weatherOut
  });
});

// ═══════════════════════════════════════════════════════════════
// 📢 GEOFENCE ALERT DISPATCH (ADMIN ONLY — siren + DB writes)
// ═══════════════════════════════════════════════════════════════
app.post('/api/alerts/geofence', ...adminOnly, async (req, res) => {
  const {
    lat, lon, location, radiusKm = 10,
    riskLevel = 'High', score = 70,
    primaryDisaster = 'Multi-Hazard',
    smsEnglish = '', smsHindi = '',
    engine = 'manual-dispatch'
  } = req.body || {};

  if (typeof lat !== 'number' || typeof lon !== 'number') {
    return res.status(400).json({ ok: false, error: 'Valid lat/lon required' });
  }
  const radius = Math.min(Math.max(parseFloat(radiusKm) || 10, 0.5), 200);

  console.log(`📢 GEOFENCE DISPATCH → ${location} [${lat}, ${lon}] r=${radius}km ${riskLevel} ${primaryDisaster}`);

  let usersInZone = [];
  try {
    usersInZone = await getUsersWithinRadius(lat, lon, radius);
  } catch (e) {
    console.warn('⚠️ User scan failed:', e.message);
  }

  const alertId = await safeSave('alerts', {
    lat, lon, location: clip(location, 120) || 'Unknown',
    radiusKm: radius,
    riskLevel, score, primaryDisaster,
    smsEnglish: clip(smsEnglish, 400), smsHindi: clip(smsHindi, 400),
    totalUsersTargeted: usersInZone.length,
    status: 'active',
    engine,
    dispatchedBy: req.user.email
  });

  let notified = 0;
  if (db && alertId && usersInZone.length) {
    try {
      const batch = db.batch();
      usersInZone.slice(0, 400).forEach(u => {
        batch.set(db.collection('user_alerts').doc(), {
          alertId, userId: u.userId, userName: u.name,
          userPhone: u.phone || null, userDistance: u.distance,
          riskLevel, primaryDisaster, locationName: location,
          smsEnglish, smsHindi, read: false, smsStatus: 'pending',
          createdAt: new Date().toISOString()
        });
      });
      await batch.commit();
      notified = Math.min(usersInZone.length, 400);
    } catch (e) {
      console.warn('⚠️ user_alerts batch failed:', e.message);
    }
  }

  const lvl = String(riskLevel).toLowerCase();
  if (lvl === 'severe' || lvl === 'high') {
    broadcastSirenToMobiles(`${String(riskLevel).toUpperCase()} ${primaryDisaster} alert — ${location}. Radius ${radius}km. Call 112.`);
  }

  res.json({
    ok: true, success: true,
    id: alertId || 'demo-' + Date.now(),
    usersTargeted: usersInZone.length,
    usersNotified: notified,
    message: `Alert saved. ${usersInZone.length} users within ${radius}km.`
  });
});

// ═══════════════════════════════════════════════════════════════
// 📥 ALERTS FEED
// ═══════════════════════════════════════════════════════════════
app.get('/api/alerts', async (req, res) => {
  if (!db) return res.json({ ok: true, alerts: [], count: 0 });
  try {
    const snap = await db.collection('alerts')
      .orderBy('serverTime', 'desc').limit(50).get();
    const alerts = [];
    snap.forEach(doc => {
      const d = doc.data();
      alerts.push({ id: doc.id, ...d, createdAt: d.createdAt || new Date().toISOString() });
    });
    res.json({ ok: true, alerts, count: alerts.length });
  } catch (e) {
    console.error('❌ /api/alerts:', e.message);
    res.json({ ok: true, alerts: [], count: 0 });
  }
});

app.get('/api/alerts/my', authMiddleware, async (req, res) => {
  if (!db) return res.json({ ok: true, success: true, alerts: [] });
  try {
    const snap = await db.collection('user_alerts')
      .where('userId', '==', req.user.id)
      .orderBy('createdAt', 'desc').limit(20).get();
    const alerts = [];
    snap.forEach(doc => alerts.push({ id: doc.id, ...doc.data() }));
    res.json({ ok: true, success: true, alerts });
  } catch (e) {
    console.warn('⚠️ /api/alerts/my:', e.message);
    res.json({ ok: true, success: true, alerts: [] });
  }
});

// ═══════════════════════════════════════════════════════════════
// 📋 CITIZEN REPORTS
// Public submit (rate-limited) → status "pending". Siren/alert SIRF
// admin approve karne par. Public GET mein name/phone nahi jaata.
// ═══════════════════════════════════════════════════════════════
const SEVERITIES = ['low', 'moderate', 'high', 'severe'];

app.post('/api/reports', reportLimiter, async (req, res) => {
  const b = req.body || {};
  const severity = String(b.severity || 'moderate').toLowerCase();
  if (!SEVERITIES.includes(severity)) {
    return res.status(400).json({ ok: false, error: 'Invalid severity' });
  }

  const location = clip(b.location, 120);
  const description = clip(b.description, 1000);
  const lat = parseFloat(b.lat);
  const lon = parseFloat(b.lon);
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lon) &&
    lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;

  if (!description && !location && !hasCoords) {
    return res.status(400).json({ ok: false, error: 'Location or description required' });
  }

  const phone = clip(b.phone, 20) ? (cleanPhones(b.phone, 1)[0] || '') : '';

  try {
    const reportId = await safeSave('reports', {
      name: clip(b.name, 80) || 'Anonymous',
      phone,
      state: clip(b.state, 60),
      lat: hasCoords ? lat : null,
      lon: hasCoords ? lon : null,
      location,
      disasterType: clip(b.disasterType, 40) || 'Other',
      severity,
      description,
      status: 'pending'
    });

    // Report save hui hi nahi to jhooth mat bolo — client ko error milega
    if (!reportId) {
      return res.status(503).json({ ok: false, error: 'Report could not be saved right now. Please try again.' });
    }

    console.log(`📋 REPORT (pending) → ${b.disasterType} (${severity}) @ ${location}`);
    res.json({ ok: true, success: true, id: reportId, status: 'pending', message: 'Report submitted. It will be verified before any alert is sent.' });
  } catch (e) {
    console.error('❌ Report error:', e.message);
    res.status(500).json({ ok: false, error: 'Report submit failed' });
  }
});

// Public view: sanitized (koi personal data nahi), rejected hide
app.get('/api/reports', async (req, res) => {
  if (!db) return res.json({ ok: true, reports: [] });
  try {
    const snap = await db.collection('reports').orderBy('serverTime', 'desc').limit(30).get();
    const reports = [];
    snap.forEach(d => {
      const r = d.data();
      if (r.status === 'rejected') return;
      reports.push({
        id: d.id,
        disasterType: r.disasterType, severity: r.severity,
        location: r.location, lat: r.lat, lon: r.lon,
        description: r.description, status: r.status, createdAt: r.createdAt
      });
    });
    res.json({ ok: true, reports });
  } catch (e) {
    res.json({ ok: true, reports: [] });
  }
});

// Admin: full details (name/phone ke saath)
app.get('/api/admin/reports', ...adminOnly, async (req, res) => {
  if (!db) return res.json({ ok: true, reports: [] });
  try {
    const snap = await db.collection('reports').orderBy('serverTime', 'desc').limit(100).get();
    const reports = [];
    snap.forEach(d => reports.push({ id: d.id, ...d.data() }));
    res.json({ ok: true, reports });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'Could not load reports' });
  }
});

// Admin: approve/reject. Approve + { siren: true } hi siren bajata hai.
app.post('/api/reports/:id/review', ...adminOnly, async (req, res) => {
  if (!db) return res.status(503).json({ ok: false, error: 'Database offline' });
  try {
    const { action, siren = false } = req.body || {};
    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ ok: false, error: "action must be 'approve' or 'reject'" });
    }
    const ref = db.collection('reports').doc(String(req.params.id));
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ ok: false, error: 'Report not found' });

    const r = doc.data();
    const status = action === 'approve' ? 'verified' : 'rejected';
    await ref.update({ status, reviewedBy: req.user.email, reviewedAt: new Date().toISOString() });

    if (action === 'approve' && siren === true) {
      broadcastSirenToMobiles(`VERIFIED REPORT: ${r.disasterType} at ${r.location || 'reported area'}. Severity: ${String(r.severity).toUpperCase()}.`);
    }
    res.json({ ok: true, success: true, status, sirenSent: action === 'approve' && siren === true });
  } catch (e) {
    console.error('❌ Report review error:', e.message);
    res.status(500).json({ ok: false, error: 'Review failed' });
  }
});

// ═══════════════════════════════════════════════════════════════
// 🤖 AI CHATBOT
// ═══════════════════════════════════════════════════════════════
app.post('/api/chat', chatLimiter, async (req, res) => {
  const { history = [], lang = 'en' } = req.body || {};
  const message = clip((req.body || {}).message, 1000);
  if (!message) return res.status(400).json({ ok: false, error: 'message required' });
  const safeHistory = Array.isArray(history) ? history.slice(-10) : [];
  try {
    const result = await getChatbotReply(message, safeHistory, lang === 'hi' ? 'hi' : 'en');
    res.json({ ok: true, success: true, reply: result.reply || 'Emergency? Dial 112 / NDRF 1078.' });
  } catch (e) {
    res.json({ ok: true, success: true, reply: lang === 'hi'
      ? 'AI offline। आपात स्थिति में 112 डायल करें।'
      : 'AI offline. For emergencies dial 112.' });
  }
});

// ═══════════════════════════════════════════════════════════════
// 📱 SMS + SIREN DISPATCH (ADMIN ONLY)
// ═══════════════════════════════════════════════════════════════
app.post('/api/sms/send-test', ...adminOnly, async (req, res) => {
  const { phone, phones, message } = req.body || {};
  const numbers = cleanPhones(phones || phone || '');
  if (!numbers.length) {
    return res.status(400).json({ ok: false, error: 'At least one valid 10-digit phone number required' });
  }
  const text = clip(message, 300) ||
    'BhoomiSuraksha ALERT: Severe disaster risk in your area. Move to safe location. Helpline 112 / NDRF 1070';

  console.log(`📢 SMS DISPATCH by ${req.user.email} → ${numbers.length} numbers`);

  broadcastSirenToMobiles(text.slice(0, 140));

  const smsResult = await sendGeofencedSMS(numbers.join(','), text);
  safeSave('sms_logs', { target: numbers.join(','), message: text, result: smsResult, sentBy: req.user.email });

  if (smsResult.success) {
    res.json({ ok: true, success: true, message: 'SMS sent + Siren broadcasted!', smsResult });
  } else {
    res.json({
      ok: true, success: false,
      message: 'Siren broadcasted. SMS failed: ' + (smsResult.error || 'unknown'),
      smsResult
    });
  }
});

// ═══════════════════════════════════════════════════════════════
// 🎯 DEMO: GEOFENCED SMS (ADMIN ONLY)
// ═══════════════════════════════════════════════════════════════
app.post('/api/demo/send-geofenced-sms', ...adminOnly, async (req, res) => {
  const {
    disasterType = 'Flood', disasterLocation = 'Demo Zone',
    disasterLat, disasterLon, radiusKm = 10, testUsers = []
  } = req.body || {};

  const dLat = parseFloat(disasterLat);
  const dLon = parseFloat(disasterLon);
  if (Number.isNaN(dLat) || Number.isNaN(dLon)) {
    return res.status(400).json({ success: false, error: 'Valid disasterLat/disasterLon required' });
  }
  const radius = Math.min(Math.max(parseFloat(radiusKm) || 10, 0.5), 200);
  const type = clip(disasterType, 40);
  const where = clip(disasterLocation, 100);

  console.log(`🎯 GEOFENCE DEMO → ${where} [${dLat}, ${dLon}] r=${radius}km`);

  const matchedUsers = [];
  const skippedUsers = [];

  (Array.isArray(testUsers) ? testUsers.slice(0, 100) : []).forEach(u => {
    const uLat = parseFloat(u.lat);
    const uLon = parseFloat(u.lon);
    if (Number.isNaN(uLat) || Number.isNaN(uLon)) return;
    const dist = haversineDistance(dLat, dLon, uLat, uLon);
    const entry = { name: clip(u.name, 80), phone: u.phone, distanceKm: Number(dist.toFixed(2)) };
    if (dist <= radius) matchedUsers.push(entry);
    else skippedUsers.push(entry);
  });

  let smsResult = null;
  if (matchedUsers.length) {
    const numbers = cleanPhones(matchedUsers.map(u => u.phone), 100);
    if (numbers.length) {
      const msg = `BhoomiSuraksha ${type.toUpperCase()} ALERT: ${type} detected near ${where}. You are within ${radius}km danger zone. Move to safety NOW. Helpline 112 / NDRF 1070`;
      smsResult = await sendGeofencedSMS(numbers.join(','), msg);
    }
    broadcastSirenToMobiles(`${type} near ${where} — ${radius}km zone`);
    safeSave('demo_logs', { disasterType: type, disasterLocation: where, matched: matchedUsers.length, smsResult, by: req.user.email });
  }

  res.json({
    success: true,
    summary: { totalEvaluated: matchedUsers.length + skippedUsers.length, radiusKm: radius },
    matchedUsers, skippedUsers, smsResult
  });
});

// ═══════════════════════════════════════════════════════════════
// 🌍 REALTIME USGS PUBLISH (ADMIN ONLY)
// ═══════════════════════════════════════════════════════════════
app.post('/api/realtime/publish-alerts', ...adminOnly, async (req, res) => {
  const minMag = parseFloat((req.body && req.body.minMag)) || 4.5;
  try {
    const { data } = await axios.get('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson', { timeout: 10000 });
    const quakes = (data.features || [])
      .filter(f => (f.properties?.mag || 0) >= minMag)
      .filter(f => {
        const [lon, lat] = f.geometry?.coordinates || [];
        return lon >= 65 && lon <= 100 && lat >= 5 && lat <= 40;
      })
      .slice(0, 3);

    let published = 0;
    for (const q of quakes) {
      const mag = q.properties.mag;
      const place = q.properties.place || 'India region';
      const [lon, lat] = q.geometry.coordinates;
      const riskLevel = mag >= 6 ? 'Severe' : mag >= 5 ? 'High' : 'Moderate';
      await safeSave('alerts', {
        lat, lon, location: place, radiusKm: 50,
        riskLevel, score: Math.min(100, Math.round(mag * 14)),
        primaryDisaster: 'Earthquake',
        smsEnglish: `BhoomiSuraksha: Earthquake M${mag} near ${place}. Aftershocks possible. Drop-Cover-Hold. Helpline 112`,
        smsHindi: `भूमिसुरक्षा: ${place} के पास भूकंप M${mag}। सावधान रहें। 112`,
        engine: 'usgs-realtime', status: 'active'
      });
      published++;
    }
    console.log(`🌍 Published ${published} USGS alerts`);
    res.json({ success: true, published, message: `${published} earthquake alerts published` });
  } catch (e) {
    console.warn('⚠️ USGS publish failed:', e.message);
    res.status(502).json({ success: false, published: 0, message: 'USGS feed unavailable' });
  }
});

// ═══════════════════════════════════════════════════════════════
// 📰 RSS NEWS FEED
// ═══════════════════════════════════════════════════════════════
let rssCache = { items: null, at: 0 };

app.get('/api/rss', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 40, 50);

  if (rssCache.items && (Date.now() - rssCache.at) < 300000) {
    return res.json({ ok: true, items: rssCache.items.slice(0, limit) });
  }

  try {
    const { data } = await axios.get(
      'https://news.google.com/rss/search?q=india+flood+OR+cyclone+OR+landslide+OR+earthquake+OR+IMD+alert&hl=en-IN&gl=IN&ceid=IN:en',
      { timeout: 10000, responseType: 'text' }
    );

    const items = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let m;
    while ((m = itemRegex.exec(data)) && items.length < limit) {
      const block = m[1];
      const grab = (tag) => {
        const r = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`).exec(block);
        if (!r) return '';
        return r[1].replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, '').trim();
      };
      const title = grab('title');
      const link = grab('link');
      const pubDate = grab('pubDate');
      const source = grab('source') || 'Google News';
      if (title) {
        const parsed = pubDate ? new Date(pubDate) : null;
        items.push({
          id: 'rss_' + items.length + '_' + Date.now(),
          title,
          description: title,
          link,
          source,
          pubDate: parsed && !isNaN(parsed) ? parsed.toISOString() : null
        });
      }
    }

    if (items.length) {
      rssCache = { items, at: Date.now() };
      console.log(`📰 RSS: ${items.length} items fetched`);
      return res.json({ ok: true, items: items.slice(0, limit) });
    }
    throw new Error('No items parsed');
  } catch (e) {
    console.warn('⚠️ RSS fetch failed:', e.message);
    // Purana cache (stale) better hai fake data se, par client ko batao
    if (rssCache.items) {
      return res.json({ ok: true, items: rssCache.items.slice(0, limit), stale: true });
    }
    res.status(502).json({ ok: false, items: [], error: 'feed-unavailable' });
  }
});

// ═══════════════════════════════════════════════════════════════
// 🔔 PUSH SUBSCRIPTIONS
// ═══════════════════════════════════════════════════════════════
app.post('/api/push/subscribe', makeLimiter(60 * 1000, 10), async (req, res) => {
  const { subscription, userId } = req.body || {};
  if (!subscription || typeof subscription !== 'object' || !subscription.endpoint) {
    return res.status(400).json({ ok: false, error: 'valid subscription required' });
  }
  await safeSave('push_subscriptions', { subscription, userId: clip(userId, 60) || 'anonymous' });
  res.json({ ok: true, success: true });
});

// ═══════════════════════════════════════════════════════════════
// 👨‍👩‍👧 FAMILY TRACKER
// ═══════════════════════════════════════════════════════════════
app.post('/api/family/member', async (req, res) => {
  const { code, member } = req.body || {};
  if (!code || !member || !member.id) {
    return res.status(400).json({ ok: false, error: 'code + member required' });
  }
  try {
    if (!db) return res.json({ ok: true, demo: true });
    const famCode = clip(code, 20).toUpperCase();
    const ref = db.collection('families').doc(famCode);
    const doc = await ref.get();
    const family = doc.exists ? doc.data() : { code: famCode, createdAt: new Date().toISOString(), members: {} };
    family.members = family.members || {};
    const memberId = clip(member.id, 40);
    family.members[memberId] = {
      id: memberId,
      name: clip(member.name, 60),
      lat: Number.isFinite(parseFloat(member.lat)) ? parseFloat(member.lat) : null,
      lon: Number.isFinite(parseFloat(member.lon)) ? parseFloat(member.lon) : null,
      status: clip(member.status, 40),
      updatedAt: new Date().toISOString()
    };
    await ref.set(family);
    res.json({ ok: true, success: true });
  } catch (e) {
    console.warn('⚠️ family upsert failed:', e.message);
    res.json({ ok: true, demo: true });
  }
});

app.get('/api/family/:code', async (req, res) => {
  try {
    if (!db) return res.json({ ok: true, family: null, demo: true });
    const doc = await db.collection('families').doc(clip(req.params.code, 20).toUpperCase()).get();
    if (!doc.exists) return res.json({ ok: true, family: null });
    const f = doc.data();
    f.members = Object.values(f.members || {});
    res.json({ ok: true, family: f });
  } catch (e) {
    res.json({ ok: true, family: null, demo: true });
  }
});

// ═══════════════════════════════════════════════════════════════
// 🛰️ LIVE DATA APIs
// ═══════════════════════════════════════════════════════════════
const {
  getLiveZoneRisks,
  getLiveHighwayStatus,
  getIndiaEarthquakes
} = require('./services/liveData');

app.get('/api/zones/live-risk', async (req, res) => {
  try {
    const zones = await getLiveZoneRisks();
    res.json({
      ok: true,
      count: zones.length,
      updatedAt: new Date().toISOString(),
      zones,
      engine: 'open-meteo-live'
    });
  } catch (err) {
    console.error('❌ Live zone risk failed:', err.message);
    res.status(500).json({ ok: false, error: 'live-zone-risk-failed' });
  }
});

app.get('/api/highways/live', async (req, res) => {
  try {
    const zones = await getLiveZoneRisks();
    const highways = await getLiveHighwayStatus(zones);
    res.json({
      ok: true,
      count: highways.length,
      updatedAt: new Date().toISOString(),
      highways,
      engine: 'zone-risk-derived'
    });
  } catch (err) {
    console.error('❌ Live highway failed:', err.message);
    res.status(500).json({ ok: false, error: 'live-highway-failed' });
  }
});

app.get('/api/earthquakes/india', async (req, res) => {
  try {
    const quakes = await getIndiaEarthquakes();
    res.json({ ok: true, count: quakes.length, earthquakes: quakes });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'earthquake-fetch-failed' });
  }
});

app.get('/api/dashboard/live', async (req, res) => {
  try {
    const zones = await getLiveZoneRisks();
    const highways = await getLiveHighwayStatus(zones);

    let alerts = [];
    try {
      if (db) {
        const snap = await db.collection('alerts').orderBy('createdAt', 'desc').limit(20).get();
        alerts = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      }
    } catch (e) {
      console.log('⚠️ Alerts fetch best-effort failed:', e.message);
    }

    res.json({
      ok: true,
      updatedAt: new Date().toISOString(),
      zones,
      highways,
      alerts,
      meta: {
        zonesEngine: 'open-meteo-live',
        highwaysEngine: 'zone-risk-derived',
        alertsEngine: 'firestore'
      }
    });
  } catch (err) {
    console.error('❌ dashboard live failed:', err.message);
    res.status(500).json({ ok: false, error: 'dashboard-live-failed' });
  }
});

// ═══════════════════════════════════════════════════════════════
// 🌍 REALTIME DISASTERS (USGS + GDACS)
// ═══════════════════════════════════════════════════════════════
const { getAllRealtimeDisasters } = require('./services/realtimeDisasters');

app.get('/api/disasters/realtime', async (req, res) => {
  try {
    const disasters = await getAllRealtimeDisasters();
    res.json({
      ok: true,
      count: disasters.length,
      updatedAt: new Date().toISOString(),
      disasters
    });
  } catch (err) {
    console.error('❌ Realtime Disasters API Error:', err.message);
    res.status(500).json({ ok: false, error: 'realtime-disasters-failed' });
  }
});

// ═══════════════════════════════════════════════════════════════
// 🚫 API 404 HANDLER (MUST BE LAST)
// ═══════════════════════════════════════════════════════════════
app.use((req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ ok: false, error: `API endpoint not found: ${req.method} ${req.path}` });
  }
  res.status(404).sendFile(path.join(STATIC_ROOT, 'index.html'), (err) => {
    if (err) res.status(404).send('Not found');
  });
});

// Unhandled error guard (malformed JSON etc.)
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ ok: false, error: 'Invalid JSON' });
  }
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ ok: false, error: 'Payload too large' });
  }
  console.error('❌ Unhandled error:', err && err.message);
  res.status(500).json({ ok: false, error: 'Server error' });
});

// ═══════════════════════════════════════════════════════════════
// 🟢 START SERVER
// ═══════════════════════════════════════════════════════════════
app.listen(PORT, () => {
  console.log('\n══════════════════════════════════════════════');
  console.log('🚀 BhoomiSuraksha v5.2 SERVER RUNNING');
  console.log(`📍 Port: ${PORT}`);
  console.log(`🌐 Site: http://localhost:${PORT}`);
  console.log(`📁 Static root: ${HAS_PUBLIC ? 'public/' : 'project folder (legacy — public/ banao)'}`);
  console.log(`🔥 Firestore: ${db ? 'CONNECTED' : 'MOCK MODE'}`);
  console.log(`🚨 Autopilot responders: ${RESPONDER_NUMBERS.length ? RESPONDER_NUMBERS.length + ' configured' : 'NOT SET (ALERT_NUMBERS)'}`);
  console.log(`📡 Sensor API key: ${process.env.SENSOR_API_KEY ? 'set' : 'not set (admin JWT only)'}`);
  console.log(`📍 Alert radius: flood ${RADIUS_BY_HAZARD.flood}km • landslide ${RADIUS_BY_HAZARD.landslide}km • fire ${RADIUS_BY_HAZARD.forest_fire}km | cooldown ${COOLDOWN_MS / 1000}s/hazard | resident SMS cap ${MAX_RESIDENT_SMS}`);
  console.log('══════════════════════════════════════════════\n');
});


   app.use('/api/live', require('./liveData'));

   