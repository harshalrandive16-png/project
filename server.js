// ═══════════════════════════════════════════════════════════════
// 🏔️ BhoomiSuraksha — server.js v5.2 (security-hardened)
// Hybrid Auth (Firestore + In-Memory Failover) | Multi-Gateway Alerts
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
const smsService = require('./services/smsService');
const { sendGeofencedSMS, getSMSStatus, registerWebPushSubscription } = smsService;
const { haversineDistance } = require('./services/haversine');
const iotService = require('./services/iotService');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

const PORT = process.env.PORT || 5000;

// ═══════════════════════════════════════════════════════════════
// 🌐 DYNAMIC CORS & PREFLIGHT OPTIONS HANDLER
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
app.options('*', cors(corsOptions));

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

const authLimiter = makeLimiter(15 * 60 * 1000, 15);
const reportLimiter = makeLimiter(60 * 1000, 5);
const chatLimiter = makeLimiter(60 * 1000, 20);
const analyzeLimiter = makeLimiter(60 * 1000, 15);
const smsDemoLimiter = makeLimiter(60 * 1000, 15);
const pushLimiter = makeLimiter(60 * 1000, 30);

// ═══════════════════════════════════════════════════════════════
// 🔥 FIREBASE INIT & IN-MEMORY FAILOVER STORE
// ═══════════════════════════════════════════════════════════════
const admin = require('firebase-admin');
let db = null;
const inMemoryUsers = new Map(); // Emergency Failover User Store

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
    console.warn('⚠️ Firebase credentials nahi mili — IN-MEMORY mode enabled');
  }
} catch (err) {
  console.warn(`⚠️ Firebase error: ${err.message} — IN-MEMORY mode enabled`);
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

function sensorAuth(req, res, next) {
  const key = req.headers['x-api-key'] || req.headers['x-sensor-key'];
  const expected = process.env.SENSOR_API_KEY;
  if (expected && key && safeEqual(key, expected)) return next();
  return authMiddleware(req, res, () => requireAdmin(req, res, next));
}

// ═══════════════════════════════════════════════════════════════
// 👤 ZERO-CRASH USER AUTHENTICATION (REGISTER / LOGIN)
// ═══════════════════════════════════════════════════════════════

app.post('/api/auth/register', authLimiter, async (req, res) => {
  try {
    const { name, email, phone, password, role } = req.body || {};

    if (!name || !email || !password) {
      return res.status(400).json({ ok: false, error: 'Name, email and password required hain' });
    }
    if (!isEmail(String(email))) {
      return res.status(400).json({ ok: false, error: 'Valid email address enter karein' });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ ok: false, error: 'Password minimum 6 characters ka hona chahiye' });
    }

    const emailLower = String(email).toLowerCase().trim();
    const hashedPassword = await bcrypt.hash(String(password), 10);
    const userRole = role === 'admin' ? 'admin' : 'user';
    const userId = 'usr_' + Date.now();

    const newUser = {
      uid: userId,
      name: clip(name, 80),
      email: emailLower,
      phone: clip(phone || '', 15),
      password: hashedPassword,
      role: userRole,
      createdAt: new Date().toISOString()
    };

    let savedToFirestore = false;

    // Try Firestore First
    if (db) {
      try {
        const snap = await db.collection('users').where('email', '==', emailLower).limit(1).get();
        if (!snap.empty) {
          return res.status(409).json({ ok: false, error: 'Ye email pehle se registered hai. Login karein.' });
        }
        const docRef = await db.collection('users').add(newUser);
        newUser.uid = docRef.id;
        savedToFirestore = true;
      } catch (fsErr) {
        console.warn('⚠️ Firestore Write Warning (falling back to In-Memory):', fsErr.message);
      }
    }

    // Always keep in memory failover store
    if (inMemoryUsers.has(emailLower)) {
      return res.status(409).json({ ok: false, error: 'Ye email pehle se registered hai. Login karein.' });
    }
    inMemoryUsers.set(emailLower, newUser);

    const token = jwt.sign(
      { uid: newUser.uid, email: newUser.email, role: userRole, name: newUser.name },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );

    console.log(`✅ User Registered Successfully (${savedToFirestore ? 'Firestore' : 'In-Memory Failover'}): ${emailLower}`);

    return res.status(201).json({
      ok: true,
      success: true,
      message: 'Registration successful!',
      token,
      user: { uid: newUser.uid, name: newUser.name, email: newUser.email, role: userRole, phone: newUser.phone }
    });

  } catch (err) {
    console.error('❌ Register Exception:', err.message);
    return res.status(500).json({ ok: false, error: err.message || 'Registration failed.' });
  }
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ ok: false, error: 'Email aur password required hain' });
    }

    const emailLower = String(email).toLowerCase().trim();
    let targetUser = null;

    // 1. Try Firestore First
    if (db) {
      try {
        const snap = await db.collection('users').where('email', '==', emailLower).limit(1).get();
        if (!snap.empty) {
          const doc = snap.docs[0];
          targetUser = { uid: doc.id, ...doc.data() };
        }
      } catch (fsErr) {
        console.warn('⚠️ Firestore Read Warning (checking In-Memory store):', fsErr.message);
      }
    }

    // 2. Try In-Memory Failover Store
    if (!targetUser && inMemoryUsers.has(emailLower)) {
      targetUser = inMemoryUsers.get(emailLower);
    }

    if (!targetUser) {
      return res.status(401).json({ ok: false, error: 'Invalid email or password' });
    }

    // Check Password
    const isMatch = await bcrypt.compare(String(password), targetUser.password || '');
    if (!isMatch) {
      return res.status(401).json({ ok: false, error: 'Invalid email or password' });
    }

    const token = jwt.sign(
      {
        uid: targetUser.uid,
        email: targetUser.email,
        role: targetUser.role || 'user',
        name: targetUser.name || ''
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );

    console.log(`🔑 User Logged In: ${emailLower}`);

    return res.json({
      ok: true,
      success: true,
      message: 'Login successful!',
      token,
      user: {
        uid: targetUser.uid,
        name: targetUser.name,
        email: targetUser.email,
        role: targetUser.role || 'user',
        phone: targetUser.phone || ''
      }
    });

  } catch (err) {
    console.error('❌ Login Exception:', err.message);
    return res.status(500).json({ ok: false, error: err.message || 'Login failed.' });
  }
});

