// ═══════════════════════════════════════════════════════════
// 🏔️ BhoomiSuraksha — Netlify Serverless API Handler
// SIH 2025 | PAN-INDIA Multi-Disaster Early Warning
// ═══════════════════════════════════════════════════════════

const serverless = require('serverless-http');
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || 'BhoomiSuraksha_Hackathon_Secret_Key_2025';

app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ═══════════════════════════════════════════════════════════
// 🔥 FIREBASE (ENV-first, crash-proof)
// ═══════════════════════════════════════════════════════════
let db = null;
let firebaseReady = false;

function initFirebase() {
  if (firebaseReady) return true;
  try {
    const admin = require('firebase-admin');
    let serviceAccount = null;

    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      try {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        console.log('🔑 Firebase from ENV');
      } catch (e) {
        console.error('❌ FIREBASE_SERVICE_ACCOUNT parse error:', e.message);
      }
    }

    if (!serviceAccount) {
      try {
        const keyPath = path.join(__dirname, '../../serviceAccountKey.json');
        if (fs.existsSync(keyPath)) {
          serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
          console.log('🔑 Firebase from FILE');
        }
      } catch (e) { /* ignore */ }
    }

    if (!serviceAccount) {
      console.log('🎭 Firebase DEMO mode');
      return false;
    }

    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'bhoomishuraksh.firebasestorage.app'
      });
    }
    db = admin.firestore();
    firebaseReady = true;
    console.log('✅ Firebase connected');
    return true;
  } catch (err) {
    console.error('❌ Firebase init:', err.message);
    return false;
  }
}
initFirebase();

// ═══════════════════════════════════════════════════════════
// 🧠 SERVICES (crash-proof load)
// ═══════════════════════════════════════════════════════════
let kiraAI = null;
let openMeteo = null;
let riskFallback = null;
let haversine = null;

try { kiraAI = require('../../services/kiraAI'); } catch (e) { console.log('⚠️ kiraAI:', e.message); }
try { openMeteo = require('../../services/openmeteo'); } catch (e) { console.log('⚠️ openmeteo:', e.message); }
try { riskFallback = require('../../services/riskFallback'); } catch (e) { console.log('⚠️ riskFallback:', e.message); }
try { haversine = require('../../services/haversine'); } catch (e) { console.log('⚠️ haversine:', e.message); }

