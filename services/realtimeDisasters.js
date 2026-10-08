// ═══════════════════════════════════════════════════════════
// 🏔️ BHOOMISURAKSHA — services/realtimeDisasters.js
// Aggregates REAL-TIME Live Disasters (USGS + GDACS + Open-Meteo)
// NO PAID KEYS REQUIRED FOR SEISMIC / CYCLONE / FLOOD FEEDS
// ═══════════════════════════════════════════════════════════

const axios = require('axios');

// India Bounding Box Coords (Approx)
const INDIA_BOUNDS = {
  minLat: 6.0,
  maxLat: 37.0,
  minLon: 68.0,
  maxLon: 98.0
};

/**
 * 1. REAL-TIME EARTHQUAKES (USGS Live Feed - Free, No Key)
 */
async function getLiveEarthquakes() {
  try {
    const url = 'https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&starttime=' +
      new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString() + // Last 48 Hours
      `&minlatitude=${INDIA_BOUNDS.minLat}&maxlatitude=${INDIA_BOUNDS.maxLat}` +
      `&minlongitude=${INDIA_BOUNDS.minLon}&maxlongitude=${INDIA_BOUNDS.maxLon}` +
      '&minmagnitude=2.5';

    const { data } = await axios.get(url, { timeout: 8000 });
    const features = data.features || [];

    return features.map(f => {
      const p = f.properties || {};
      const coords = f.geometry?.coordinates || [0, 0, 0];
      const mag = p.mag || 3.0;

      let level = 'LOW';
      let score = Math.min(99, Math.round(mag * 18));
      if (mag >= 6.0) level = 'SEVERE';
      else if (mag >= 4.5) level = 'HIGH';
      else if (mag >= 3.5) level = 'MODERATE';

      return {
        id: f.id || `eq_${Date.now()}`,
        disasterType: 'Earthquake',
        title: p.title || `M ${mag} Earthquake`,
        location: p.place || 'Indian Subcontinent',
        lat: coords[1],
        lon: coords[0],
        depthKm: coords[2],
        magnitude: mag,
        riskLevel: level,
        score: score,
        timestamp: p.time ? new Date(p.time).toISOString() : new Date().toISOString(),
        source: 'USGS Real-Time'
      };
    });
  } catch (err) {
    console.error('⚠️ USGS Earthquake Fetch Failed:', err.message);
    return [];
  }
}

/**
 * 2. REAL-TIME CYCLONES & FLOODS (GDACS UN/EU Feed - Free, No Key)
 */
async function getLiveGDACSAlerts() {
  try {
    // GDACS RSS/JSON Feed for Global Active Disasters
    const url = 'https://www.gdacs.org/gdacsapi/api/events/geteventlist/M?eventlist=TC,FL,DR&alertlevel=Green;Orange;Red';
    const { data } = await axios.get(url, { timeout: 8000 });
    const features = data.features || [];

    const indianDisasters = [];

    features.forEach(f => {
      const p = f.properties || {};
      const coords = f.geometry?.coordinates || [0, 0];
      const lon = coords[0];
      const lat = coords[1];

      // Filter disasters in or near India region
      if (lat >= INDIA_BOUNDS.minLat - 5 && lat <= INDIA_BOUNDS.maxLat + 5 &&
          lon >= INDIA_BOUNDS.minLon - 5 && lon <= INDIA_BOUNDS.maxLon + 5) {

        let alertLevel = (p.alertlevel || 'Green').toUpperCase();
        let riskLevel = 'MODERATE';
        let score = 50;

        if (alertLevel === 'RED') { riskLevel = 'SEVERE'; score = 90; }
        else if (alertLevel === 'ORANGE') { riskLevel = 'HIGH'; score = 75; }

        let type = 'Disaster';
        if (p.eventtype === 'TC') type = 'Cyclone';
        else if (p.eventtype === 'FL') type = 'Flood';

        indianDisasters.push({
          id: p.eventid || `gdacs_${Date.now()}`,
          disasterType: type,
          title: p.name || p.eventname || `${type} Alert`,
          location: `${p.country || 'India/Bay of Bengal'}`,
          lat: lat,
          lon: lon,
          riskLevel: riskLevel,
          score: score,
          timestamp: p.todate || p.fromdate || new Date().toISOString(),
          source: 'GDACS (UN/EU Live)'
        });
      }
    });

    return indianDisasters;
  } catch (err) {
    console.error('⚠️ GDACS Live Alert Fetch Failed:', err.message);
    return [];
  }
}

/**
 * 3. AGGREGATED REAL-TIME DISASTER STREAM
 */
async function getAllRealtimeDisasters() {
  console.log('📡 Fetching Live Real-Time Disasters (USGS + GDACS)...');
  const [quakes, gdacs] = await Promise.all([
    getLiveEarthquakes(),
    getLiveGDACSAlerts()
  ]);

  const combined = [...quakes, ...gdacs];
  combined.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  return combined;
}

module.exports = {
  getLiveEarthquakes,
  getLiveGDACSAlerts,
  getAllRealtimeDisasters
};