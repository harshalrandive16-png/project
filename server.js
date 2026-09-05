/* ================================================================
   🚀 BhoomiSuraksha Backend — COMPLETE (Express 5 safe)
   ================================================================ */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');

const { fetchWeather } = require('./services/openmeteo');
const { analyzeDisasterRisk } = require('./services/kiraAI');
const { fallbackRisk } = require('./services/riskFallback');
const { findUsersInRadius, buildGeofenceAlert } = require('./services/geofence');

const admin = require('firebase-admin');
const keyPath = path.join(__dirname, 'serviceAccountKey.json');

if (!fs.existsSync(keyPath)) {
  console.error('❌ serviceAccountKey.json NOT FOUND');
  process.exit(1);
}

let serviceAccount;
try {
  serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
} catch (e) {
  console.error('❌ serviceAccountKey.json invalid:', e.message);
  process.exit(1);
}

if (!serviceAccount.project_id || !serviceAccount.private_key || !serviceAccount.client_email) {
  console.error('❌ serviceAccountKey missing required fields');
  process.exit(1);
}

if (serviceAccount.private_key.includes('\\n')) {
  serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket:
      process.env.FIREBASE_STORAGE_BUCKET ||
      serviceAccount.project_id + '.appspot.com'
  });
}
console.log('🔥 Firebase Admin initialized');
console.log('📦 Project ID:', serviceAccount.project_id);

const db = admin.firestore();
const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'BhoomiSuraksha_Default_Secret';

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

function verifyJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'No token provided. Please login.' });
  }
  try {
    req.user = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token.' });
  }
}

// ---------- HEALTH ----------
app.get('/api/health', (req, res) => {
  const hasKira = !!(process.env.KIRA_API_KEY || process.env.GEMINI_API_KEY);
  res.json({
    success: true,
    message: '✅ BhoomiSuraksha Backend is Live',
    timestamp: new Date().toISOString(),
    services: {
      firebase: '✅ connected',
      firestore: '✅ ready',
      kiraAI: hasKira ? '✅ configured' : '⚠️ API key not set',
      openMeteo: '✅ ready',
      analyzeRisk: '✅ POST /api/analyze-risk',
      userLocation: '✅ POST /api/user/location',
      geofence: '✅ POST /api/alerts/geofence'
    }
  });
});

