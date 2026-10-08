/**
 * BhoomiSuraksha — Kira AI Service
 * Matches server.js contract EXACTLY:
 *   analyzeDisasterRisk({ lat, lon, location, disasterType, weather }) → { ok, data }
 *   getKiraClient() → OpenAI-compatible client OR null
 */

const OpenAI = require('openai');
const { fallbackRisk } = require('./riskFallback');

const API_URL = (process.env.KIRA_API_URL || process.env.OPENAI_BASE_URL || 'https://kiraai.vn/api/v1').replace(/\/$/, '');
const API_KEY =
  process.env.KIRA_API_KEY ||
  process.env.GEMINI_API_KEY ||
  process.env.OPENAI_API_KEY ||
  '';
const MODEL_NAME = process.env.KIRA_MODEL || process.env.OPENAI_MODEL || 'gemini-3.6-flash';

let _client = null;

/**
 * Lazy OpenAI-compatible client (Kira / Gemini / Experiential / OpenAI)
 */
function getKiraClient() {
  if (!API_KEY || String(API_KEY).trim().length < 5) {
    return null;
  }
  if (_client) return _client;
  try {
    _client = new OpenAI({
      apiKey: API_KEY,
      baseURL: API_URL,
      timeout: 15000,
      maxRetries: 1
    });
    return _client;
  } catch (err) {
    console.error('❌ [Kira] Client init failed:', err.message);
    return null;
  }
}

function clampScore(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(100, Math.round(x)));
}

function normalizeLevel(level, score) {
  const s = String(level || '').trim().toLowerCase();
  if (s === 'severe' || s === 'critical' || s === 'extreme') return 'Severe';
  if (s === 'high' || s === 'warning') return 'High';
  if (s === 'moderate' || s === 'medium' || s === 'med') return 'Moderate';
  if (s === 'low' || s === 'safe' || s === 'minimal') return 'Low';
  // derive from score
  if (score >= 75) return 'Severe';
  if (score >= 50) return 'High';
  if (score >= 30) return 'Moderate';
  return 'Low';
}

/**
 * Force ANY model output into the exact analysis object server.js expects.
 */
function normalizeAnalysis(raw, weather, disasterType, location) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const score = clampScore(src.score ?? src.riskScore ?? src.risk_score ?? 0);
  const riskLevel = normalizeLevel(src.riskLevel ?? src.risk_level ?? src.level ?? src.severity, score);

  const primaryDisaster =
    src.primaryDisaster ||
    src.primary_disaster ||
    src.disasterType ||
    src.hazard ||
    (disasterType && disasterType !== 'multi' ? disasterType : 'Multi-Hazard');

  const explanation =
    src.explanation ||
    src.reason ||
    (Array.isArray(src.reasons) ? src.reasons.join(' ') : '') ||
    `${primaryDisaster} risk assessed for ${location} with score ${score}/100 (${riskLevel}).`;

  const explanationHindi =
    src.explanationHindi ||
    src.explanation_hi ||
    src.hindiExplanation ||
    `${location} में ${primaryDisaster} का जोखिम स्कोर ${score}/100 (${riskLevel})। सतर्क रहें।`;

  const smsEnglish =
    src.smsEnglish ||
    src.sms_en ||
    src?.alerts?.en ||
    src?.sms?.en ||
    src.message ||
    `BhoomiSuraksha ALERT: ${riskLevel} ${primaryDisaster} risk near ${location} (score ${score}/100). Helpline 112`;

  const smsHindi =
    src.smsHindi ||
    src.sms_hi ||
    src?.alerts?.hi ||
    src?.sms?.hi ||
    src.messageHi ||
    `भूमिसुरक्षा अलर्ट: ${location} में ${riskLevel} ${primaryDisaster} जोखिम (स्कोर ${score}/100)। हेल्पलाइन 112`;

  const recommendedAction =
    src.recommendedAction ||
    src.action ||
    src.recommendation ||
    'Follow local NDMA/SDMA guidance. Keep emergency contacts ready (112, 1078).';

  let confidence = Number(src.confidence);
  if (!Number.isFinite(confidence)) confidence = 0.8;
  if (confidence > 1) confidence = confidence / 100;

  return {
    riskLevel,
    score,
    primaryDisaster: String(primaryDisaster),
    explanation: String(explanation).slice(0, 600),
    explanationHindi: String(explanationHindi).slice(0, 600),
    smsEnglish: String(smsEnglish).slice(0, 240),
    smsHindi: String(smsHindi).slice(0, 240),
    recommendedAction: String(recommendedAction).slice(0, 300),
    confidence,
    parametersAnalyzed: {
      temp: weather?.temp ?? weather?.temperature ?? null,
      rain: weather?.rain ?? weather?.precipitation ?? null,
      windSpeed: weather?.windSpeed ?? weather?.wind_speed ?? null,
      humidity: weather?.humidity ?? null
    }
  };
}

