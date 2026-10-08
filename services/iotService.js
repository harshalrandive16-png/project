/* ============================================================
   BhoomiSuraksha — IoT Sensor Service Engine v2.0
   File: services/iotService.js
   ============================================================
   Nodes : Jal (flood) • Bhumi (landslide/seismic) • Van (forest fire) • Vayu (air quality)

   v2.0 mein kya naya hai
   - 4th node: Vayu-Shuraksha (CPCB PM2.5/PM10 thresholds) — sirf advisory, siren/SMS nahi
   - Payload validation (range check, unknown keys drop) + legacy payload aliases
     (sensorId/nodeType/metrics, coPpm, vibrationFreq) taaki purana simulator / alag firmware bhi chale
   - Rate-of-rise PREDICTION: linear regression se "kitne minute mein SEVERE" (ETA)
   - Alert kinds: PREDICTED (ETA lead-time ke andar) aur SEVERE (threshold cross)
     PREDICTED -> SEVERE escalation allowed, baaki cooldown ke andar duplicate nahi
   - Autopilot ko sahi signature: (typeLabel, message, origin, meta)
   - Firestore: server.js ka global.db use hota hai (alag init / hardcoded bucket hata diya)
   - getLiveSensors(): online flag, prediction, series (dashboard graph ke liye)
   ============================================================ */
'use strict';

const RISK_ORDER = ['LOW', 'MODERATE', 'HIGH', 'SEVERE'];
const rank = (r) => RISK_ORDER.indexOf(r);

// India bounding box (location override validation)
const INDIA_BOX = { minLat: 6, maxLat: 38, minLng: 68, maxLng: 98 };

const HISTORY_MAX_POINTS = 30;          // per metric
const HISTORY_MAX_AGE_MS = 10 * 60 * 1000;
const REGRESSION_POINTS = 6;            // last N samples se slope
const REGRESSION_MIN_POINTS = 4;
const MIN_R2 = 0.8;                     // trend kitna "seedha" ho tabhi bharosa
const ONLINE_WINDOW_MS = 45 * 1000;     // iske andar data aaya to node online
const ALERT_COOLDOWN_MS = 5 * 60 * 1000;

// ─── Threshold Config (IMD / GSI / CWC / CPCB) ───
const THRESHOLDS = {
  jalNode: {
    waterLevel: { SEVERE: 300, HIGH: 200, MODERATE: 120 }        // cm (CWC basin logic)
  },
  bhumiNode: {
    slopeTilt: { SEVERE: 3.0, HIGH: 1.5, MODERATE: 0.8 },        // degree (GSI)
    vibration: { SEVERE: 50, HIGH: 25, MODERATE: 10 }            // Hz
  },
  vanNode: {
    temperature: { SEVERE: 45, HIGH: 38, MODERATE: 33 },         // °C
    co: { SEVERE: 50, HIGH: 20, MODERATE: 10 }                   // ppm
  },
  vayuNode: {
    pm25: { SEVERE: 250, HIGH: 121, MODERATE: 61 },              // µg/m³ (CPCB breakpoints)
    pm10: { SEVERE: 430, HIGH: 251, MODERATE: 101 }
  }
};