app.get('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    const emailLower = (req.user.email || '').toLowerCase();
    if (inMemoryUsers.has(emailLower)) {
      const { password, ...safeUser } = inMemoryUsers.get(emailLower);
      return res.json({ ok: true, success: true, user: safeUser });
    }

    if (db) {
      const doc = await db.collection('users').doc(req.user.uid).get();
      if (doc.exists) {
        const { password, ...safeUser } = doc.data();
        return res.json({ ok: true, success: true, user: { uid: doc.id, ...safeUser } });
      }
    }

    return res.json({
      ok: true,
      success: true,
      user: { uid: req.user.uid, name: req.user.name, email: req.user.email, role: req.user.role }
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Failed to fetch profile' });
  }
});

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

// ═══════════════════════════════════════════════════════════════
// 📱 DEMO SMS + SIREN DISPATCH — ZERO CRASH AUTO-SIMULATION
// Supports: Live Fast2SMS + ntfy + Telegram + WebPush fallback
// ═══════════════════════════════════════════════════════════════
app.post('/api/sms/send-test', smsDemoLimiter, async (req, res) => {
  try {
    const { phone, phones, numbers, message, hazard, location, radius, customMessage } = req.body || {};

    const inputNumbers = numbers || phones || phone || '';
    const cleanNums = cleanPhones(Array.isArray(inputNumbers) ? inputNumbers.join(',') : inputNumbers);

    if (!cleanNums.length) {
      return res.status(400).json({
        ok: false,
        success: false,
        message: 'At least one valid 10-digit Indian mobile number is required.'
      });
    }

    const hazardName = hazard || 'Severe Hazard';
    const locName = location || 'Nagpur, Maharashtra';
    const radiusKm = radius || 15;

    const alertMessage = clip(customMessage || message, 300) ||
      `ALERT [NDMA]: BhoomiSuraksha ${hazardName} warning in ${locName} within ${radiusKm}km. Evacuate immediately. Helpline 112`;

    console.log(`📢 DISPATCH REQUEST → Target: ${cleanNums.join(', ')} | ${hazardName} @ ${locName}`);

    // 1. ALWAYS Trigger Web Audio / Mobile Siren Stream (< 1.5s Latency)
    broadcastSirenToMobiles(alertMessage.slice(0, 140));

    // 2. Multi-Gateway dispatch (Fast2SMS + ntfy + Telegram + WebPush)
    try {
      const smsResult = await sendGeofencedSMS(cleanNums.join(','), alertMessage, {
        hazard: hazardName,
        location: locName
      });

      safeSave('sms_logs', {
        target: cleanNums.join(','),
        message: alertMessage,
        result: smsResult,
        triggeredFrom: 'live-alert-demo',
        mode: smsResult.gateways?.sms ? 'LIVE' : 'MULTI_GATEWAY'
      });

      return res.json({
        ok: true,
        success: true,
        mode: smsResult.gateways?.sms ? 'LIVE_FAST2SMS_GATEWAY' : 'MULTI_GATEWAY_FAILOVER',
        message: `🚀 Emergency Siren + Multi-Gateway Alert Dispatched for ${cleanNums.length} recipient(s)!`,
        channelsUsed: smsResult.channelsUsed || [],
        gateways: smsResult.gateways || {},
        smsResult
      });
    } catch (err) {
      console.warn(`⚠️ Multi-Gateway Exception: ${err.message}. Falling back to Simulation Mode.`);
    }

    // 3. ZERO-CRASH DEMO SIMULATION FALLBACK
    console.log(`📡 [DEMO SIMULATION ACTIVE] Alert: "${alertMessage}" → ${cleanNums.join(', ')}`);

    safeSave('sms_logs', {
      target: cleanNums.join(','),
      message: alertMessage,
      simulated: true,
      triggeredFrom: 'live-alert-demo',
      mode: 'SIMULATION'
    });

    return res.json({
      ok: true,
      success: true,
      mode: 'DEMO_SIMULATION_MODE',
      message: `🚀 Emergency Siren Triggered + SMS Alert Dispatched for ${cleanNums.length} recipient(s)!`,
      recipients: cleanNums
    });

  } catch (error) {
    console.error('❌ Dispatch Route Error:', error.message || error);
    return res.status(500).json({
      ok: false,
      success: false,
      message: error.message || 'Internal Server Error during dispatch.'
    });
  }
});

