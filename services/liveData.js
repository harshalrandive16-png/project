// ═══════════════════════════════════════════════════════════
// 🛰️ BhoomiSuraksha — services/liveData.js
// Live multi-zone risk + highway status engine
// ═══════════════════════════════════════════════════════════

const axios = require('axios');

// Baseline zones (coords fixed, scores LIVE calculate honge)
const INDIA_ZONES = [
  { id: 'koshi', name: 'Koshi Basin', state: 'Bihar', type: 'Flood', lat: 26.1197, lon: 87.2696 },
  { id: 'wayanad', name: 'Wayanad Belt', state: 'Kerala', type: 'Landslide', lat: 11.6854, lon: 76.1320 },
  { id: 'chennai', name: 'Chennai Coast', state: 'Tamil Nadu', type: 'Cyclone', lat: 13.0827, lon: 80.2707 },
  { id: 'puri', name: 'Puri Coast', state: 'Odisha', type: 'Cyclone', lat: 19.8135, lon: 85.8312 },
  { id: 'joshimath', name: 'Joshimath', state: 'Uttarakhand', type: 'Landslide', lat: 30.5548, lon: 79.5644 },
  { id: 'guwahati', name: 'Guwahati', state: 'Assam', type: 'Flood', lat: 26.1445, lon: 91.7362 },
  { id: 'mumbai', name: 'Mumbai Coastal', state: 'Maharashtra', type: 'Flood', lat: 19.0760, lon: 72.8777 },
  { id: 'shimla', name: 'Shimla Hills', state: 'Himachal', type: 'Landslide', lat: 31.1048, lon: 77.1734 },
  { id: 'darjeeling', name: 'Darjeeling', state: 'West Bengal', type: 'Landslide', lat: 27.0360, lon: 88.2627 },
  { id: 'kutch', name: 'Kutch', state: 'Gujarat', type: 'Earthquake', lat: 23.7337, lon: 69.8597 }
];

const HIGHWAYS = [
  { id: 'nh66', name: 'NH-66 (Kochi-Mangalore)', nearZone: 'wayanad', baseIssue: 'Landslide risk on ghat section' },
  { id: 'nh10', name: 'NH-10 (Siliguri-Gangtok)', nearZone: 'darjeeling', baseIssue: 'Hill slope / debris risk' },
  { id: 'nh31', name: 'NH-31 (Guwahati-Barpeta)', nearZone: 'guwahati', baseIssue: 'Flood waterlogging risk' },
  { id: 'nh7', name: 'NH-7 (Chennai-Salem)', nearZone: 'chennai', baseIssue: 'Cyclone / wind debris risk' },
  { id: 'nh44', name: 'NH-44 (Delhi-Kanyakumari)', nearZone: 'chennai', baseIssue: 'Long-haul corridor advisory' },
  { id: 'nh48', name: 'NH-48 (Mumbai-Ahmedabad)', nearZone: 'mumbai', baseIssue: 'Coastal rain / waterlogging' }
];

function levelFromScore(score) {
  if (score >= 80) return 'SEVERE';
  if (score >= 65) return 'HIGH';
  if (score >= 45) return 'MODERATE';
  return 'LOW';
}

function scoreFromWeather(weather, zoneType) {
  // Open-Meteo style fields
  const rain = Number(weather.rain24h || weather.precipitation || 0);
  const wind = Number(weather.windKmh || weather.windspeed || 0);
  const humidity = Number(weather.humidity || 0);
  const temp = Number(weather.temp || weather.temperature || 28);

  let score = 20;

  // Rain pressure
  if (rain >= 150) score += 45;
  else if (rain >= 80) score += 30;
  else if (rain >= 40) score += 18;
  else if (rain >= 15) score += 8;

  // Wind pressure (cyclone/coast)
  if (wind >= 80) score += 35;
  else if (wind >= 50) score += 22;
  else if (wind >= 30) score += 10;

  // Humidity soak
  if (humidity >= 90) score += 10;
  else if (humidity >= 75) score += 5;

  // Type-specific boost
  const t = (zoneType || '').toLowerCase();
  if (t.includes('flood') && rain >= 40) score += 12;
  if (t.includes('landslide') && rain >= 40 && humidity >= 70) score += 15;
  if (t.includes('cyclone') && wind >= 40) score += 15;
  if (t.includes('earthquake')) score += 5; // baseline seismic watch

  // Extreme heat anomaly mild bump
  if (temp >= 42) score += 5;

  return Math.max(5, Math.min(99, Math.round(score)));
}

