// ═══════════════════════════════════════════════════════════
// 🏔️ BhoomiSuraksha — services/nearbyRisk.js   (STEP 2)
// GET /api/nearby-risk?lat=..&lon=..&radius=15
//
// Ek hi endpoint me radius ke andar ke saare hazards:
//   • USGS earthquakes + GDACS cyclone/flood (realtimeDisasters)
//   • Monitored zones (liveData INDIA_ZONES + live weather score)
//   • IoT nodes (iotService live readings — stale readings ignore)
//   • Local forecast (Open-Meteo + rule engine)
//
// Mount (server.js me ek line):  app.use('/api', require('./services/nearbyRisk'));
// Koi fake/demo data nahi: feed fail ho to `forecast.available=false`.
// ═══════════════════════════════════════════════════════════

const express = require('express');
const rateLimit = require('express-rate-limit');

const { haversineDistance } = require('./haversine');
const { fetchWeatherData } = require('./openmeteo');
const { fallbackRisk } = require('./riskFallback');
const { getAllRealtimeDisasters } = require('./realtimeDisasters');
const { INDIA_ZONES, getLiveZoneRisks } = require('./liveData');
const iotService = require('./iotService');

const router = express.Router();

const DEFAULT_RADIUS_KM = 15;
const MIN_RADIUS_KM = 1;
const MAX_RADIUS_KM = 50;
const SENSOR_FRESH_MS = 10 * 60 * 1000; // 10 min se purani reading = stale

const LEVELS = ['LOW', 'MODERATE', 'HIGH', 'SEVERE'];
const lvlIdx = (l) => Math.max(0, LEVELS.indexOf(String(l || 'LOW').toUpperCase()));
const lvlName = (i) => LEVELS[Math.max(0, Math.min(LEVELS.length - 1, i))];
const norm = (l) => lvlName(lvlIdx(l));

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Too many requests, thoda ruko' }
});

// ─── tiny TTL cache + in-flight dedupe ───
const cache = new Map();
function memo(key, ttlMs, fn) {
  const hit = cache.get(key);
  const now = Date.now();
  if (hit && now - hit.at < ttlMs) return hit.p;
  const p = Promise.resolve().then(fn).catch((e) => {
    cache.delete(key);
    throw e;
  });
  cache.set(key, { at: now, p });
  if (cache.size > 300) {
    for (const [k, v] of cache) if (now - v.at > ttlMs * 3) cache.delete(k);
  }
  return p;
}

// ─── how far a hazard "matters" (km) ───
function influenceKm(h, radius) {
  const t = String(h.disasterType || h.type || '').toLowerCase();
  if (t === 'earthquake') {
    const m = Number(h.magnitude) || 0;
    const felt = m >= 6 ? 300 : m >= 5 ? 150 : m >= 4 ? 60 : 0;
    return Math.max(radius, felt);
  }
  if (t === 'cyclone') return Math.max(radius, 300);
  if (t === 'flood') return Math.max(radius, 50);
  return radius;
}

function pickType(nodeType) {
  const t = String(nodeType || '').toLowerCase();
  if (t.includes('flood')) return 'Flood';
  if (t.includes('landslide')) return 'Landslide';
  if (t.includes('fire')) return 'Forest Fire';
  return nodeType || 'Hazard';
}

// ─── 1. Live disasters (USGS + GDACS) ───
async function collectFeedHazards(lat, lon, radius) {
  const list = await memo('feed', 3 * 60 * 1000, getAllRealtimeDisasters);
  const out = [];
  for (const d of list || []) {
    if (typeof d.lat !== 'number' || typeof d.lon !== 'number') continue;
    const dist = haversineDistance(lat, lon, d.lat, d.lon);
    const reach = influenceKm(d, radius);
    if (dist > reach) continue;
    out.push({
      id: String(d.id),
      type: d.disasterType,
      level: norm(d.riskLevel),
      score: d.score ?? null,
      title: d.title,
      location: d.location,
      distanceKm: dist,
      scope: dist <= radius ? 'in-radius' : 'regional',
      source: d.source,
      lat: d.lat,
      lon: d.lon,
      time: d.timestamp,
      magnitude: d.magnitude ?? undefined
    });
  }
  return out;
}