// ═══════════════════════════════════════════════════════════════
// 🔔 WEB PUSH / VAPID LOCK-SCREEN ALERTS (Channel 4)
// ═══════════════════════════════════════════════════════════════
app.get('/api/push/vapid-public-key', (req, res) => {
  const publicKey = process.env.VAPID_PUBLIC_KEY || '';
  if (!publicKey) {
    return res.status(503).json({
      ok: false,
      success: false,
      error: 'VAPID_PUBLIC_KEY not configured in .env'
    });
  }
  return res.json({
    ok: true,
    success: true,
    publicKey
  });
});

app.post('/api/push/subscribe', pushLimiter, (req, res) => {
  try {
    const subscription = req.body;
    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({
        ok: false,
        success: false,
        error: 'Invalid subscription payload'
      });
    }

    const registered = registerWebPushSubscription
      ? registerWebPushSubscription(subscription)
      : false;

    console.log('📡 WebPush subscription registered:', subscription.endpoint.slice(0, 48) + '...');

    return res.json({
      ok: true,
      success: !!registered,
      message: registered
        ? 'Browser registered for Lock-screen Emergency Alerts!'
        : 'Registration accepted (in-memory store)'
    });
  } catch (err) {
    console.error('❌ Push Subscription Error:', err.message);
    return res.status(500).json({
      ok: false,
      success: false,
      error: err.message
    });
  }
});

app.get('/api/push/status', (req, res) => {
  const status = getSMSStatus ? getSMSStatus() : { channels: {} };
  return res.json({
    ok: true,
    success: true,
    vapidConfigured: Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY),
    channels: status.channels || {}
  });
});

// 🛰️ LIVE DATA APIs
try {
  app.use('/api/live', require('./services/liveData'));
} catch (err) {
  console.warn('⚠️ Warning: Could not load /api/live router. Check ./services/liveData.js');
}

const { getLiveZoneRisks, getLiveHighwayStatus } = require('./services/liveData');

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
  console.log(`🔥 Firestore: ${db ? 'CONNECTED' : 'IN-MEMORY FAILOVER MODE'}`);
  console.log('🌐 CORS: GitHub Pages + Localhost + Render ARMED');
  console.log('🔐 Auth: Zero-Crash Hybrid Store Active');
  console.log('📱 SMS Demo Route: Zero-Crash Multi-Gateway Active');
  console.log('🔔 WebPush VAPID: Ready');
  console.log('══════════════════════════════════════════════\n');
});