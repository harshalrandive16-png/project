// ═══════════════════════════════════════════════════════════════
// 🏔️ BhoomiSuraksha — server.js v5.2 (security-hardened)
// Fixes: CORS for Github Pages + Preflight, Fast2SMS Demo Mode, /api/live
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
app.set('trust proxy', 1);

const PORT = process.env.PORT || 5000;

// ═══════════════════════════════════════════════════════════════
// 🌐 DYNAMIC CORS & PREFLIGHT OPTIONS HANDLER  (PROBLEM 4 FIX)
// Allows: Localhost, GitHub Pages, Render, Custom Domains
// Headers: Authorization, Content-Type, x-api-key, x-sensor-key
// ═══════════════════════════════════════════════════════════════
const ALLOWED_ORIGINS = [
  'http://localhost:5000',
  'http://127.0.0.1:5000',
  'http://localhost:3000',
  'http://127.0.0.1:5500',
  'https://harshalrandive16-png.github.io',
  'https://project-2-wszb.onrender.com',
  ...(process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim())
].filter(Boolean);

const corsOptions = {
  origin: function (origin, callback) {
    // Allow non-browser tools (curl / Postman / mobile native) — origin undefined
    if (!origin) return callback(null, true);

    const isAllowedExact = ALLOWED_ORIGINS.includes(origin);
    const isAllowedDomain =
      origin.endsWith('.github.io') ||
      origin.endsWith('.onrender.com') ||
      origin.includes('localhost') ||
      origin.includes('127.0.0.1');

    if (isAllowedExact || isAllowedDomain) {
      return callback(null, true);
    }

    console.warn(`🛡️ CORS Blocked for Origin: ${origin}`);
    return callback(new Error(`CORS policy violation for origin: ${origin}`));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'x-api-key',
    'x-sensor-key',
    'X-Requested-With',
    'Accept'
  ],
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // Explicit preflight for ALL routes

app.use(express.json({ limit: '1mb' }));

console.log('🚀 BhoomiSuraksha server v5.2 booting...');
console.log('🌐 CORS origins armed:', ALLOWED_ORIGINS.join(' | '));

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
// ═══════════════════════════════════════════════════════════════
const admin = require('firebase-admin');
let db = null;

function readJsonFile(filePath) {
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(__dirname, filePath);
  if (!fs.existsSync(absolutePath)) throw new Error(`File not found: ${absolutePath}`);
  return JSON.parse(fs.readFileSync(absolutePath, 'utf8').trim());
}

function loadFirebaseCreds() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    return process.env.FIREBASE_SERVICE_ACCOUNT.startsWith('{')
      ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
      : readJsonFile(process.env.FIREBASE_SERVICE_ACCOUNT);
  }
  const defaultKeyPath = path.join(__dirname, 'serviceAccountKey.json');
  if (fs.existsSync(defaultKeyPath)) return readJsonFile(defaultKeyPath);
  return null;
}

try {
  const creds = loadFirebaseCreds();
  if (creds) {
    if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(creds) });
    db = admin.firestore();
    console.log('🔥 Firebase connected ✅');
  } else {
    console.warn('⚠️ Firebase credentials nahi mili — MOCK mode enabled');
  }
} catch (err) {
  console.warn(`⚠️ Firebase error: ${err.message} — MOCK mode enabled`);
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
    return ref.id;
  } catch (err) {
    console.warn(`⚠️ Firestore save failed (${collection}):`, err.message);
    return null;
  }
}

// 🧰 HELPERS
const clip = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) && s.length <= 254;

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

// 🛡️ STATIC FILES
const PUBLIC_DIR = path.join(__dirname, 'public');
const HAS_PUBLIC = fs.existsSync(PUBLIC_DIR);
const STATIC_ROOT = HAS_PUBLIC ? PUBLIC_DIR : __dirname;

