/**
 * BhoomiSuraksha — IMD (India Meteorological Department) best-effort client
 * Official portal: https://mausam.imd.gov.in / https://city.imd.gov.in
 * Note: Many IMD APIs need registration / change often — always fallback safe
 */

const axios = require('axios');

const IMD_ENDPOINTS = {
  // Common public-ish endpoints (may change — health will show status)
  cityWeather: 'https://city.imd.gov.in/api/cityweather.php',
  // Rainfall / warnings often on mausam — structure varies
  warnings: 'https://mausam.imd.gov.in/backend/public/in/warning_bulletin',
};

async function pingIMD() {
  const start = Date.now();
  try {
    // Lightweight HEAD/GET with short timeout
    const res = await axios.get('https://mausam.imd.gov.in/', {
      timeout: 7000,
      maxRedirects: 3,
      validateStatus: (s) => s < 500
    });
    return {
      name: 'IMD API',
      ok: res.status < 400,
      status: res.status < 400 ? 'reachable' : 'degraded',
      ms: Date.now() - start
    };
  } catch (err) {
    return {
      name: 'IMD API',
      ok: false,
      status: 'pending/error',
      ms: Date.now() - start,
      error: err.message
    };
  }
}

/**
 * Try city weather by name (best effort)
 * IMD city APIs often need station codes — this is exploratory
 */
async function getIMDCityWeather(city = 'Nagpur') {
  try {
    const { data } = await axios.get(IMD_ENDPOINTS.cityWeather, {
      params: { city },
      timeout: 8000
    });
    return { ok: true, engine: 'imd-city', city, data };
  } catch (err) {
    return {
      ok: false,
      engine: 'imd-city',
      error: err.message,
      note: 'IMD endpoints often require station ID / auth. Using OpenWeather + Open-Meteo fallback.'
    };
  }
}

/**
 * CWC flood — placeholder until official API key/partnership
 */
async function pingCWC() {
  return {
    name: 'CWC Flood',
    ok: false,
    status: 'not set',
    ms: null,
    note: 'Needs CWC/India-WRIS partnership or scraped feed with permission'
  };
}

module.exports = {
  pingIMD,
  getIMDCityWeather,
  pingCWC,
  IMD_ENDPOINTS
};