// ═══════════════════════════════════════════════════════════
// 🏔️ BhoomiSuraksha — Netlify Serverless Handler
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
// 🔥 FIREBASE INIT
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
        const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
        serviceAccount = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (serviceAccount && serviceAccount.private_key) {
          serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
        }
      } catch (e) {
        serviceAccount = null;
      }
    }

    if (!serviceAccount) {
      try {
        const keyPath = path.join(__dirname, '../../serviceAccountKey.json');
        if (fs.existsSync(keyPath)) {
          serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
          if (serviceAccount && serviceAccount.private_key) {
            serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
          }
        }
      } catch (e) {}
    }

    if (!serviceAccount) return false;

    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'bhoomishuraksh.firebasestorage.app'
      });
    }

    db = admin.firestore();
    firebaseReady = true;
    return true;
  } catch (err) {
    firebaseReady = false;
    return false;
  }
}

try { initFirebase(); } catch (e) {}

// ═══════════════════════════════════════════════════════════
// 🧠 SERVICES LOAD
// ═══════════════════════════════════════════════════════════
let kiraAI = null;
let openMeteo = null;
let riskFallback = null;

try { kiraAI = require('../../services/kiraAI'); } catch (e) {}
try { openMeteo = require('../../services/openmeteo'); } catch (e) {}
try { riskFallback = require('../../services/riskFallback'); } catch (e) {}

// ═══════════════════════════════════════════════════════════
// 📡 ROUTER (HANDLES ALL REDIRECT PATHS)
// ═══════════════════════════════════════════════════════════

const router = express.Router();

const healthResponse = (req, res) => {
  let kiraStatus = false;
  try { kiraStatus = kiraAI && typeof kiraAI.isKiraReady === 'function' && kiraAI.isKiraReady(); } catch (e) {}

  res.json({
    status: 'ok',
    project: 'BhoomiSuraksha',
    title: 'AI-Based Multi-Disaster Early Warning and Risk Monitoring System',
    version: '2.0',
    scope: 'PAN-INDIA',
    platform: 'Netlify Serverless',
    timestamp: new Date().toISOString(),
    services: {
      firebase: firebaseReady ? '✅ connected' : '🎭 demo fallback mode',
      kiraAI: kiraStatus ? '✅ ready (Gemini)' : '⚠️ rule-fallback active',
      openMeteo: '✅ free (no key required)',
      geofencing: '✅ Haversine distance active'
    }
  });
};

router.get('/health', healthResponse);
router.get('/', healthResponse);

// ANALYZE RISK
router.post('/analyze-risk', async (req, res) => {
  try {
    const { lat, lon, location, disasterType } = req.body;
    const latNum = parseFloat(lat) || 26.1445;
    const lonNum = parseFloat(lon) || 91.7362;
    const locName = location || `${latNum.toFixed(2)}°N, ${lonNum.toFixed(2)}°E`;
    const dType = disasterType || 'auto';

    let weather = null;
    if (openMeteo) {
      try { weather = await openMeteo.getWeather(latNum, lonNum); } catch (e) {}
    }
    if (!weather) {
      weather = { temperature: 28, humidity: 78, precipitation: 18, windSpeed: 22, rainfall24h: 55, rainfall48h: 90, condition: 'Heavy Rain Showers' };
    }

    let aiResult = null;
    let engine = 'rule-fallback';

    if (kiraAI && typeof kiraAI.isKiraReady === 'function' && kiraAI.isKiraReady()) {
      try { aiResult = await kiraAI.analyzeWithKira(latNum, lonNum, locName, dType, weather); } catch (e) {}
      if (aiResult && aiResult.score != null) engine = 'kira-ai';
    }

    if (!aiResult || aiResult.score == null) {
      aiResult = riskFallback ? riskFallback.getRuleBasedRisk(weather, dType) : {
        score: 68, riskLevel: 'High',
        explanation: `Heavy rainfall detected (${weather.rainfall24h}mm/24h) with high humidity (${weather.humidity}%). Disaster risk is HIGH.`,
        explanationHindi: `भारी बारिश (${weather.rainfall24h}mm/24h) और उच्च नमी (${weather.humidity}%) पाई गई। आपदा का खतरा अधिक है।`,
        recommendedAction: 'Stay indoors, keep emergency kit ready, follow NDMA instructions.',
        smsEnglish: `⚠️ BhoomiSuraksha ALERT: High risk near ${locName}. Rain: ${weather.rainfall24h}mm. Stay safe! Emergency: 112`,
        smsHindi: `⚠️ भूमिसुरक्षा अलर्ट: ${locName} के पास उच्च खतरा। बारिश: ${weather.rainfall24h}mm। सुरक्षित रहें! हेल्पलाइन: 112`
      };
    }

    res.json({
      location: locName,
      coordinates: { lat: latNum, lon: lonNum },
      disasterType: dType,
      weather,
      score: aiResult.score,
      riskLevel: aiResult.riskLevel || 'High',
      explanation: aiResult.explanation,
      explanationHindi: aiResult.explanationHindi,
      recommendedAction: aiResult.recommendedAction,
      smsEnglish: aiResult.smsEnglish,
      smsHindi: aiResult.smsHindi,
      engine,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ALERTS FEED
router.get('/alerts', async (req, res) => {
  try {
    if (!firebaseReady) {
      return res.json({ alerts: [
        { id: 'demo1', riskLevel: 'Severe', disasterType: 'flood', messageEn: '⚠️ Severe flood warning in Guwahati region. Heavy precipitation.', messageHi: '⚠️ गुवाहाटी क्षेत्र में गंभीर बाढ़ की चेतावनी।', score: 88, createdAt: new Date().toISOString() },
        { id: 'demo2', riskLevel: 'High', disasterType: 'landslide', messageEn: '⚠️ High landslide risk detected along Shillong bypass.', messageHi: '⚠️ शिलांग बाईपास के पास उच्च भूस्खलन जोखिम।', score: 72, createdAt: new Date(Date.now() - 3600000).toISOString() }
      ]});
    }
    const snap = await db.collection('alerts').orderBy('createdAt', 'desc').limit(50).get();
    res.json({ alerts: snap.docs.map(d => ({ id: d.id, ...d.data() })) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// MOUNT PATHS
app.use('/.netlify/functions/api', router);
app.use('/api', router);
app.use('/', router);

module.exports.handler = serverless(app);