const BLOCKED_SEGMENTS = new Set(['node_modules', 'services', 'uploads', 'logs', 'public-backup']);
const BLOCKED_FILES = new Set(['server.js', 'package.json', 'package-lock.json', 'serviceaccountkey.json', 'iot-simulator.js']);
const BLOCKED_EXT = /\.(log|py|c|md|toml|listen|json|zip|map|yml|yaml|lock|sh|bat|ps1)$/i;

if (!HAS_PUBLIC) {
  app.use((req, res, next) => {
    let p;
    try { p = decodeURIComponent(req.path).toLowerCase(); }
    catch { return res.status(400).json({ ok: false, error: 'Bad request' }); }
    const segs = p.split('/').filter(Boolean);
    const last = segs[segs.length - 1] || '';
    const blocked = (BLOCKED_EXT.test(last) && last !== 'manifest.json') ||
      segs.some(s => s.startsWith('.') || BLOCKED_SEGMENTS.has(s) || BLOCKED_FILES.has(s));
    if (blocked) return res.status(403).json({ ok: false, error: 'Forbidden' });
    next();
  });
}
app.use(express.static(STATIC_ROOT, { dotfiles: 'ignore' }));

// 🔐 AUTH HELPERS
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

function sensorAuth(req, res, next) {
  const key = req.headers['x-api-key'] || req.headers['x-sensor-key'];
  const expected = process.env.SENSOR_API_KEY;
  if (expected && key && safeEqual(key, expected)) return next();
  return authMiddleware(req, res, () => requireAdmin(req, res, next));
}

const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', 10);

// 🔊 SSE MOBILE SIREN ENGINE
let sirenClients = [];
let sirenState = { alertActive: false, message: '', triggeredAt: null };
let sirenResetTimer = null;
const MAX_SIREN_CLIENTS = 2000;