// ─── Node Config ───
// metrics: allowed keys + valid range + aliases (firmware ke alag naam)
// severe: prediction ke liye "SEVERE kab banega" ka rule (any = koi ek, all = dono)
// leadMin: itne minute ke andar SEVERE ka ETA ho to PREDICTED alert
// autopilot: false => siren/SMS kabhi nahi (sirf dashboard + Firestore)
const NODE_CONFIG = {
  jalNode: {
    name: 'Jal-Shuraksha', type: 'flood', label: 'FLOOD',
    hardware: 'ESP32 + JSN-SR04T Ultrasonic',
    location: { lat: 21.1524, lng: 79.0805, label: 'Nagpur, Maharashtra' },
    autopilot: true, radiusKm: 15, leadMin: 60,
    primary: { metric: 'waterLevel', unit: 'cm' },
    metrics: {
      waterLevel: { min: 0, max: 2000, unit: 'cm', aliases: ['water_level', 'level'] },
      rainfallRate: { min: 0, max: 500, unit: 'mm/h', aliases: ['rainfall', 'rain'] }
    },
    defaults: { waterLevel: 0, rainfallRate: 0, trend: '➡️ Stable' },
    severe: { mode: 'any', items: [{ metric: 'waterLevel', value: 300 }] }
  },
  bhumiNode: {
    name: 'Bhumi-Shuraksha', type: 'landslide', label: 'LANDSLIDE',
    hardware: 'ESP32-S3 + MPU6050',
    location: { lat: 21.1700, lng: 79.0900, label: 'Nagpur Hills, Maharashtra' },
    autopilot: true, radiusKm: 10, leadMin: 120,
    primary: { metric: 'slopeTilt', unit: '°' },
    metrics: {
      slopeTilt: { min: 0, max: 90, unit: '°', aliases: ['tilt', 'slope_tilt'] },
      vibration: { min: 0, max: 500, unit: 'Hz', aliases: ['vibrationFreq', 'vibration_hz'] }
    },
    defaults: { slopeTilt: 0, vibration: 0 },
    severe: { mode: 'any', items: [{ metric: 'slopeTilt', value: 3.0 }] }
  },
  vanNode: {
    name: 'Van-Shuraksha', type: 'forest_fire', label: 'FOREST FIRE',
    hardware: 'ESP32 + BME280 + MQ-7',
    location: { lat: 21.1400, lng: 79.0700, label: 'Nagpur Forest Belt' },
    autopilot: true, radiusKm: 15, leadMin: 60,
    primary: { metric: 'co', unit: 'ppm' },
    metrics: {
      temperature: { min: -20, max: 120, unit: '°C', aliases: ['temp', 'temperatureC'] },
      humidity: { min: 0, max: 100, unit: '%', aliases: ['hum'] },
      co: { min: 0, max: 1000, unit: 'ppm', aliases: ['coPpm', 'co_ppm'] }
    },
    defaults: { temperature: 25, humidity: 60, co: 5 },
    // Spec: SEVERE = temp >= 45 AND CO >= 50 (dono chahiye)
    severe: { mode: 'all', items: [{ metric: 'temperature', value: 45 }, { metric: 'co', value: 50 }] }
  },
  vayuNode: {
    name: 'Vayu-Shuraksha', type: 'air_quality', label: 'AIR QUALITY',
    hardware: 'SDS011 + MQ-135 + LoRa',
    location: { lat: 21.1458, lng: 79.0882, label: 'Nagpur City Centre' },
    autopilot: false, radiusKm: 0, leadMin: 0,
    primary: { metric: 'pm25', unit: 'µg/m³' },
    metrics: {
      pm25: { min: 0, max: 2000, unit: 'µg/m³', aliases: ['pm2_5', 'pm2.5'] },
      pm10: { min: 0, max: 3000, unit: 'µg/m³', aliases: ['pm_10'] },
      gasIndex: { min: 0, max: 1000, unit: 'idx', aliases: ['mq135', 'gas'] }
    },
    defaults: { pm25: 35, pm10: 60, gasIndex: 80 },
    severe: { mode: 'any', items: [{ metric: 'pm25', value: 250 }] }
  }
};

const NODE_TYPE_TO_ID = { JAL: 'jalNode', BHUMI: 'bhumiNode', VAN: 'vanNode', VAYU: 'vayuNode' };

// ─── In-Memory Store ───
const liveSensorData = {};
const history = {};   // history[nodeId][metric] = [{ t, v }]

function freshNode(nodeId) {
  const c = NODE_CONFIG[nodeId];
  return {
    nodeId,
    name: c.name,
    type: c.type,
    location: { ...c.location },
    hardware: c.hardware,
    risk: 'LOW',
    data: { ...c.defaults },
    timestamp: null,
    lastSevereAt: null,
    lastAlert: { kind: null, at: 0 }
  };
}
function initStore() {
  Object.keys(NODE_CONFIG).forEach((id) => {
    liveSensorData[id] = freshNode(id);
    history[id] = {};
  });
}
initStore();