async function fetchOpenMeteo(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m&daily=precipitation_sum&timezone=Asia%2FKolkata&forecast_days=1`;
  const { data } = await axios.get(url, { timeout: 12000 });

  const current = data.current || {};
  const daily = data.daily || {};

  return {
    temp: current.temperature_2m ?? null,
    humidity: current.relative_humidity_2m ?? null,
    rain1h: current.precipitation ?? 0,
    rain24h: Array.isArray(daily.precipitation_sum) ? (daily.precipitation_sum[0] || 0) : 0,
    windKmh: current.wind_speed_10m ?? 0,
    source: 'Open-Meteo',
    fetchedAt: new Date().toISOString()
  };
}

/**
 * LIVE National Risk Ranking
 */
async function getLiveZoneRisks() {
  const results = [];

  // Parallel fetch (fast)
  await Promise.all(
    INDIA_ZONES.map(async (z) => {
      try {
        const weather = await fetchOpenMeteo(z.lat, z.lon);
        const score = scoreFromWeather(weather, z.type);
        const level = levelFromScore(score);

        results.push({
          ...z,
          score,
          level,
          weather,
          primaryDisaster: z.type,
          updatedAt: new Date().toISOString(),
          engine: 'open-meteo-live'
        });
      } catch (err) {
        // Fail-safe fallback so dashboard never breaks
        results.push({
          ...z,
          score: 55,
          level: 'MODERATE',
          weather: null,
          primaryDisaster: z.type,
          updatedAt: new Date().toISOString(),
          engine: 'fallback',
          error: 'weather-fetch-failed'
        });
      }
    })
  );

  // High → low
  results.sort((a, b) => b.score - a.score);
  return results;
}

/**
 * LIVE Highway Status (derived from nearest zone live risk)
 */
async function getLiveHighwayStatus(zoneRisks = null) {
  const zones = zoneRisks || await getLiveZoneRisks();
  const byId = Object.fromEntries(zones.map((z) => [z.id, z]));

  return HIGHWAYS.map((h) => {
    const z = byId[h.nearZone];
    const score = z?.score ?? 50;
    const level = z?.level || 'MODERATE';

    let status = 'OPEN';
    let desc = `${h.baseIssue} · normal traffic`;

    if (score >= 80) {
      status = 'BLOCKED';
      desc = `${h.baseIssue} · severe weather impact near ${z?.name || h.nearZone}`;
    } else if (score >= 65) {
      status = 'PARTIAL';
      desc = `${h.baseIssue} · single lane / slow traffic expected`;
    } else if (score >= 45) {
      status = 'PARTIAL';
      desc = `${h.baseIssue} · advisory · drive with caution`;
    }

    return {
      ...h,
      status,
      desc,
      score,
      level,
      nearZoneName: z?.name || h.nearZone,
      weather: z?.weather || null,
      updatedAt: new Date().toISOString(),
      engine: 'zone-risk-derived'
    };
  });
}

/**
 * Optional: USGS earthquakes near India box (last 24h)
 */
async function getIndiaEarthquakes() {
  try {
    // Rough India bounding box
    const url = 'https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&starttime=' +
      new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() +
      '&minlatitude=6&maxlatitude=37&minlongitude=68&maxlongitude=98&minmagnitude=3';

    const { data } = await axios.get(url, { timeout: 12000 });
    const features = data.features || [];

    return features.slice(0, 10).map((f) => {
      const p = f.properties || {};
      const c = (f.geometry && f.geometry.coordinates) || [];
      return {
        title: p.title || 'Earthquake',
        mag: p.mag,
        place: p.place,
        time: p.time ? new Date(p.time).toISOString() : null,
        lat: c[1],
        lon: c[0],
        url: p.url,
        source: 'USGS'
      };
    });
  } catch (e) {
    return [];
  }
}

module.exports = {
  INDIA_ZONES,
  HIGHWAYS,
  getLiveZoneRisks,
  getLiveHighwayStatus,
  getIndiaEarthquakes,
  levelFromScore
};