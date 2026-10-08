/**
 * BhoomiSuraksha - Realtime Feed Risk Helper
 * File: services/realtimeFeed.js
 *
 * Purpose:
 * - Process realtime weather/feed data
 * - Calculate a quick rule-based risk score
 * - Classify the primary disaster
 * - Generate English + Hindi alert messages
 *
 * NOTE:
 * This file is intentionally independent from services/riskFallback.js.
 * It does not require external APIs and will not crash if data is missing.
 */

'use strict';

/**
 * Convert a value to a finite number.
 */
function toNumber(value, fallback = 0) {
  const number = Number(value);

  return Number.isFinite(number) ? number : fallback;
}

/**
 * Keep risk score between 0 and 100.
 */
function clampScore(score) {
  return Math.max(0, Math.min(100, Math.round(toNumber(score, 0))));
}

/**
 * Convert score to readable risk level.
 */
function getRiskLevel(score) {
  if (score >= 75) return 'Severe';
  if (score >= 50) return 'High';
  if (score >= 30) return 'Moderate';

  return 'Low';
}

/**
 * Normalize incoming weather data.
 *
 * Supports multiple field names because different APIs/services
 * may use different property names.
 */
function normalizeWeather(weatherData = {}) {
  const weather = weatherData || {};

  return {
    temp: toNumber(
      weather.temp ??
      weather.temperature ??
      weather.temperature_2m,
      28
    ),

    rain: toNumber(
      weather.rain ??
      weather.precipitation ??
      weather.rainfall ??
      weather.nextRain,
      0
    ),

    wind: toNumber(
      weather.windSpeed ??
      weather.wind_speed ??
      weather.wind_speed_10m ??
      weather.wind,
      10
    ),

    humidity: toNumber(
      weather.humidity ??
      weather.relative_humidity_2m,
      60
    )
  };
}

/**
 * Calculate realtime feed risk.
 *
 * @param {Object} weatherData
 * @param {String} disasterType
 * @param {String} location
 *
 * @returns {Object}
 */
