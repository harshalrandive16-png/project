/* ================================================================
   Open-Meteo weather fetch (FREE, no key)
   ================================================================ */
const axios = require('axios');

async function fetchWeather(lat, lon) {
  try {
    const url = 'https://api.open-meteo.com/v1/forecast';
    const { data } = await axios.get(url, {
      params: {
        latitude: lat,
        longitude: lon,
        current: 'temperature_2m,relative_humidity_2m,precipitation,rain,wind_speed_10m,wind_gusts_10m',
        daily: 'precipitation_sum,precipitation_probability_max',
        timezone: 'Asia/Kolkata',
        forecast_days: 3
      },
      timeout: 12000
    });

    const cur = data.current || {};
    const daily = data.daily || {};

    return {
      temperature: cur.temperature_2m ?? null,
      humidity: cur.relative_humidity_2m ?? null,
      precipitation: cur.precipitation ?? cur.rain ?? 0,
      windSpeed: cur.wind_speed_10m ?? null,
      windGusts: cur.wind_gusts_10m ?? null,
      next3DaysRain: daily.precipitation_sum || [],
      rainProbabilityMax: daily.precipitation_probability_max || [],
      time: cur.time || null,
      source: 'Open-Meteo'
    };
  } catch (err) {
    console.error('❌ Open-Meteo error:', err.message);
    return {
      temperature: null,
      humidity: null,
      precipitation: 0,
      windSpeed: null,
      windGusts: null,
      source: 'fallback',
      error: err.message
    };
  }
}

module.exports = { fetchWeather };