// ─── Payload normalisation + validation ───
function toNum(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
  return NaN;
}

/**
 * Body se { nodeId, data, location, deviceId } nikalta hai.
 * Supports:
 *   new    : { nodeId:'jalNode', data:{ waterLevel: 120 } }
 *   legacy : { sensorId:'ESP32_JAL_01', nodeType:'JAL', metrics:{ waterLevel: 120 }, lat, lng }
 */
function normalizeIngest(body) {
  if (!body || typeof body !== 'object') return { ok: false, error: 'JSON body required' };

  let nodeId = typeof body.nodeId === 'string' ? body.nodeId.trim() : '';
  if (!nodeId && typeof body.nodeType === 'string') nodeId = NODE_TYPE_TO_ID[body.nodeType.trim().toUpperCase()] || '';
  if (!nodeId) return { ok: false, error: 'nodeId required (jalNode / bhumiNode / vanNode / vayuNode)' };
  const cfg = NODE_CONFIG[nodeId];
  if (!cfg) return { ok: false, error: 'Unknown nodeId: ' + String(nodeId).slice(0, 40) };

  const raw = (body.data && typeof body.data === 'object') ? body.data
            : (body.metrics && typeof body.metrics === 'object') ? body.metrics : null;
  if (!raw || Array.isArray(raw)) return { ok: false, error: 'data object required' };

  const data = {};
  const problems = [];
  for (const [key, spec] of Object.entries(cfg.metrics)) {
    const names = [key, ...(spec.aliases || [])];
    const found = names.find((n) => Object.prototype.hasOwnProperty.call(raw, n));
    if (!found) continue;
    const n = toNum(raw[found]);
    if (!Number.isFinite(n)) { problems.push(`${key}: number chahiye`); continue; }
    if (n < spec.min || n > spec.max) { problems.push(`${key}: ${n} range (${spec.min}..${spec.max}) se bahar — sensor fault?`); continue; }
    data[key] = Math.round(n * 100) / 100;
  }
  if (problems.length) return { ok: false, error: problems.join('; ') };
  if (!Object.keys(data).length) return { ok: false, error: 'Koi valid metric nahi mila for ' + nodeId };

  // Optional: node ko kisi aur jagah "re-home" karna (demo / real deployment)
  let location = null;
  const loc = body.location && typeof body.location === 'object' ? body.location
            : (body.lat !== undefined && body.lng !== undefined ? { lat: body.lat, lng: body.lng, label: body.locationName } : null);
  if (loc) {
    const lat = toNum(loc.lat);
    const lng = toNum(loc.lng !== undefined ? loc.lng : loc.lon);
    if (Number.isFinite(lat) && Number.isFinite(lng) &&
        lat >= INDIA_BOX.minLat && lat <= INDIA_BOX.maxLat && lng >= INDIA_BOX.minLng && lng <= INDIA_BOX.maxLng) {
      location = { lat: Math.round(lat * 1e5) / 1e5, lng: Math.round(lng * 1e5) / 1e5 };
      if (typeof loc.label === 'string' && loc.label.trim()) location.label = loc.label.trim().slice(0, 60);
    } else {
      return { ok: false, error: 'location India ki boundary ke andar honi chahiye' };
    }
  }

  const deviceId = typeof body.deviceId === 'string' ? body.deviceId.trim().slice(0, 60)
                 : typeof body.sensorId === 'string' ? body.sensorId.trim().slice(0, 60) : null;
  return { ok: true, nodeId, data, location, deviceId };
}

// ─── Risk Engine ───
function levelOf(value, t) {
  if (value >= t.SEVERE) return 'SEVERE';
  if (value >= t.HIGH) return 'HIGH';
  if (value >= t.MODERATE) return 'MODERATE';
  return 'LOW';
}
const maxRisk = (a, b) => (rank(a) >= rank(b) ? a : b);