app.get('/api/siren/stream', (req, res) => {
  if (sirenClients.length >= MAX_SIREN_CLIENTS) {
    return res.status(503).json({ ok: false, error: 'Too many connected devices' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const clientId = Date.now() + Math.random();
  sirenClients.push({ id: clientId, res });

  res.write(`data: ${JSON.stringify({ alertActive: sirenState.alertActive, connected: true, time: Date.now() })}\n\n`);

  req.on('close', () => {
    sirenClients = sirenClients.filter(c => c.id !== clientId);
  });
});

setInterval(() => {
  sirenClients.forEach(client => {
    try { client.res.write(': ping\n\n'); } catch (e) {}
  });
}, 25000);

function broadcastSirenToMobiles(message, opts = {}) {
  const base = {
    alertActive: true,
    message: clip(message, 200) || '🚨 EMERGENCY ALERT — BhoomiSuraksha',
    time: Date.now()
  };
  sirenState = { alertActive: true, message: base.message, triggeredAt: base.time };

  sirenClients.forEach(client => {
    try { client.res.write(`data: ${JSON.stringify(base)}\n\n`); } catch (e) {}
  });

  if (sirenResetTimer) clearTimeout(sirenResetTimer);
  sirenResetTimer = setTimeout(() => {
    sirenState = { alertActive: false, message: '', triggeredAt: null };
  }, 90000);

  return { sent: sirenClients.length };
}

// 📡 IOT SENSOR ROUTES
app.post('/api/sensors/ingest', sensorAuth, (req, res) => {
  try {
    const parsed = iotService.normalizeIngest(req.body);
    if (!parsed.ok) return res.status(400).json({ ok: false, error: parsed.error });
    const state = iotService.processSensorData(parsed.nodeId, parsed.data, {
      location: parsed.location,
      deviceId: parsed.deviceId
    });
    res.json({ ok: true, success: true, state });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Sensor ingest failed' });
  }
});

app.get('/api/sensors/live', (req, res) => {
  try {
    res.json({ ok: true, success: true, data: iotService.getLiveSensors() });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Sensor data unavailable' });
  }
});

// 📱 DEMO SMS + SIREN DISPATCH (ADMIN ONLY) - SIMULATION FALLBACK
app.post('/api/sms/send-test', ...adminOnly, async (req, res) => {
  const { phone, phones, numbers, message, hazard, location, radius } = req.body || {};

  const inputNumbers = numbers || phones || phone || '';
  const cleanNums = cleanPhones(Array.isArray(inputNumbers) ? inputNumbers.join(',') : inputNumbers);

  if (!cleanNums.length) {
    return res.status(400).json({
      success: false,
      message: 'At least one valid 10-digit phone number required'
    });
  }

  const text = clip(message, 300) ||
    `BhoomiSuraksha ALERT: ${hazard || 'Severe disaster'} risk near ${location || 'your area'}. Move to safety NOW. Helpline 112`;

  console.log(`📢 DISPATCH REQUEST → ${cleanNums.length} numbers`);

  // Trigger Live Siren immediately
  broadcastSirenToMobiles(text.slice(0, 140));

  const apiKey = process.env.FAST2SMS_API_KEY;
  if (apiKey && apiKey !== 'YOUR_FAST2SMS_KEY_HERE') {
    const smsResult = await sendGeofencedSMS(cleanNums.join(','), text);
    safeSave('sms_logs', {
      target: cleanNums.join(','),
      message: text,
      result: smsResult,
      sentBy: req.user.email
    });

    if (smsResult.success) {
      return res.json({
        success: true,
        mode: 'LIVE_GATEWAY',
        message: 'SMS sent + Siren broadcasted!',
        smsResult
      });
    }
    return res.status(500).json({
      success: false,
      message: 'Siren played but SMS failed: ' + (smsResult.error || 'Gateway Error')
    });
  }

  // DEMO SIMULATION MODE
  console.log(`[SIMULATION MODE] SMS alert to: ${cleanNums.join(', ')}`);
  safeSave('sms_logs', {
    target: cleanNums.join(','),
    message: text,
    simulated: true,
    sentBy: req.user.email
  });

  return res.json({
    success: true,
    mode: 'SIMULATION_MODE',
    message: '[DEMO MODE] Siren played! Add FAST2SMS_API_KEY in .env for real SMS delivery.',
    recipients: cleanNums
  });
});

// 🛰️ LIVE DATA APIs
try {
  app.use('/api/live', require('./services/liveData'));
} catch (err) {
  console.warn('⚠️ Warning: Could not load /api/live router. Check ./services/liveData.js');
}

const { getLiveZoneRisks, getLiveHighwayStatus, getIndiaEarthquakes } = require('./services/liveData');

app.get('/api/dashboard/live', async (req, res) => {
  try {
    const zones = await getLiveZoneRisks();
    const highways = await getLiveHighwayStatus(zones);
    res.json({ ok: true, updatedAt: new Date().toISOString(), zones, highways });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'dashboard-live-failed' });
  }
});

// 🌍 REALTIME DISASTERS (USGS)
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
    res.status(500).json({ ok: false, error: 'realtime-disasters-failed' });
  }
});

// 🚫 API 404 HANDLER (MUST BE LAST)
app.use((req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({
      ok: false,
      error: `API endpoint not found: ${req.method} ${req.path}`
    });
  }
  res.status(404).sendFile(path.join(STATIC_ROOT, 'index.html'), (err) => {
    if (err) res.status(404).send('Not found');
  });
});

app.use((err, req, res, next) => {
  console.error('❌ Unhandled error:', err && err.message);
  res.status(500).json({ ok: false, error: 'Server error' });
});

// 🟢 START SERVER
app.listen(PORT, () => {
  console.log('\n══════════════════════════════════════════════');
  console.log('🚀 BhoomiSuraksha v5.2 SERVER RUNNING');
  console.log(`📍 Port: ${PORT}`);
  console.log(`🔥 Firestore: ${db ? 'CONNECTED' : 'MOCK MODE'}`);
  console.log('🌐 CORS: GitHub Pages + Localhost + Render ARMED');
  console.log('══════════════════════════════════════════════\n');
});
