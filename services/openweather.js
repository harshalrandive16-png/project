/**
 * BhoomiSuraksha — OpenWeatherMap Service
 * Free tier: current weather + 5-day forecast
 * Key via env only — never hardcode in frontend
 */

const axios = require('axios');

const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY || '';
const BASE = 'https://api.openweathermap.org/data/2.5';

function isConfigured() {
  return Boolean(OPENWEATHER_API_KEY && OPENWEATHER_API_KEY.length > 10);
}

/**
 * Current weather by lat/lon
 */
async function getCurrentWeather(lat, lon) {
  if (!isConfigured()) {
    return {
      ok: false,
      engine: 'openweather-missing-key',
      error: 'OPENWEATHER_API_KEY not set'
    };
  }

  const start = Date.now();
  try {
    const { data } = await axios.get(`${BASE}/weather`, {
      params: {
        lat,
        lon,
        appid: OPENWEATHER_API_KEY,
        units: 'metric',
        lang: 'en'
      },
      timeout: 8000
    });

    const ms = Date.now() - start;
    return {
      ok: true,
      engine: 'openweather',
      latencyMs: ms,
      location: data.name || 'Unknown',
      country: data.sys?.country || 'IN',
      coords: { lat: data.coord?.lat, lon: data.coord?.lon },
      temp: data.main?.temp,
      feelsLike: data.main?.feels_like,
      humidity: data.main?.humidity,
      pressure: data.main?.pressure,
      windSpeed: data.wind?.speed ? Number((data.wind.speed * 3.6).toFixed(1)) : 0, // m/s → km/h
      windDeg: data.wind?.deg,
      weatherMain: data.weather?.[0]?.main || '—',
      weatherDesc: data.weather?.[0]?.description || '—',
      icon: data.weather?.[0]?.icon || null,
      clouds: data.clouds?.all,
      visibility: data.visibility,
      rain1h: data.rain?.['1h'] || 0,
      rain3h: data.rain?.['3h'] || 0,
      snow1h: data.snow?.['1h'] || 0,
      sunrise: data.sys?.sunrise ? new Date(data.sys.sunrise * 1000).toISOString() : null,
      sunset: data.sys?.sunset ? new Date(data.sys.sunset * 1000).toISOString() : null,
      raw: data
    };
  } catch (err) {
    const ms = Date.now() - start;
    console.error('❌ OpenWeather error:', err.response?.data || err.message);
    return {
      ok: false,
      engine: 'openweather',
      latencyMs: ms,
      error: err.response?.data?.message || err.message
    };
  }
}

/**
 * 5-day / 3-hour forecast
 */
async function getForecast(lat, lon) {
  if (!isConfigured()) {
    return { ok: false, engine: 'openweather-missing-key', error: 'OPENWEATHER_API_KEY not set' };
  }

  const start = Date.now();
  try {
    const { data } = await axios.get(`${BASE}/forecast`, {
      params: {
        lat,
        lon,
        appid: OPENWEATHER_API_KEY,
        units: 'metric',
        lang: 'en'
      },
      timeout: 10000
    });

    const list = (data.list || []).slice(0, 8).map((item) => ({
      time: item.dt_txt,
      temp: item.main?.temp,
      humidity: item.main?.humidity,
      weather: item.weather?.[0]?.main,
      desc: item.weather?.[0]?.description,
      rain3h: item.rain?.['3h'] || 0,
      windKmh: item.wind?.speed ? Number((item.wind.speed * 3.6).toFixed(1)) : 0
    }));

    return {
      ok: true,
      engine: 'openweather-forecast',
      latencyMs: Date.now() - start,
      city: data.city?.name,
      list
    };
  } catch (err) {
    return {
      ok: false,
      engine: 'openweather-forecast',
      latencyMs: Date.now() - start,
      error: err.response?.data?.message || err.message
    };
  }
}

/**
 * Health ping for admin monitor
 */
async function pingOpenWeather() {
  if (!isConfigured()) {
    return { name: 'OpenWeather', ok: false, status: 'not set', ms: null };
  }
  // Nagpur demo coords
  const start = Date.now();
  try {
    await axios.get(`${BASE}/weather`, {
      params: { lat: 21.1524, lon: 79.0805, appid: OPENWEATHER_API_KEY, units: 'metric' },
      timeout: 6000
    });
    return { name: 'OpenWeather', ok: true, status: 'ok', ms: Date.now() - start };
  } catch (err) {
    return {
      name: 'OpenWeather',
      ok: false,
      status: err.response?.status === 401 ? 'invalid key' : 'error',
      ms: Date.now() - start,
      error: err.message
    };
  }
}

module.exports = {
  isConfigured,
  getCurrentWeather,
  getForecast,
  pingOpenWeather
};

// Add inside existing openmeteo.js
async function pingOpenMeteo() {
  const start = Date.now();
  try {
    await axios.get('https://api.open-meteo.com/v1/forecast', {
      params: {
        latitude: 21.1524,
        longitude: 79.0805,
        current_weather: true
      },
      timeout: 6000
    });
    return { name: 'Open-Meteo', ok: true, status: 'ok', ms: Date.now() - start };
  } catch (err) {
    return { name: 'Open-Meteo', ok: false, status: 'error', ms: Date.now() - start, error: err.message };
  }
}

module.exports.pingOpenMeteo = pingOpenMeteo;