function calculateRisk(nodeId, d) {
  const t = THRESHOLDS[nodeId];
  if (!t) return 'LOW';
  switch (nodeId) {
    case 'jalNode':
      return levelOf(d.waterLevel || 0, t.waterLevel);
    case 'bhumiNode':
      return maxRisk(levelOf(d.slopeTilt || 0, t.slopeTilt), levelOf(d.vibration || 0, t.vibration));
    case 'vanNode': {
      const temp = d.temperature != null ? d.temperature : 25;
      const co = d.co || 0;
      if (temp >= t.temperature.SEVERE && co >= t.co.SEVERE) return 'SEVERE';   // dono chahiye
      const best = maxRisk(levelOf(temp, t.temperature), levelOf(co, t.co));
      return best === 'SEVERE' ? 'HIGH' : best;                                  // ek akela = max HIGH
    }
    case 'vayuNode':
      return maxRisk(levelOf(d.pm25 || 0, t.pm25), levelOf(d.pm10 || 0, t.pm10));
    default:
      return 'LOW';
  }
}

// ─── History + Rate-of-rise Prediction ───
function pushHistory(nodeId, data, nowMs) {
  const store = history[nodeId];
  for (const [metric, value] of Object.entries(data)) {
    if (!NODE_CONFIG[nodeId].metrics[metric]) continue;
    const arr = store[metric] || (store[metric] = []);
    arr.push({ t: nowMs, v: value });
    while (arr.length > HISTORY_MAX_POINTS || (arr.length && nowMs - arr[0].t > HISTORY_MAX_AGE_MS)) arr.shift();
  }
}

// Least-squares fit. slope = unit / minute, r2 = fit quality (0..1)
function regress(points) {
  const pts = points.slice(-REGRESSION_POINTS);
  const n = pts.length;
  if (n < REGRESSION_MIN_POINTS) return null;
  const t0 = pts[0].t;
  const xs = pts.map((p) => (p.t - t0) / 60000);
  const ys = pts.map((p) => p.v);
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxx = 0, sxy = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i] - mx) ** 2;
    sxy += (xs[i] - mx) * (ys[i] - my);
    syy += (ys[i] - my) ** 2;
  }
  if (sxx < 1e-9) return null;                       // sab sample same time par
  const slope = sxy / sxx;
  const r2 = syy < 1e-9 ? 0 : (sxy * sxy) / (sxx * syy);
  return { slope, r2, n };
}

function etaTo(metricHist, target) {
  if (!metricHist || !metricHist.length) return { eta: Infinity, r2: 0, slope: 0 };
  const current = metricHist[metricHist.length - 1].v;
  if (current >= target) return { eta: 0, r2: 1, slope: 0 };
  const reg = regress(metricHist);
  if (!reg || reg.slope <= 1e-9) return { eta: Infinity, r2: reg ? reg.r2 : 0, slope: reg ? reg.slope : 0 };
  return { eta: (target - current) / reg.slope, r2: reg.r2, slope: reg.slope };
}