// ---------- SIGNUP ----------
app.post('/api/signup', async (req, res) => {
  try {
    const { name, email, phone, password, state } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Name, email, and password are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }

    const existing = await db.collection('users').where('email', '==', email.toLowerCase().trim()).limit(1).get();
    if (!existing.empty) {
      return res.status(409).json({ success: false, message: 'Email already registered. Please log in.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = {
      name: name.trim(),
      email: email.toLowerCase().trim(),
      phone: phone || '',
      state: state || 'India',
      role: 'Citizen Reporter',
      password: hashedPassword,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      joined: new Date().toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
    };

    const docRef = await db.collection('users').add(newUser);
    const token = jwt.sign(
      { uid: docRef.id, email: newUser.email, name: newUser.name },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    delete newUser.password;
    delete newUser.createdAt;

    console.log('✅ Signup:', newUser.email);
    res.status(201).json({ success: true, message: 'Account created', token, user: { uid: docRef.id, ...newUser } });
  } catch (err) {
    console.error('❌ Signup:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ---------- LOGIN ----------
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password required' });
    }

    const snapshot = await db.collection('users').where('email', '==', email.toLowerCase().trim()).limit(1).get();
    if (snapshot.empty) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const userDoc = snapshot.docs[0];
    const userData = userDoc.data();
    const ok = await bcrypt.compare(password, userData.password);
    if (!ok) return res.status(401).json({ success: false, message: 'Incorrect password' });

    const token = jwt.sign(
      { uid: userDoc.id, email: userData.email, name: userData.name },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    delete userData.password;
    delete userData.createdAt;

    console.log('✅ Login:', userData.email);
    res.json({ success: true, message: 'Login successful', token, user: { uid: userDoc.id, ...userData } });
  } catch (err) {
    console.error('❌ Login:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ---------- ME / PROFILE ----------
app.get('/api/me', verifyJWT, async (req, res) => {
  try {
    const userDoc = await db.collection('users').doc(req.user.uid).get();
    if (!userDoc.exists) return res.status(404).json({ success: false, message: 'User not found' });
    const userData = userDoc.data();
    delete userData.password;
    res.json({ success: true, user: { uid: userDoc.id, ...userData } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.put('/api/profile', verifyJWT, async (req, res) => {
  try {
    const { name, phone, state } = req.body;
    const updates = {};
    if (name) updates.name = name.trim();
    if (phone !== undefined) updates.phone = phone;
    if (state) updates.state = state;
    await db.collection('users').doc(req.user.uid).update(updates);
    const updatedDoc = await db.collection('users').doc(req.user.uid).get();
    const userData = updatedDoc.data();
    delete userData.password;
    res.json({ success: true, user: { uid: updatedDoc.id, ...userData } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ---------- LOCATION (geofence) ----------
app.post('/api/user/location', verifyJWT, async (req, res) => {
  try {
    const { lat, lon, accuracy, source } = req.body || {};
    if (lat == null || lon == null || isNaN(Number(lat)) || isNaN(Number(lon))) {
      return res.status(400).json({ success: false, message: 'Valid lat and lon required' });
    }

    const lastLocation = {
      lat: Number(lat),
      lon: Number(lon),
      accuracy: accuracy != null ? Number(accuracy) : null,
      source: source || 'browser',
      updatedAt: new Date().toISOString()
    };

    await db.collection('users').doc(req.user.uid).set({ lastLocation }, { merge: true });
    console.log('📍 Location saved:', req.user.email || req.user.uid, lastLocation.lat, lastLocation.lon);

    res.json({ success: true, message: 'Location updated for geofenced alerts', lastLocation });
  } catch (err) {
    console.error('❌ location:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ---------- ANALYZE RISK ----------
app.post('/api/analyze-risk', async (req, res) => {
  try {
    const {
      lat = 28.6139,
      lon = 77.2090,
      location = 'Delhi NCR',
      disasterType = 'multi'
    } = req.body || {};

    console.log('🛰️ Analyze-risk:', { lat, lon, location, disasterType });

    const weather = await fetchWeather(Number(lat), Number(lon));
    const ai = await analyzeDisasterRisk({
      lat: Number(lat),
      lon: Number(lon),
      location,
      disasterType,
      weather
    });

    let analysis;
    let engine = 'kira-ai';
    if (!ai.ok) {
      console.log('⚠️ AI fail → fallback');
      analysis = fallbackRisk({ weather, disasterType, location });
      engine = 'rule-fallback';
    } else {
      analysis = ai.data;
    }

    try {
      await db.collection('ai_analyses').add({
        lat: Number(lat),
        lon: Number(lon),
        location,
        disasterType,
        weather,
        analysis,
        engine,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
    } catch (e) {}

    console.log('🧠', analysis.riskLevel, analysis.score, engine);

    res.json({
      success: true,
      engine,
      location,
      coordinates: { lat: Number(lat), lon: Number(lon) },
      disasterType,
      weather,
      riskLevel: analysis.riskLevel,
      score: analysis.score,
      primaryDisaster: analysis.primaryDisaster,
      explanation: analysis.explanation,
      explanationHindi: analysis.explanationHindi,
      smsEnglish: analysis.smsEnglish,
      smsHindi: analysis.smsHindi,
      recommendedAction: analysis.recommendedAction,
      confidence: analysis.confidence ?? null
    });
  } catch (err) {
    console.error('❌ analyze-risk:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ---------- GEOFENCE ALERT ----------
app.post('/api/alerts/geofence', async (req, res) => {
  try {
    const {
      lat,
      lon,
      location = 'Unknown',
      radiusKm = 10,
      riskLevel = 'High',
      score = 70,
      primaryDisaster = 'Multi',
      smsEnglish = '',
      smsHindi = '',
      engine = 'manual'
    } = req.body || {};

    if (lat == null || lon == null) {
      return res.status(400).json({ success: false, message: 'lat and lon required' });
    }

    const snap = await db.collection('users').get();
    const matchedUsers = findUsersInRadius(snap.docs, Number(lat), Number(lon), Number(radiusKm));

    const alertDoc = buildGeofenceAlert({
      centerLat: Number(lat),
      centerLon: Number(lon),
      radiusKm: Number(radiusKm),
      location,
      riskLevel,
      score: Number(score),
      primaryDisaster,
      smsEnglish,
      smsHindi,
      matchedUsers,
      engine
    });

    const ref = await db.collection('alerts').add({
      ...alertDoc,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    if (matchedUsers.length > 0) {
      const batch = db.batch();
      matchedUsers.forEach((u) => {
        batch.set(db.collection('user_alerts').doc(), {
          alertId: ref.id,
          userId: u.uid,
          userName: u.name,
          userEmail: u.email,
          distanceKm: u.distanceKm,
          riskLevel,
          primaryDisaster,
          location,
          center: { lat: Number(lat), lon: Number(lon) },
          radiusKm: Number(radiusKm),
          smsEnglish,
          smsHindi,
          read: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
      });
      await batch.commit();
    }

    console.log('✅ Geofence users:', matchedUsers.length);
    res.status(201).json({
      success: true,
      alertId: ref.id,
      userCount: matchedUsers.length,
      matchedUsers: matchedUsers.map((u) => ({
        uid: u.uid,
        name: u.name,
        distanceKm: u.distanceKm
      })),
      alert: alertDoc
    });
  } catch (err) {
    console.error('❌ geofence:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/alerts/my', verifyJWT, async (req, res) => {
  try {
    const snap = await db.collection('user_alerts').where('userId', '==', req.user.uid).limit(50).get();
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    items.sort((a, b) => (b.createdAt?._seconds || 0) - (a.createdAt?._seconds || 0));
    res.json({ success: true, count: items.length, alerts: items });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/alerts', async (req, res) => {
  try {
    const snap = await db.collection('alerts').limit(100).get();
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    items.sort((a, b) => (b.createdAt?._seconds || 0) - (a.createdAt?._seconds || 0));
    res.json({ success: true, count: items.length, alerts: items });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/analyze-and-alert', async (req, res) => {
  try {
    const {
      lat = 28.6139,
      lon = 77.2090,
      location = 'Delhi NCR',
      disasterType = 'multi',
      radiusKm = 10
    } = req.body || {};

    const weather = await fetchWeather(Number(lat), Number(lon));
    const ai = await analyzeDisasterRisk({
      lat: Number(lat),
      lon: Number(lon),
      location,
      disasterType,
      weather
    });

    let analysis;
    let engine = 'kira-ai';
    if (!ai.ok) {
      analysis = fallbackRisk({ weather, disasterType, location });
      engine = 'rule-fallback';
    } else {
      analysis = ai.data;
    }

    let geofence = { triggered: false, userCount: 0 };

    if (analysis.riskLevel === 'High' || analysis.riskLevel === 'Severe') {
      const snap = await db.collection('users').get();
      const matchedUsers = findUsersInRadius(snap.docs, Number(lat), Number(lon), Number(radiusKm));
      const alertDoc = buildGeofenceAlert({
        centerLat: Number(lat),
        centerLon: Number(lon),
        radiusKm: Number(radiusKm),
        location,
        riskLevel: analysis.riskLevel,
        score: analysis.score,
        primaryDisaster: analysis.primaryDisaster,
        smsEnglish: analysis.smsEnglish,
        smsHindi: analysis.smsHindi,
        matchedUsers,
        engine
      });
      const ref = await db.collection('alerts').add({
        ...alertDoc,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
      if (matchedUsers.length) {
        const batch = db.batch();
        matchedUsers.forEach((u) => {
          batch.set(db.collection('user_alerts').doc(), {
            alertId: ref.id,
            userId: u.uid,
            userName: u.name,
            distanceKm: u.distanceKm,
            riskLevel: analysis.riskLevel,
            primaryDisaster: analysis.primaryDisaster,
            location,
            smsEnglish: analysis.smsEnglish,
            smsHindi: analysis.smsHindi,
            read: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
          });
        });
        await batch.commit();
      }
      geofence = {
        triggered: true,
        alertId: ref.id,
        userCount: matchedUsers.length,
        matchedUsers: matchedUsers.map((u) => ({ uid: u.uid, name: u.name, distanceKm: u.distanceKm }))
      };
    } else {
      geofence.reason = 'Only High/Severe auto-trigger geofence';
    }

    res.json({
      success: true,
      engine,
      location,
      weather,
      riskLevel: analysis.riskLevel,
      score: analysis.score,
      primaryDisaster: analysis.primaryDisaster,
      explanation: analysis.explanation,
      explanationHindi: analysis.explanationHindi,
      smsEnglish: analysis.smsEnglish,
      smsHindi: analysis.smsHindi,
      recommendedAction: analysis.recommendedAction,
      geofence
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ---------- Static frontend (API ke baad) ----------
app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Express 5 SAFE 404 for unknown /api routes (NO /api/* wildcard)
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({
      success: false,
      message: 'API route not found: ' + req.method + ' ' + req.path
    });
  }
  next();
});

/* ================================================================
   🚀 app.listen — SIRF YAHAN, SIRF EK BAAR, FILE KE END PE
   Alag file/folder MAT banao
   ================================================================ */
app.listen(PORT, () => {
  console.log('');
  console.log('════════════════════════════════════════════════════');
  console.log('🚀 BhoomiSuraksha Backend Running');
  console.log('════════════════════════════════════════════════════');
  console.log('🌐 http://localhost:' + PORT);
  console.log('🏥 GET  /api/health');
  console.log('📍 POST /api/user/location (JWT)');
  console.log('🧠 POST /api/analyze-risk');
  console.log('📢 POST /api/alerts/geofence');
  console.log('📥 GET  /api/alerts/my (JWT)');
  console.log('════════════════════════════════════════════════════');
  console.log('');
});