function stripCodeFences(text) {
  let t = String(text || '').trim();
  if (t.startsWith('```')) {
    t = t.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  }
  const a = t.indexOf('{');
  const b = t.lastIndexOf('}');
  if (a !== -1 && b !== -1 && b > a) t = t.slice(a, b + 1);
  return t;
}

/**
 * MAIN — called by server.js as:
 *   const ai = await analyzeDisasterRisk({ lat, lon, location, disasterType, weather });
 *   if (!ai.ok) fallback... else analysis = ai.data
 */
async function analyzeDisasterRisk(input = {}) {
  const lat = input.lat;
  const lon = input.lon;
  const location = input.location || 'Selected Location';
  const disasterType = input.disasterType || 'multi';
  const weather = input.weather || {
    temp: 28,
    rain: 0,
    windSpeed: 10,
    humidity: 60
  };

  console.log(`🧠 [Kira AI] analyzeDisasterRisk → ${disasterType} @ ${location}`);

  const client = getKiraClient();
  if (!client) {
    console.warn('⚠️ [Kira AI] No API key / client → ok:false');
    return { ok: false, error: 'Kira client not configured' };
  }

  const prompt = `You are BhoomiSuraksha, India's multi-disaster early warning AI.
Analyze hazard risk for this location.

LOCATION: ${location}
COORDINATES: ${lat}, ${lon}
REQUESTED FOCUS: ${disasterType}

WEATHER:
- Temperature: ${weather.temp ?? weather.temperature ?? 'n/a'}°C
- Rainfall: ${weather.rain ?? weather.precipitation ?? 0} mm
- Wind: ${weather.windSpeed ?? weather.wind_speed ?? 0} km/h
- Humidity: ${weather.humidity ?? 'n/a'}%

Return ONLY raw JSON (no markdown) with EXACT keys:
{
  "riskLevel": "Low" | "Moderate" | "High" | "Severe",
  "score": 0-100,
  "primaryDisaster": "Flood|Landslide|Cyclone|Heat Wave|Cloudburst|Storm|Multi-Hazard",
  "explanation": "English scientific explanation 1-2 sentences",
  "explanationHindi": "Hindi explanation 1-2 sentences",
  "smsEnglish": "SMS under 160 chars starting with BhoomiSuraksha",
  "smsHindi": "Hindi SMS under 160 chars",
  "recommendedAction": "Clear action for citizens",
  "confidence": 0.0-1.0
}`;

  try {
    const response = await client.chat.completions.create({
      model: MODEL_NAME,
      messages: [
        {
          role: 'system',
          content: 'You are a meteorological risk engine for India. Output ONLY valid JSON. No markdown fences.'
        },
        { role: 'user', content: prompt }
      ],
      temperature: 0.1,
      max_tokens: 700
    });

    const rawText = response?.choices?.[0]?.message?.content || '';
    const cleaned = stripCodeFences(rawText);
    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error('❌ [Kira AI] JSON parse fail:', parseErr.message, cleaned.slice(0, 200));
      return { ok: false, error: 'Invalid JSON from model' };
    }

    const data = normalizeAnalysis(parsed, weather, disasterType, location);
    console.log(`✅ [Kira AI] ${data.riskLevel} ${data.score}/100 (${data.primaryDisaster})`);
    return { ok: true, data };
  } catch (err) {
    console.error('❌ [Kira AI] API error:', err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Optional helper used by some chat UIs (server has its own /api/chat)
 */
async function getChatbotReply(userMessage, chatHistory = [], lang = 'en') {
  const client = getKiraClient();
  if (!client) {
    return {
      ok: false,
      reply: lang === 'hi'
        ? 'AI offline mode। आपात स्थिति में 112 डायल करें।'
        : 'AI offline mode. For emergencies dial 112.'
    };
  }

  const system =
    lang === 'hi'
      ? 'Aap BhoomiSuraksha AI assistant ho. Hinglish/Hindi me short life-saving advice do. Numbers: 112, 1078, 108.'
      : 'You are BhoomiSuraksha AI assistant for India disasters. Short actionable advice. Mention 112, 1078, 108 when needed.';

  const messages = [
    { role: 'system', content: system },
    ...((chatHistory || []).slice(-6).map((m) => ({
      role: m.role || (m.sender === 'user' ? 'user' : 'assistant'),
      content: String(m.content || m.text || '').slice(0, 500)
    }))),
    { role: 'user', content: String(userMessage || '').slice(0, 500) }
  ];

  try {
    const response = await client.chat.completions.create({
      model: MODEL_NAME,
      messages,
      temperature: 0.5,
      max_tokens: 400
    });
    const reply = response?.choices?.[0]?.message?.content?.trim();
    return { ok: !!reply, reply: reply || 'Please check dashboard alerts and dial 112 in emergency.' };
  } catch (err) {
    return { ok: false, reply: 'Network issue. Emergency: 112 / NDRF 1078.' };
  }
}

module.exports = {
  analyzeDisasterRisk,
  getKiraClient,
  getChatbotReply
};