/* ================================================================
   BhoomiSuraksha — Kira AI (lazy init, no crash if key missing)
   ================================================================ */
const OpenAI = require('openai');

const MODEL = process.env.KIRA_MODEL || process.env.OPENAI_MODEL || 'gemini-3.6-flash';

function getApiKey() {
  return (
    process.env.KIRA_API_KEY ||
    process.env.GEMINI_API_KEY ||
    process.env.OPENAI_API_KEY ||
    ''
  ).trim();
}

function getBaseURL() {
  return (
    process.env.KIRA_BASE_URL ||
    process.env.OPENAI_BASE_URL ||
    'https://kiraai.vn/api/v1'
  );
}

/** Client tabhi banao jab key ho — warna null (rule-fallback use hoga) */
function getClient() {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.warn('⚠️ No KIRA/OPENAI/GEMINI API key — AI disabled, using rule-fallback');
    return null;
  }

  try {
    return new OpenAI({
      apiKey: apiKey,
      baseURL: getBaseURL()
    });
  } catch (err) {
    console.error('❌ OpenAI client init failed:', err.message);
    return null;
  }
}

async function analyzeDisasterRisk({ lat, lon, location, disasterType, weather }) {
  const client = getClient();

  if (!client) {
    return { ok: false, error: 'API key not configured on server' };
  }

  const prompt = `
You are BhoomiSuraksha, India's AI multi-disaster early warning system for NDMA/SDMA.

Location: ${location || 'Unknown'}
Coordinates: ${lat}, ${lon}
Focus disaster: ${disasterType || 'multi'}

Live weather metrics:
${JSON.stringify(weather || {}, null, 2)}

Analyze risk for: Floods, Cyclones, Landslides, Earthquakes, Extreme rainfall.
Return STRICT JSON only (no markdown, no code blocks) with this exact shape:
{
  "riskLevel": "Low" | "Moderate" | "High" | "Severe",
  "score": 0-100,
  "primaryDisaster": "Flood" | "Cyclone" | "Landslide" | "Earthquake" | "Extreme Rainfall" | "Multi",
  "explanation": "2-3 sentence English explanation",
  "explanationHindi": "2-3 sentence Hindi explanation",
  "smsEnglish": "SMS under 160 chars with location + action",
  "smsHindi": "Hindi SMS under 160 chars",
  "recommendedAction": "clear action for citizens + authority",
  "confidence": 0-100
}
`;

  try {
    const completion = await client.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: 'system',
          content: 'You are an expert disaster risk analyst for India. Reply with valid JSON only. No markdown.'
        },
        { role: 'user', content: prompt }
      ],
      temperature: 0.4
    });

    let text = completion.choices?.[0]?.message?.content || '';
    text = text.replace(/```json/gi, '').replace(/```/g, '').trim();

    const parsed = JSON.parse(text);
    return { ok: true, source: 'kira-ai', data: parsed };
  } catch (err) {
    console.error('❌ Kira AI error:', err.message);
    return { ok: false, error: err.message };
  }
}

module.exports = { analyzeDisasterRisk, MODEL };