function computePrediction(nodeId) {
  const cfg = NODE_CONFIG[nodeId];
  const none = (why) => ({ available: false, reason: why, metric: cfg.primary.metric, unit: cfg.primary.unit,
    ratePerMin: 0, etaToSevereMin: null, etaToHighMin: null, confidence: 0, rising: false, leadMin: cfg.leadMin, summary: why });

  const rule = cfg.severe;
  const parts = rule.items.map((it) => ({ it, ...etaTo(history[nodeId][it.metric], it.value) }));
  const pending = parts.filter((p) => p.eta > 0);                 // abhi threshold cross nahi hua
  if (!parts.some((p) => (history[nodeId][p.it.metric] || []).length >= REGRESSION_MIN_POINTS)) {
    return none('Trend ke liye abhi aur readings chahiye');
  }
  if (!pending.length) {
    return { ...none('Threshold cross ho chuka'), available: true, etaToSevereMin: 0, confidence: 1, rising: true,
      summary: 'Severe threshold cross ho chuka hai' };
  }

  const etaAll = rule.mode === 'all' ? Math.max(...parts.map((p) => p.eta)) : Math.min(...parts.map((p) => p.eta));
  const lead = pending.find((p) => p.it.metric === cfg.primary.metric) || pending[0];
  const rising = pending.some((p) => p.slope > 1e-9);
  const confidence = Math.min(...pending.filter((p) => Number.isFinite(p.eta)).map((p) => p.r2), 1);

  const primaryHist = history[nodeId][cfg.primary.metric];
  const hiTarget = (THRESHOLDS[nodeId][cfg.primary.metric] || {}).HIGH;
  const etaHigh = hiTarget ? etaTo(primaryHist, hiTarget) : { eta: Infinity };

  const ratePerMin = Math.round(lead.slope * 100) / 100;
  if (!Number.isFinite(etaAll)) {
    return { ...none(rising ? 'Trend kamzor — ETA nikalna possible nahi' : 'Level stable ya gir raha hai'),
      available: true, ratePerMin, rising, confidence: Math.round(confidence * 100) / 100 };
  }
  const etaMin = Math.round(etaAll * 10) / 10;
  return {
    available: true,
    metric: lead.it.metric,
    unit: (cfg.metrics[lead.it.metric] || {}).unit || cfg.primary.unit,
    ratePerMin,
    etaToSevereMin: etaMin,
    etaToHighMin: Number.isFinite(etaHigh.eta) ? Math.round(etaHigh.eta * 10) / 10 : null,
    confidence: Math.round(confidence * 100) / 100,
    rising,
    leadMin: cfg.leadMin,
    summary: `${lead.it.metric} ${ratePerMin > 0 ? '+' : ''}${ratePerMin} ${(cfg.metrics[lead.it.metric] || {}).unit || ''}/min — SEVERE ~${etaMin} min mein`
  };
}

function trendLabel(nodeId) {
  const h = history[nodeId].waterLevel;
  const reg = h && regress(h);
  if (!reg) return '➡️ Stable';
  if (reg.slope >= 2) return '📈 Rising Fast';
  if (reg.slope >= 0.3) return '📈 Rising';
  if (reg.slope <= -0.3) return '📉 Falling';
  return '➡️ Stable';
}

// ─── Alert Decision (edge-triggered, per node) ───
function decideAlert(nodeId, node, prediction, nowMs) {
  const cfg = NODE_CONFIG[nodeId];
  if (!cfg.autopilot) return null;

  let kind = null;
  if (node.risk === 'SEVERE') {
    kind = 'SEVERE';
  } else if (
    prediction.available && prediction.rising &&
    prediction.etaToSevereMin != null && prediction.etaToSevereMin > 0 &&
    prediction.etaToSevereMin <= cfg.leadMin &&
    prediction.confidence >= MIN_R2 &&
    rank(node.risk) >= rank('MODERATE')
  ) {
    kind = 'PREDICTED';
  }
  if (!kind) return null;

  const last = node.lastAlert;
  const inCooldown = nowMs - last.at < ALERT_COOLDOWN_MS;
  const escalation = last.kind === 'PREDICTED' && kind === 'SEVERE';
  if (inCooldown && !escalation) return { kind, suppressed: true, cooldownLeftSec: Math.ceil((ALERT_COOLDOWN_MS - (nowMs - last.at)) / 1000) };
  return { kind, suppressed: false, escalation };
}