// ─── 2. Monitored zones ───
async function collectZoneHazards(lat, lon, radius) {
  const near = INDIA_ZONES
    .map((z) => ({ z, dist: haversineDistance(lat, lon, z.lat, z.lon) }))
    .sort((a, b) => a.dist - b.dist);

  const nearestZone = near[0]
    ? { id: near[0].z.id, name: near[0].z.name, state: near[0].z.state, type: near[0].z.type, distanceKm: near[0].dist }
    : null;

  const inside = near.filter((n) => n.dist <= radius);
  if (!inside.length) return { hazards: [], nearestZone };

  const live = await memo('zones', 10 * 60 * 1000, getLiveZoneRisks);
  const byId = Object.fromEntries((live || []).map((z) => [z.id, z]));
  const hazards = [];
  for (const { z, dist } of inside) {
    const lz = byId[z.id];
    // fallback score (weather fetch fail) ko hazard mat banao — fake data nahi
    if (!lz || lz.engine === 'fallback') continue;
    const level = norm(lz.level);
    if (level === 'LOW') continue;
    hazards.push({
      id: `zone_${z.id}`,
      type: z.type,
      level,
      score: lz.score,
      title: `${z.name} — ${z.type} risk`,
      location: `${z.name}, ${z.state}`,
      distanceKm: dist,
      scope: 'in-radius',
      source: 'Monitored zone (Open-Meteo live)',
      lat: z.lat,
      lon: z.lon,
      time: lz.updatedAt
    });
  }
  return { hazards, nearestZone };
}

// ─── 3. IoT nodes ───
function collectSensors(lat, lon, radius) {
  let raw = null;
  try {
    raw = iotService.getLiveSensors();
  } catch (e) {
    return { sensors: [], hazards: [] };
  }
  const nodes = Object.values((raw && raw.sensors) || {});
  const sensors = [];
  const hazards = [];
  const now = Date.now();

  for (const n of nodes) {
    const loc = n.location || {};
    const nLat = Number(loc.lat);
    const nLon = Number(loc.lng ?? loc.lon);
    if (!Number.isFinite(nLat) || !Number.isFinite(nLon)) continue;

    const dist = haversineDistance(lat, lon, nLat, nLon);
    if (dist > radius) continue;

    const ts = n.timestamp ? Date.parse(n.timestamp) : NaN;
    const hasReading = Number.isFinite(ts);
    const fresh = hasReading && now - ts <= SENSOR_FRESH_MS;
    const level = norm(n.risk);

    sensors.push({
      nodeId: n.nodeId,
      name: n.name,
      type: pickType(n.type),
      label: loc.label || null,
      lat: nLat,
      lon: nLon,
      distanceKm: dist,
      level,
      data: n.data || {},
      prediction: n.prediction || null, // Step 1 ki rate-of-rise prediction (agar hai)
      lastReading: hasReading ? new Date(ts).toISOString() : null,
      status: !hasReading ? 'no-data' : fresh ? 'live' : 'stale'
    });

    if (fresh && lvlIdx(level) > 0) {
      hazards.push({
        id: `iot_${n.nodeId}`,
        type: pickType(n.type),
        level,
        score: null,
        title: `${n.name || n.nodeId} sensor — ${level}`,
        location: loc.label || 'IoT node',
        distanceKm: dist,
        scope: 'in-radius',
        source: 'IoT sensor (live)',
        lat: nLat,
        lon: nLon,
        time: new Date(ts).toISOString(),
        prediction: n.prediction || null
      });
    }
  }
  return { sensors, hazards };
}

// ─── 4. Local forecast ───
async function collectForecast(lat, lon, location) {
  const key = `wx:${lat.toFixed(2)},${lon.toFixed(2)}`;
  const w = await memo(key, 10 * 60 * 1000, () => fetchWeatherData(lat, lon));
  const available = !!w && !/^fallback/i.test(String(w.source || ''));

  if (!available) {
    return { forecast: { available: false, reason: 'Weather feed abhi available nahi' }, hazard: null };
  }

  const forecast = {
    available: true,
    temperatureC: w.temperature,
    humidity: w.humidity,
    rain24hMm: w.totalRainfall24h,
    maxHourlyRainMm: w.maxHourlyRainfall,
    rainChanceMaxPct: w.maxPrecipitationProbability,
    windKmh: w.windSpeed,
    gustKmh: w.maxWindGust,
    soilMoisture: w.avgSoilMoisture,
    cloudburstRisk: !!w.cloudBurstRisk,
    source: w.source
  };

  const a = fallbackRisk({
    weather: { temp: w.temperature, rain: w.totalRainfall24h, windSpeed: w.windSpeed, humidity: w.humidity },
    disasterType: 'multi',
    location
  });

  let hazard = null;
  const level = norm(a.riskLevel);
  if (lvlIdx(level) > 0) {
    hazard = {
      id: 'forecast_local',
      type: a.primaryDisaster,
      level,
      score: a.score,
      title: 'Next 24h weather forecast',
      location: 'Your location',
      distanceKm: 0,
      scope: 'in-radius',
      source: 'Open-Meteo forecast + rules',
      time: w.fetchedAt,
      detail: a.explanation
    };
  }
  forecast.assessment = {
    level, score: a.score, primaryDisaster: a.primaryDisaster,
    explanation: a.explanation, explanationHindi: a.explanationHindi,
    recommendedAction: a.recommendedAction || null
  };
  return { forecast, hazard };
}