function calculateRealtimeRisk(
  weatherData = {},
  disasterType = 'multi',
  location = 'Selected Location'
) {
  const weather = normalizeWeather(weatherData);

  const type = String(disasterType || 'multi').toLowerCase().trim();

  const safeLocation =
    String(location || 'Selected Location').trim() ||
    'Selected Location';

  let score = 18;
  let primaryDisaster = 'Multi-Hazard';

  let reasons = [];

  let alertEn =
    `BhoomiSuraksha: Conditions are currently being monitored near ${safeLocation}.`;

  let alertHi =
    `भूमिसुरक्षा: ${safeLocation} के पास स्थिति की निगरानी की जा रही है।`;

  let recommendedAction =
    'Continue monitoring official disaster and weather updates.';

  /*
   * ------------------------------------------------------------
   * FLOOD / URBAN FLOOD / CLOUDBURST
   * ------------------------------------------------------------
   */
  if (
    type.includes('flood') ||
    type.includes('urban') ||
    type.includes('cloudburst')
  ) {
    primaryDisaster = type.includes('cloudburst')
      ? 'Cloudburst'
      : type.includes('urban')
        ? 'Urban Flood'
        : 'Flood';

    if (weather.rain > 100) {
      score = 92;

      reasons = [
        `Extreme rainfall ${weather.rain}mm`,
        'Flash flooding may occur in low-lying areas',
        'Drainage systems may be overwhelmed'
      ];

      alertEn =
        `⚠️ CRITICAL FLOOD ALERT: ${weather.rain}mm rainfall detected near ${safeLocation}. ` +
        `Move away from low-lying and waterlogged areas.`;

      alertHi =
        `⚠️ गंभीर बाढ़ अलर्ट: ${safeLocation} के पास ${weather.rain}mm वर्षा। ` +
        `निचले और जलभराव वाले क्षेत्रों से दूर जाएँ।`;

      recommendedAction =
        'Move to higher ground, avoid flooded roads and underpasses, and follow local authority instructions.';
    } else if (weather.rain > 50) {
      score = 68;

      reasons = [
        `Heavy rainfall ${weather.rain}mm`,
        'Urban waterlogging is possible',
        'Local streams may rise'
      ];

      alertEn =
        `⚠️ FLOOD WARNING: ${weather.rain}mm rainfall near ${safeLocation}. ` +
        `Avoid waterlogged roads and underpasses.`;

      alertHi =
        `⚠️ बाढ़ चेतावनी: ${safeLocation} के पास ${weather.rain}mm वर्षा। ` +
        `जलभराव वाली सड़कों और अंडरपास से बचें।`;

      recommendedAction =
        'Avoid flooded roads, keep emergency supplies ready and monitor local alerts.';
    } else if (weather.rain > 20) {
      score = 42;

      reasons = [
        `Moderate rainfall ${weather.rain}mm`,
        'Localized waterlogging is possible'
      ];

      alertEn =
        `Flood watch: Moderate rainfall of ${weather.rain}mm near ${safeLocation}. Stay updated.`;

      alertHi =
        `बाढ़ निगरानी: ${safeLocation} के पास ${weather.rain}mm मध्यम वर्षा। अपडेट रहें।`;

      recommendedAction =
        'Avoid known waterlogging areas and monitor the next weather updates.';
    } else {
      score = 22;

      reasons = [
        `Rainfall ${weather.rain}mm is currently limited`,
        'No immediate flood signal detected'
      ];

      alertEn =
        `Flood conditions currently appear stable near ${safeLocation}.`;

      alertHi =
        `${safeLocation} के पास बाढ़ की स्थिति फिलहाल सामान्य है।`;

      recommendedAction =
        'Continue routine monitoring.';
    }
  }

  /*
   * ------------------------------------------------------------
   * LANDSLIDE
   * ------------------------------------------------------------
   */
  else if (
    type.includes('landslide') ||
    type.includes('land slide')
  ) {
    primaryDisaster = 'Landslide';

    if (weather.rain > 80) {
      score = 90;

      reasons = [
        `Heavy rainfall ${weather.rain}mm`,
        'Slope instability may increase',
        'Debris flow and road blockage are possible'
      ];

      alertEn =
        `⚠️ CRITICAL LANDSLIDE ALERT: Heavy rainfall ${weather.rain}mm near ${safeLocation}. ` +
        `Avoid steep slopes and hill roads.`;

      alertHi =
        `⚠️ गंभीर भूस्खलन अलर्ट: ${safeLocation} के पास ${weather.rain}mm भारी वर्षा। ` +
        `ढलानों और पहाड़ी सड़कों से दूर रहें।`;

      recommendedAction =
        'Move away from steep slopes and avoid unnecessary travel through hilly areas.';
    } else if (weather.rain > 40) {
      score = 62;

      reasons = [
        `Rainfall ${weather.rain}mm may destabilize loose soil`,
        'Slope movement should be monitored'
      ];

      alertEn =
        `⚠️ LANDSLIDE WATCH: Rainfall ${weather.rain}mm near ${safeLocation}. ` +
        `Use caution on hill roads.`;

      alertHi =
        `⚠️ भूस्खलन निगरानी: ${safeLocation} के पास ${weather.rain}mm वर्षा। ` +
        `पहाड़ी सड़कों पर सावधानी रखें।`;

      recommendedAction =
        'Avoid stopping below steep slopes and report cracks or falling debris.';
    } else {
      score = 28;

      reasons = [
        `Rainfall ${weather.rain}mm`,
        'Current rainfall trigger appears limited'
      ];

      alertEn =
        `Landslide risk currently appears limited near ${safeLocation}.`;

      alertHi =
        `${safeLocation} के पास भूस्खलन जोखिम फिलहाल सीमित है।`;

      recommendedAction =
        'Continue normal monitoring, especially in hilly areas.';
    }
  }

  /*
   * ------------------------------------------------------------
   * HEAT WAVE
   * ------------------------------------------------------------
   */
  else if (type.includes('heat')) {
    primaryDisaster = 'Heat Wave';

    if (weather.temp >= 45) {
      score = 94;

      reasons = [
        `Temperature ${weather.temp}°C`,
        'Severe heat stress conditions',
        'Heat-stroke risk is elevated'
      ];

      alertEn =
        `⚠️ SEVERE HEATWAVE: Temperature ${weather.temp}°C near ${safeLocation}. ` +
        `Avoid direct sun during peak afternoon hours.`;

      alertHi =
        `⚠️ गंभीर लू: ${safeLocation} के पास तापमान ${weather.temp}°C। ` +
        `दोपहर की तेज धूप से बचें।`;

      recommendedAction =
        'Stay hydrated, remain in shade/cool areas and avoid unnecessary outdoor activity during peak heat.';
    } else if (weather.temp >= 40) {
      score = 70;

      reasons = [
        `High temperature ${weather.temp}°C`,
        'Heat stress is possible'
      ];

      alertEn =
        `⚠️ HEAT WARNING: Temperature ${weather.temp}°C near ${safeLocation}. Stay hydrated.`;

      alertHi =
        `⚠️ लू चेतावनी: ${safeLocation} के पास तापमान ${weather.temp}°C। पानी पीते रहें।`;

      recommendedAction =
        'Limit strenuous outdoor activity and maintain hydration.';
    } else {
      score = 30;

      reasons = [
        `Temperature ${weather.temp}°C`,
        'No severe heat signal detected'
      ];

      alertEn =
        `Heat conditions are currently moderate near ${safeLocation}.`;

      alertHi =
        `${safeLocation} के पास गर्मी की स्थिति फिलहाल मध्यम है।`;

      recommendedAction =
        'Maintain normal hydration and continue monitoring.';
    }
  }

  /*
   * ------------------------------------------------------------
   * CYCLONE / STORM / STRONG WIND
   * ------------------------------------------------------------
   */
  else if (
    type.includes('cyclone') ||
    type.includes('storm') ||
    type.includes('wind')
  ) {
    primaryDisaster = 'Storm';

    if (weather.wind > 80) {
      score = 91;

      reasons = [
        `Wind speed ${weather.wind} km/h`,
        'Strong winds may cause structural damage',
        'Falling trees and flying debris are possible'
      ];

      alertEn =
        `⚠️ CRITICAL WIND ALERT: Wind speed ${weather.wind} km/h near ${safeLocation}. ` +
        `Stay indoors and away from glass/windows.`;

      alertHi =
        `⚠️ गंभीर हवा अलर्ट: ${safeLocation} के पास हवा की गति ${weather.wind} किमी/घंटा। ` +
        `घर के अंदर रहें और खिड़कियों से दूर रहें।`;

      recommendedAction =
        'Stay indoors, secure loose objects and avoid unnecessary travel.';
    } else if (weather.wind > 45) {
      score = 58;

      reasons = [
        `Strong winds ${weather.wind} km/h`,
        'Loose objects may become hazardous'
      ];

      alertEn =
        `⚠️ WIND ALERT: Strong winds ${weather.wind} km/h near ${safeLocation}.`;

      alertHi =
        `⚠️ हवा अलर्ट: ${safeLocation} के पास ${weather.wind} किमी/घंटा तेज़ हवा।`;

      recommendedAction =
        'Secure outdoor objects and avoid temporary structures.';
    } else {
      score = 25;

      reasons = [
        `Wind ${weather.wind} km/h`,
        'No immediate severe wind signal'
      ];

      alertEn =
        `Wind conditions are currently stable near ${safeLocation}.`;

      alertHi =
        `${safeLocation} के पास हवा की स्थिति फिलहाल सामान्य है।`;

      recommendedAction =
        'Continue routine monitoring.';
    }
  }

  /*
   * ------------------------------------------------------------
   * COLD WAVE
   * ------------------------------------------------------------
   */
  else if (type.includes('cold')) {
    primaryDisaster = 'Cold Wave';

    if (weather.temp <= 2) {
      score = 85;

      reasons = [
        `Temperature ${weather.temp}°C`,
        'Severe cold conditions',
        'Cold-stress risk is elevated'
      ];

      alertEn =
        `⚠️ COLD WAVE ALERT: Temperature ${weather.temp}°C near ${safeLocation}.`;

      alertHi =
        `⚠️ शीतलहर अलर्ट: ${safeLocation} के पास तापमान ${weather.temp}°C।`;

      recommendedAction =
        'Wear warm clothing and check on vulnerable people.';
    } else if (weather.temp <= 8) {
      score = 55;

      reasons = [
        `Temperature ${weather.temp}°C`,
        'Cold stress is possible'
      ];

      alertEn =
        `Cold wave watch: Temperature ${weather.temp}°C near ${safeLocation}.`;

      alertHi =
        `शीतलहर निगरानी: ${safeLocation} के पास तापमान ${weather.temp}°C।`;

      recommendedAction =
        'Use adequate warm clothing and limit prolonged exposure.';
    } else {
      score = 20;

      reasons = [
        `Temperature ${weather.temp}°C`,
        'No immediate cold-wave signal'
      ];

      alertEn =
        `No significant cold-wave signal near ${safeLocation}.`;

      alertHi =
        `${safeLocation} के पास शीतलहर का कोई गंभीर संकेत नहीं।`;

      recommendedAction =
        'Continue routine monitoring.';
    }
  }

  /*
   * ------------------------------------------------------------
   * MULTI-HAZARD / GENERAL
   * ------------------------------------------------------------
   */
  else {
    primaryDisaster = 'Multi-Hazard';

    const rainRisk = weather.rain > 60;
    const windRisk = weather.wind > 55;
    const heatRisk = weather.temp >= 43;
    const coldRisk = weather.temp <= 5;

    if (rainRisk || windRisk || heatRisk || coldRisk) {
      score = 57;

      if (rainRisk) {
        primaryDisaster = 'Flood';
      } else if (windRisk) {
        primaryDisaster = 'Storm';
      } else if (heatRisk) {
        primaryDisaster = 'Heat Wave';
      } else if (coldRisk) {
        primaryDisaster = 'Cold Wave';
      }

      reasons = [
        `Rainfall: ${weather.rain}mm`,
        `Wind: ${weather.wind} km/h`,
        `Temperature: ${weather.temp}°C`
      ];

      alertEn =
        `⚠️ ELEVATED RISK: ${primaryDisaster} conditions detected near ${safeLocation}.`;

      alertHi =
        `⚠️ बढ़ा हुआ जोखिम: ${safeLocation} के पास ${primaryDisaster} के संकेत मिले हैं।`;

      recommendedAction =
        'Monitor official alerts, keep emergency contacts available and stay prepared.';
    } else {
      score = 20;

      reasons = [
        `Rainfall ${weather.rain}mm`,
        `Wind ${weather.wind} km/h`,
        `Temperature ${weather.temp}°C`,
        'No major threshold exceeded'
      ];

      alertEn =
        `No severe active hazard detected near ${safeLocation}.`;

      alertHi =
        `${safeLocation} के पास कोई गंभीर सक्रिय खतरा नहीं मिला।`;

      recommendedAction =
        'Continue routine monitoring.';
    }
  }

  score = clampScore(score);

  const riskLevel = getRiskLevel(score);

  return {
    success: true,

    location: safeLocation,

    disasterType: type || 'multi',

    primaryDisaster,

    riskLevel,

    score,

    reasons,

    alertEn,

    alertHi,

    recommendedAction,

    weather: {
      temperature: weather.temp,
      rainfall: weather.rain,
      windSpeed: weather.wind,
      humidity: weather.humidity
    },

    timestamp: new Date().toISOString()
  };
}

/**
 * Backward-compatible function.
 *
 * Some existing code may use calculateRuleBasedRisk().
 */
function calculateRuleBasedRisk(
  weatherData = {},
  disasterType = 'multi',
  location = 'Selected Location'
) {
  return calculateRealtimeRisk(
    weatherData,
    disasterType,
    location
  );
}

/**
 * Simple helper for callers that only need a score.
 */
function getRealtimeRiskScore(
  weatherData = {},
  disasterType = 'multi'
) {
  return calculateRealtimeRisk(
    weatherData,
    disasterType
  ).score;
}

/**
 * Module exports
 */
module.exports = {
  calculateRealtimeRisk,
  calculateRuleBasedRisk,
  getRealtimeRiskScore,
  normalizeWeather,
  getRiskLevel,
  clampScore
};