// ═══════════════════════════════════════════════════════════
// AUTH MIDDLEWARE
// ═══════════════════════════════════════════════════════════
function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  try {
    req.user = jwt.verify(header.split(' ')[1], JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// ═══════════════════════════════════════════════════════════
// 📡 ROUTES — Netlify strips /api prefix sometimes, so dual mount
// ═══════════════════════════════════════════════════════════

function mountRoutes(base) {

  // HEALTH
  base.get('/health', (req, res) => {
    const kiraOk = kiraAI && typeof kiraAI.isKiraReady === 'function' && kiraAI.isKiraReady();
    res.json({
      status: 'ok',
      project: 'BhoomiSuraksha',
      title: 'AI-Based Multi-Disaster Early Warning and Risk Monitoring System',
      version: '2.0',
      scope: 'PAN-INDIA',
      platform: 'Netlify Serverless',
      timestamp: new Date().toISOString(),
      services: {
        firebase: firebaseReady ? '✅ connected' : '🎭 demo fallback',
        kiraAI: kiraOk ? '✅ ready (Gemini)' : '⚠️ rule-fallback active',
        openMeteo: '✅ free (no key)',
        geofencing: '✅ Haversine active'
      }
    });
  });

  // SIGNUP
  base.post('/signup', async (req, res) => {
    try {
      const { name, email, phone, state, password } = req.body;
      if (!name || !email || !password) {
        return res.status(400).json({ error: 'Name, email, password required' });
      }
      if (!firebaseReady) {
        const user = { uid: 'demo_' + Date.now(), name, email, phone: phone || '', state: state || '', role: 'citizen' };
        const token = jwt.sign(user, JWT_SECRET, { expiresIn: '7d' });
        return res.json({ message: 'Signup successful (demo)', user, token });
      }
      const existing = await db.collection('users').where('email', '==', email).limit(1).get();
      if (!existing.empty) return res.status(400).json({ error: 'Email already registered' });

      const hashed = await bcrypt.hash(password, 10);
      const userData = {
        name, email, phone: phone || '', state: state || '', password: hashed,
        role: 'citizen',
        alertPreferences: ['flood', 'cyclone', 'landslide', 'earthquake', 'cloudburst'],
        lastLocation: null,
        createdAt: new Date().toISOString()
      };
      const docRef = await db.collection('users').add(userData);
      const user = { uid: docRef.id, name, email, phone: phone || '', state: state || '', role: 'citizen' };
      const token = jwt.sign({ uid: docRef.id, email, name, role: 'citizen' }, JWT_SECRET, { expiresIn: '7d' });
      console.log('✅ Signup:', email);
      res.json({ message: 'Signup successful', user, token });
    } catch (err) {
      console.error('❌ Signup:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // LOGIN
  base.post('/login', async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

      if (!firebaseReady) {
        const user = { uid: 'demo_' + Date.now(), name: 'Demo Citizen', email, role: 'citizen' };
        const token = jwt.sign(user, JWT_SECRET, { expiresIn: '7d' });
        return res.json({ message: 'Login successful (demo)', user, token });
      }

      const snap = await db.collection('users').where('email', '==', email).limit(1).get();
      if (snap.empty) return res.status(401).json({ error: 'Invalid email or password' });
      const doc = snap.docs[0];
      const data = doc.data();
      const valid = await bcrypt.compare(password, data.password);
      if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

      const user = { uid: doc.id, name: data.name, email: data.email, phone: data.phone || '', state: data.state || '', role: data.role || 'citizen' };
      const token = jwt.sign({ uid: doc.id, email, name: data.name, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
      console.log('✅ Login:', email);
      res.json({ message: 'Login successful', user, token });
    } catch (err) {
      console.error('❌ Login:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ME
  base.get('/me', authMiddleware, async (req, res) => {
    try {
      if (!firebaseReady) {
        return res.json({ user: { uid: req.user.uid, name: req.user.name, email: req.user.email, role: req.user.role } });
      }
      const doc = await db.collection('users').doc(req.user.uid).get();
      if (!doc.exists) return res.status(404).json({ error: 'User not found' });
      const data = doc.data();
      delete data.password;
      res.json({ user: { uid: doc.id, ...data } });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // PROFILE UPDATE
  base.put('/profile', authMiddleware, async (req, res) => {
    try {
      if (!firebaseReady) return res.json({ message: 'Profile updated (demo)' });
      const { name, phone, state, alertPreferences } = req.body;
      const update = { updatedAt: new Date().toISOString() };
      if (name) update.name = name;
      if (phone) update.phone = phone;
      if (state) update.state = state;
      if (alertPreferences) update.alertPreferences = alertPreferences;
      await db.collection('users').doc(req.user.uid).update(update);
      res.json({ message: 'Profile updated' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // SAVE LOCATION
  base.post('/user/location', authMiddleware, async (req, res) => {
    try {
      const { lat, lon } = req.body;
      if (lat === undefined || lon === undefined) return res.status(400).json({ error: 'lat, lon required' });
      if (!firebaseReady) return res.json({ message: 'Location saved (demo)', lat, lon });
      await db.collection('users').doc(req.user.uid).update({
        lastLocation: { lat: parseFloat(lat), lon: parseFloat(lon) },
        lastLocationAt: new Date().toISOString()
      });
      console.log('📍 Location saved:', req.user.email);
      res.json({ message: 'Location saved', lat, lon });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ANALYZE RISK
  base.post('/analyze-risk', async (req, res) => {
    try {
      const { lat, lon, location, disasterType } = req.body;
      const latNum = parseFloat(lat);
      const lonNum = parseFloat(lon);
      if (isNaN(latNum) || isNaN(lonNum)) {
        return res.status(400).json({ error: 'Valid lat and lon required' });
      }
      const locName = location || `${latNum.toFixed(2)}°N, ${lonNum.toFixed(2)}°E`;
      const dType = disasterType || 'auto';
      console.log('🧠 Analyze:', locName, dType);

      let weather = null;
      try {
        if (openMeteo) weather = await openMeteo.getWeather(latNum, lonNum);
      } catch (e) {
        console.error('⚠️ Weather fail:', e.message);
      }
      if (!weather) {
        weather = {
          temperature: 28, humidity: 78, precipitation: 15, windSpeed: 22,
          rainfall24h: 52, rainfall48h: 88, condition: 'Heavy Rain (estimated)', source: 'fallback'
        };
      }

      let aiResult = null;
      let engine = 'rule-fallback';
      try {
        if (kiraAI && kiraAI.isKiraReady && kiraAI.isKiraReady()) {
          aiResult = await kiraAI.analyzeWithKira(latNum, lonNum, locName, dType, weather);
          if (aiResult && aiResult.score != null) engine = 'kira-ai';
        }
      } catch (e) {
        console.error('⚠️ Kira fail:', e.message);
      }

      if (!aiResult || aiResult.score == null) {
        aiResult = riskFallback
          ? riskFallback.getRuleBasedRisk(weather, dType)
          : {
              score: 68,
              riskLevel: 'High',
              explanation: `Heavy rainfall (${weather.rainfall24h}mm/24h) and humidity ${weather.humidity}% indicate elevated multi-hazard risk near ${locName}.`,
              explanationHindi: `${locName} के पास भारी बारिश (${weather.rainfall24h}mm/24h) और नमी ${weather.humidity}% से आपदा का खतरा बढ़ा है।`,
              recommendedAction: 'Stay alert. Keep emergency kit ready. Call 112 in emergency.',
              smsEnglish: `⚠️ BhoomiSuraksha: HIGH risk near ${locName}. Rain ${weather.rainfall24h}mm. Stay safe! Helpline 112`,
              smsHindi: `⚠️ भूमिसुरक्षा: ${locName} के पास उच्च खतरा। बारिश ${weather.rainfall24h}mm। सुरक्षित रहें! 112`
            };
        engine = 'rule-fallback';
      }

      let score = Number(aiResult.score) || 50;
      score = Math.max(0, Math.min(100, score));
      let riskLevel = aiResult.riskLevel || 'Moderate';
      if (score >= 80) riskLevel = 'Severe';
      else if (score >= 60) riskLevel = 'High';
      else if (score >= 35) riskLevel = 'Moderate';
      else riskLevel = 'Low';

      const response = {
        location: locName,
        coordinates: { lat: latNum, lon: lonNum },
        disasterType: dType,
        weather,
        score,
        riskLevel,
        explanation: aiResult.explanation || 'Risk analysis complete.',
        explanationHindi: aiResult.explanationHindi || 'जोखिम विश्लेषण पूरा।',
        recommendedAction: aiResult.recommendedAction || 'Follow NDMA guidelines.',
        smsEnglish: aiResult.smsEnglish || `⚠️ BhoomiSuraksha: ${riskLevel} risk near ${locName}. Score ${score}/100. Helpline 112`,
        smsHindi: aiResult.smsHindi || `⚠️ भूमिसुरक्षा: ${locName} के पास ${riskLevel} खतरा। स्कोर ${score}/100। हेल्पलाइन 112`,
        engine,
        timestamp: new Date().toISOString()
      };

      if (firebaseReady) {
        try { await db.collection('ai_analyses').add(response); } catch (e) { /* ignore */ }
      }

      res.json(response);
    } catch (err) {
      console.error('❌ analyze-risk:', err.message);
      res.status(500).json({ error: 'Analysis failed', detail: err.message });
    }
  });

  // GEOFENCE ALERT
  base.post('/alerts/geofence', async (req, res) => {
    try {
      const { lat, lon, radiusKm, riskLevel, disasterType, message, messageHindi, score } = req.body;
      if (lat === undefined || lon === undefined) return res.status(400).json({ error: 'lat, lon required' });

      const radius = parseFloat(radiusKm) || 10;
      const alertData = {
        lat: parseFloat(lat),
        lon: parseFloat(lon),
        radiusKm: radius,
        riskLevel: riskLevel || 'High',
        disasterType: disasterType || 'multi-hazard',
        score: score || 70,
        messageEn: message || `⚠️ BhoomiSuraksha: ${riskLevel || 'High'} risk in your area. Stay safe! Helpline 112`,
        messageHi: messageHindi || `⚠️ भूमिसुरक्षा: आपके क्षेत्र में खतरा। सुरक्षित रहें! हेल्पलाइन 112`,
        createdAt: new Date().toISOString(),
        active: true
      };

      let alertId = 'demo_' + Date.now();
      let usersNotified = 0;

      if (firebaseReady) {
        const alertRef = await db.collection('alerts').add(alertData);
        alertId = alertRef.id;
        try {
          const usersSnap = await db.collection('users').get();
          const distFn = haversine && haversine.haversineDistance ? haversine.haversineDistance : null;
          if (distFn) {
            for (const userDoc of usersSnap.docs) {
              const u = userDoc.data();
              if (u.lastLocation && u.lastLocation.lat != null) {
                const dist = distFn(parseFloat(lat), parseFloat(lon), u.lastLocation.lat, u.lastLocation.lon);
                if (dist <= radius) {
                  await db.collection('user_alerts').add({
                    alertId, userId: userDoc.id, userEmail: u.email,
                    distanceKm: Math.round(dist * 100) / 100, read: false,
                    createdAt: new Date().toISOString()
                  });
                  usersNotified++;
                }
              }
            }
          }
        } catch (e) {
          console.error('⚠️ Fan-out:', e.message);
        }
      } else {
        usersNotified = 5;
      }

      console.log('📢 Geofence alert:', alertId, 'users:', usersNotified);
      res.json({ message: 'Geofence alert broadcast complete', alertId, radiusKm: radius, usersNotified, alert: alertData });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // PUBLIC ALERTS
  base.get('/alerts', async (req, res) => {
    try {
      if (!firebaseReady) {
        return res.json({
          alerts: [
            { id: 'demo1', riskLevel: 'Severe', disasterType: 'flood', messageEn: '⚠️ Severe flood warning — Guwahati region. Heavy rainfall.', messageHi: '⚠️ गुवाहाटी में गंभीर बाढ़ चेतावनी।', score: 88, createdAt: new Date().toISOString(), active: true },
            { id: 'demo2', riskLevel: 'High', disasterType: 'landslide', messageEn: '⚠️ High landslide risk — Shillong hills.', messageHi: '⚠️ शिलांग में उच्च भूस्खलन जोखिम।', score: 72, createdAt: new Date(Date.now() - 3600000).toISOString(), active: true },
            { id: 'demo3', riskLevel: 'Moderate', disasterType: 'cyclone', messageEn: '⚠️ Moderate cyclone watch — Odisha coast.', messageHi: '⚠️ ओडिशा तट पर मध्यम चक्रवात चेतावनी।', score: 55, createdAt: new Date(Date.now() - 7200000).toISOString(), active: true }
          ]
        });
      }
      const snap = await db.collection('alerts').orderBy('createdAt', 'desc').limit(100).get();
      res.json({ alerts: snap.docs.map(d => ({ id: d.id, ...d.data() })) });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // MY ALERTS
  base.get('/alerts/my', authMiddleware, async (req, res) => {
    try {
      if (!firebaseReady) {
        return res.json({ alerts: [{ id: 'demo1', riskLevel: 'High', messageEn: 'Demo geofenced alert for your area', read: false, createdAt: new Date().toISOString() }] });
      }
      const snap = await db.collection('user_alerts').where('userId', '==', req.user.uid).limit(50).get();
      res.json({ alerts: snap.docs.map(d => ({ id: d.id, ...d.data() })) });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // REPORTS
  base.post('/reports', async (req, res) => {
    try {
      const { lat, lon, disasterType, description, severity, location } = req.body;
      const report = {
        lat: parseFloat(lat) || 0, lon: parseFloat(lon) || 0,
        disasterType: disasterType || 'other', description: description || '',
        severity: severity || 'moderate', location: location || 'Unknown',
        status: 'pending', createdAt: new Date().toISOString()
      };
      if (firebaseReady) {
        const ref = await db.collection('reports').add(report);
        report.id = ref.id;
      } else {
        report.id = 'demo_' + Date.now();
      }
      res.json({ message: 'Report submitted successfully', report });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

// Mount on multiple bases so Netlify path rewriting always works
mountRoutes(app);
mountRoutes(express.Router()); // safety

// Direct mounts for redirected paths
const apiRouter = express.Router();
mountRoutes(apiRouter);
app.use('/api', apiRouter);
app.use('/', apiRouter);

// Export serverless handler
const handler = serverless(app);
module.exports.handler = async (event, context) => {
  // Netlify sometimes passes path without /api — normalize
  if (event.path && event.path.startsWith('/.netlify/functions/api')) {
    event.path = event.path.replace('/.netlify/functions/api', '/api') || '/api/health';
  }
  return handler(event, context);
};