// ─── overall level ───
function effectiveIdx(h) {
  const i = lvlIdx(h.level);
  return h.scope === 'in-radius' ? i : Math.max(0, i - 1); // regional hazard ek step kam
}

function buildMessages(overall, top, radius, forecast) {
  if (!top) {
    const wxOk = forecast && forecast.available;
    if (!wxOk) {
      return {
        en: `No active hazards in live feeds within ${radius} km, but the weather forecast is unavailable right now, so this check is partial.`,
        hi: `${radius} किमी के दायरे में लाइव फ़ीड में कोई सक्रिय खतरा नहीं, पर मौसम पूर्वानुमान अभी उपलब्ध नहीं है, इसलिए यह जाँच अधूरी है।`,
        extra: ''
      };
    }
    return {
      en: `No active hazards detected within ${radius} km right now. Stay alert and keep checking for updates.`,
      hi: `अभी ${radius} किमी के दायरे में कोई सक्रिय खतरा नहीं मिला। सतर्क रहें और अपडेट देखते रहें।`,
      extra: ` Next 24h rain: ${forecast.rain24hMm} mm.`
    };
  }
  const d = top.distanceKm < 1 ? 'aapke location par' : `${top.distanceKm.toFixed(1)} km door`;
  return {
    en: `${overall} ${top.type} risk — ${top.title}, ${d}. Follow official instructions. Helpline 112.`,
    hi: `${top.type} का ${overall} खतरा — ${top.title}, ${top.distanceKm < 1 ? 'आपके स्थान पर' : top.distanceKm.toFixed(1) + ' किमी दूर'}। सरकारी निर्देश मानें। हेल्पलाइन 112।`,
    extra: ''
  };
}

router.get('/nearby-risk', limiter, async (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lon = parseFloat(req.query.lon);
  let radius = parseFloat(req.query.radius);
  if (!Number.isFinite(radius)) radius = DEFAULT_RADIUS_KM;
  radius = Math.max(MIN_RADIUS_KM, Math.min(MAX_RADIUS_KM, radius));

  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return res.status(400).json({ ok: false, error: 'Valid lat/lon required' });
  }

  const locLabel = `${lat.toFixed(3)}°N, ${lon.toFixed(3)}°E`;

  try {
    // sab sources parallel; ek fail ho to baaki chalte rahein
    const [feedR, zoneR, fcR] = await Promise.allSettled([
      collectFeedHazards(lat, lon, radius),
      collectZoneHazards(lat, lon, radius),
      collectForecast(lat, lon, locLabel)
    ]);
    const iot = collectSensors(lat, lon, radius);

    const feed = feedR.status === 'fulfilled' ? feedR.value : [];
    const zones = zoneR.status === 'fulfilled' ? zoneR.value : { hazards: [], nearestZone: null };
    const fc = fcR.status === 'fulfilled' ? fcR.value : { forecast: { available: false, reason: 'Forecast error' }, hazard: null };

    const hazards = [...feed, ...zones.hazards, ...iot.hazards, ...(fc.hazard ? [fc.hazard] : [])]
      .sort((a, b) => effectiveIdx(b) - effectiveIdx(a) || a.distanceKm - b.distanceKm);

    const top = hazards[0] || null;
    const overallIdx = top ? effectiveIdx(top) : 0;
    const overall = lvlName(overallIdx);

    // score: top hazard ka score, warna level se approx
    const levelScore = [15, 40, 65, 90][overallIdx];
    const score = top && Number.isFinite(top.score) && effectiveIdx(top) === lvlIdx(top.level)
      ? Math.round(top.score)
      : levelScore;

    const msg = buildMessages(overall, top, radius, fc.forecast);

    res.json({
      ok: true,
      success: true,
      center: { lat, lon },
      radiusKm: radius,
      generatedAt: new Date().toISOString(),
      overall: { level: overall, score, primaryHazard: top ? top.type : null },
      message: { en: msg.en + msg.extra, hi: msg.hi },
      hazards: hazards.map((h) => ({ ...h, distanceKm: Math.round(h.distanceKm * 10) / 10 })),
      counts: {
        total: hazards.length,
        inRadius: hazards.filter((h) => h.scope === 'in-radius').length,
        regional: hazards.filter((h) => h.scope === 'regional').length
      },
      sensors: iot.sensors.map((s) => ({ ...s, distanceKm: Math.round(s.distanceKm * 10) / 10 })),
      nearestZone: zones.nearestZone
        ? { ...zones.nearestZone, distanceKm: Math.round(zones.nearestZone.distanceKm) }
        : null,
      forecast: fc.forecast,
      dataQuality: { forecast: !!fc.forecast.available, partial: !fc.forecast.available || feedR.status !== 'fulfilled' || zoneR.status !== 'fulfilled' }
    });
  } catch (e) {
    console.error('❌ nearby-risk failed:', e.message);
    res.status(500).json({ ok: false, error: 'Nearby risk unavailable' });
  }
});

module.exports = router;