function buildMessage(nodeId, node, kind, prediction) {
  const d = node.data;
  const where = String(node.location.label || 'sensor location').split(' — ')[0];   // SMS chhota rakhne ke liye
  if (nodeId === 'jalNode') {
    return kind === 'PREDICTED'
      ? `Water level ${d.waterLevel} cm near ${where}, rising ${prediction.ratePerMin} cm/min. Danger level in about ${Math.max(1, Math.round(prediction.etaToSevereMin))} min. Move to higher ground.`
      : `Flood danger: water level ${d.waterLevel} cm near ${where}. Move to higher ground now.`;
  }
  if (nodeId === 'bhumiNode') {
    return kind === 'PREDICTED'
      ? `Slope tilt ${d.slopeTilt} deg near ${where}, rising ${prediction.ratePerMin} deg/min. Landslide likely in about ${Math.max(1, Math.round(prediction.etaToSevereMin))} min. Stay away from slopes.`
      : `Landslide danger: slope tilt ${d.slopeTilt} deg near ${where}. Stay away from slopes.`;
  }
  if (nodeId === 'vanNode') {
    return kind === 'PREDICTED'
      ? `Forest fire risk rising near ${where}: ${d.temperature} C, CO ${d.co} ppm. Fire conditions in about ${Math.max(1, Math.round(prediction.etaToSevereMin))} min. Avoid the area.`
      : `Forest fire detected near ${where}: ${d.temperature} C, CO ${d.co} ppm. Avoid the area.`;
  }
  return `${node.name} alert near ${where}.`;
}

function fireAutopilot(nodeId, node, decision, prediction, nowMs) {
  const cfg = NODE_CONFIG[nodeId];
  node.lastAlert = { kind: decision.kind, at: nowMs };
  if (decision.kind === 'SEVERE') node.lastSevereAt = new Date(nowMs).toISOString();

  const typeLabel = (decision.kind === 'PREDICTED' ? 'PREDICTED ' : '') + cfg.label;
  const message = buildMessage(nodeId, node, decision.kind, prediction);
  console.log(`🚨 [IoT] ${decision.kind}${decision.escalation ? ' (escalation)' : ''} on ${nodeId} — Autopilot request`);

  if (typeof global.triggerAutopilotResponse === 'function') {
    Promise.resolve(global.triggerAutopilotResponse(
      typeLabel,
      message,
      { lat: node.location.lat, lon: node.location.lng, name: node.location.label },
      { hazard: cfg.type, kind: decision.kind, radiusKm: cfg.radiusKm, nodeId, nodeName: node.name }
    )).catch((e) => console.error('❌ [IoT] Autopilot error:', e && e.message));
  } else {
    console.warn('⚠️ [IoT] global.triggerAutopilotResponse nahi mila — server.js ready nahi?');
  }
  saveToFirestore(nodeId, node, decision.kind, prediction);
}

// ─── Main: Process Incoming Sensor Data ───
// input: normalizeIngest() ka output ya { nodeId, data } (data already valid)
function processSensorData(nodeId, data, opts = {}) {
  try {
    const node = liveSensorData[nodeId];
    if (!node) return { ok: false, error: 'Unknown nodeId: ' + nodeId };

    const nowMs = Date.now();
    const now = new Date(nowMs).toISOString();

    if (opts.location) node.location = { ...node.location, ...opts.location };
    if (opts.deviceId) node.deviceId = opts.deviceId;

    node.data = { ...node.data, ...data };
    node.timestamp = now;
    pushHistory(nodeId, data, nowMs);

    const previousRisk = node.risk;
    node.risk = calculateRisk(nodeId, node.data);
    if (nodeId === 'jalNode') node.data.trend = trendLabel(nodeId);

    const prediction = computePrediction(nodeId);
    const decision = decideAlert(nodeId, node, prediction, nowMs);
    const escalated = rank(node.risk) > rank(previousRisk) && rank(node.risk) >= rank('HIGH');

    console.log(`📡 [IoT] ${node.name} | ${previousRisk} → ${node.risk} | ${JSON.stringify(data)}` +
      (prediction.etaToSevereMin ? ` | ETA ${prediction.etaToSevereMin} min` : ''));

    let alert = { triggered: false };
    if (decision && !decision.suppressed) {
      fireAutopilot(nodeId, node, decision, prediction, nowMs);
      alert = { triggered: true, kind: decision.kind, escalation: !!decision.escalation, radiusKm: NODE_CONFIG[nodeId].radiusKm };
    } else if (decision && decision.suppressed) {
      alert = { triggered: false, kind: decision.kind, cooldownLeftSec: decision.cooldownLeftSec };
    } else if (!NODE_CONFIG[nodeId].autopilot && node.risk === 'SEVERE' && escalated) {
      saveToFirestore(nodeId, node, 'ADVISORY', prediction);     // Vayu: sirf record
      alert = { triggered: false, advisory: true };
    }
    if (!decision && node.risk === 'HIGH' && escalated && NODE_CONFIG[nodeId].autopilot) {
      saveToFirestore(nodeId, node, 'HIGH', prediction);
    }

    return { ok: true, nodeId, risk: node.risk, previousRisk, escalated, data: node.data, prediction, alert, timestamp: now };
  } catch (err) {
    console.error('❌ [IoT] processSensorData error:', err.message);
    return { ok: false, error: err.message };
  }
}

// ─── Firestore Save (Best-Effort, server.js ka global.db) ───
async function saveToFirestore(nodeId, node, kind, prediction) {
  try {
    const db = global.db;
    if (!db) return;
    await db.collection('sensor_alerts').add({
      nodeId, nodeName: node.name, type: node.type, kind,
      risk: node.risk, data: node.data, location: node.location, hardware: node.hardware,
      prediction: prediction ? { etaToSevereMin: prediction.etaToSevereMin, ratePerMin: prediction.ratePerMin, confidence: prediction.confidence } : null,
      createdAt: new Date().toISOString()
    });
    console.log(`💾 [IoT] sensor_alerts saved: ${nodeId} ${kind}`);
  } catch (err) {
    console.warn('⚠️ [IoT] Firestore save failed (non-critical):', err.message);
  }
}

// ─── Live State (for /api/sensors/live) ───
function publicNode(nodeId) {
  const n = liveSensorData[nodeId];
  const cfg = NODE_CONFIG[nodeId];
  const ageMs = n.timestamp ? Date.now() - new Date(n.timestamp).getTime() : null;
  const series = (history[nodeId][cfg.primary.metric] || []).map((p) => [p.t, p.v]);
  return {
    nodeId: n.nodeId, name: n.name, type: n.type,
    location: { ...n.location }, hardware: n.hardware,
    risk: n.risk, data: { ...n.data },
    timestamp: n.timestamp, lastSevereAt: n.lastSevereAt,
    lastAlert: { ...n.lastAlert },
    online: ageMs != null && ageMs <= ONLINE_WINDOW_MS,
    ageSec: ageMs != null ? Math.round(ageMs / 1000) : null,
    autopilot: cfg.autopilot,
    alertRadiusKm: cfg.radiusKm,
    primaryMetric: cfg.primary,
    prediction: computePrediction(nodeId),
    series
  };
}

function getLiveSensors() {
  const sensors = {};
  Object.keys(NODE_CONFIG).forEach((id) => { sensors[id] = publicNode(id); });
  return { ok: true, sensors, thresholds: THRESHOLDS, serverTime: new Date().toISOString() };
}

function getNode(nodeId) {
  return liveSensorData[nodeId] || null;
}

// Sirf alert throttle reset (autopilot reset ke saath)
function resetAlertState() {
  Object.values(liveSensorData).forEach((n) => { n.lastAlert = { kind: null, at: 0 }; n.lastSevereAt = null; });
}

// Poora reset (dev)
function resetAllSensors() {
  initStore();
  console.log('🔄 [IoT] All sensors reset to default');
  return { ok: true, message: 'All sensors reset' };
}

module.exports = {
  normalizeIngest,
  processSensorData,
  getLiveSensors,
  getNode,
  resetAlertState,
  resetAllSensors,
  THRESHOLDS,
  NODE_CONFIG,
  liveSensorData
};
