/**
 * BhoomiSuraksha — Rule-Based Risk Fallback
 * Export name MUST be: fallbackRisk  (matches server.js)
 * riskLevel Title-Case: Low | Moderate | High | Severe
 */

function clampScore(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 20;
  return Math.max(0, Math.min(100, Math.round(x)));
}

function levelFromScore(score) {
  if (score >= 75) return 'Severe';
  if (score >= 50) return 'High';
  if (score >= 30) return 'Moderate';
  return 'Low';
}

function pickWeather(weather) {
  const w = weather || {};
  return {
    temp: Number(w.temp ?? w.temperature ?? w.temperature_2m ?? 28) || 28,
    rain: Number(w.rain ?? w.precipitation ?? w.rainfall ?? w.nextRain ?? 0) || 0,
    wind: Number(w.windSpeed ?? w.wind_speed ?? w.wind_speed_10m ?? w.wind ?? 10) || 10,
    humidity: Number(w.humidity ?? w.relative_humidity_2m ?? 60) || 60
  };
}

/**
 * @param {{ weather?: object, disasterType?: string, location?: string }} input
 */
function fallbackRisk(input = {}) {
  const weather = pickWeather(input.weather);
  const location = input.location || 'Selected Location';
  const disasterType = String(input.disasterType || 'multi');
  const type = disasterType.toLowerCase();

  let score = 18;
  let primaryDisaster = 'Multi-Hazard';
  let explanation = '';
  let explanationHindi = '';
  let smsEnglish = '';
  let smsHindi = '';
  let recommendedAction = 'Monitor official NDMA / SDMA bulletins and stay alert.';

  // ── Floods / Urban / Cloudburst ──
  if (type.includes('flood') || type.includes('urban') || type.includes('cloudburst') || type === 'multi') {
    primaryDisaster = type.includes('cloudburst') ? 'Cloudburst' : type.includes('urban') ? 'Urban Flood' : 'Flood';

    if (weather.rain > 100 || (type === 'multi' && weather.rain > 80)) {
      score = 92;
      primaryDisaster = weather.rain > 120 ? 'Cloudburst' : primaryDisaster;
      explanation = `Extreme rainfall of ${weather.rain}mm detected near ${location}. Flash flooding and drainage failure are likely in low-lying zones.`;
      explanationHindi = `${location} के पास ${weather.rain}mm अत्यधिक वर्षा। निचले क्षेत्रों में अचानक बाढ़ व जल निकासी फेल होने की आशंका।`;
      smsEnglish = `BhoomiSuraksha ALERT: SEVERE flood risk near ${location}. Rain ${weather.rain}mm. Move to higher ground. Helpline 112`;
      smsHindi = `भूमिसुरक्षा अलर्ट: ${location} में गंभीर बाढ़ खतरा। वर्षा ${weather.rain}mm। ऊँची जगह जाएँ। 112`;
      recommendedAction = 'Evacuate low-lying areas immediately. Avoid underpasses. Keep emergency kit ready. Call 112/1078 if trapped.';
    } else if (weather.rain > 50) {
      score = 68;
      explanation = `Heavy rainfall ${weather.rain}mm around ${location}. Urban waterlogging and rising local streams expected.`;
      explanationHindi = `${location} में भारी बारिश ${weather.rain}mm। सड़कों पर जलभराव व नालों में तेज़ी संभव।`;
      smsEnglish = `BhoomiSuraksha WARNING: High flood risk near ${location}. Rain ${weather.rain}mm. Avoid waterlogged roads. Helpline 112`;
      smsHindi = `भूमिसुरक्षा चेतावनी: ${location} में बाढ़ खतरा। वर्षा ${weather.rain}mm। जलभराव सड़कों से बचें। 112`;
      recommendedAction = 'Avoid travel through flooded roads. Move valuables above floor level. Follow local administration advisories.';
    } else if (weather.rain > 20) {
      score = 42;
      explanation = `Moderate rain ${weather.rain}mm at ${location}. Localized waterlogging possible in poor-drainage pockets.`;
      explanationHindi = `${location} में मध्यम वर्षा ${weather.rain}mm। कमज़ोर निकासी वाले इलाकों में जलभराव संभव।`;
      smsEnglish = `BhoomiSuraksha: Moderate flood watch near ${location}. Rain ${weather.rain}mm. Stay updated.`;
      smsHindi = `भूमिसुरक्षा: ${location} में मध्यम बाढ़ निगरानी। वर्षा ${weather.rain}mm। अपडेट रहें।`;
      recommendedAction = 'Carry umbrella, avoid known waterlogging spots, monitor next 3-hour forecast.';
    } else if (type === 'multi') {
      // fall through to other multi checks below
    } else {
      score = 22;
      explanation = `Rainfall ${weather.rain}mm near ${location} is within manageable limits for flood hazard.`;
      explanationHindi = `${location} में वर्षा ${weather.rain}mm बाढ़ के लिए सामान्य सीमा में।`;
      smsEnglish = `BhoomiSuraksha: Flood risk Low near ${location}. Rain ${weather.rain}mm. Continue monitoring.`;
      smsHindi = `भूमिसुरक्षा: ${location} में बाढ़ जोखिम कम। वर्षा ${weather.rain}mm। निगरानी जारी रखें।`;
    }
  }

  // ── Landslide ──
  if (type.includes('landslide') || type.includes('land slide')) {
    primaryDisaster = 'Landslide';
    if (weather.rain > 80) {
      score = 90;
      explanation = `Sustained heavy rain ${weather.rain}mm on slopes near ${location}. High chance of debris flow and road blockage.`;
      explanationHindi = `${location} के ढलानों पर ${weather.rain}mm भारी बारिश। मलबा प्रवाह व सड़क जाम की उच्च आशंका।`;
      smsEnglish = `BhoomiSuraksha CRITICAL: Landslide risk near ${location}. Avoid hill roads. Helpline 112 / NDRF 1078`;
      smsHindi = `भूमिसुरक्षा गंभीर: ${location} में भूस्खलन खतरा। पहाड़ी सड़क से बचें। 112 / 1078`;
      recommendedAction = 'Move away from steep cuts. Do not stop below overhanging slopes. Report cracks/tilted trees.';
    } else if (weather.rain > 40) {
      score = 62;
      explanation = `Rain ${weather.rain}mm can destabilize loose soil near ${location}. Slope caution advised.`;
      explanationHindi = `${location} में ${weather.rain}mm वर्षा ढीली मिट्टी को अस्थिर कर सकती है।`;
      smsEnglish = `BhoomiSuraksha ALERT: Landslide watch near ${location}. Drive slow on hill roads. Helpline 112`;
      smsHindi = `भूमिसुरक्षा अलर्ट: ${location} में भूस्खलन निगरानी। पहाड़ी मार्ग पर धीरे चलाएँ। 112`;
      recommendedAction = 'Avoid night travel on ghat roads. Keep distance from valley-edge shoulders.';
    } else {
      score = 28;
      explanation = `Landslide trigger rainfall is limited (${weather.rain}mm) near ${location}.`;
      explanationHindi = `${location} में भूस्खलन ट्रिगर वर्षा सीमित (${weather.rain}mm)।`;
      smsEnglish = `BhoomiSuraksha: Landslide risk currently limited near ${location}.`;
      smsHindi = `भूमिसुरक्षा: ${location} में भूस्खलन जोखिम अभी सीमित।`;
    }
  }

  // ── Heat Wave ──
  if (type.includes('heat')) {
    primaryDisaster = 'Heat Wave';
    if (weather.temp >= 45) {
      score = 94;
      explanation = `Severe heatwave ${weather.temp}°C at ${location}. Extreme heat-stroke risk 11AM–4PM.`;
      explanationHindi = `${location} में गंभीर लू ${weather.temp}°C। दोपहर में हीट स्ट्रोक का खतरा।`;
      smsEnglish = `BhoomiSuraksha CRITICAL: Heat wave ${weather.temp}°C at ${location}. Avoid sun 11-4. Helpline 108/112`;
      smsHindi = `भूमिसुरक्षा: ${location} में लू ${weather.temp}°C। 11-4 धूप से बचें। 108/112`;
      recommendedAction = 'ORS + water every 15 min. Never leave children/pets in parked vehicles.';
    } else if (weather.temp >= 40) {
      score = 70;
      explanation = `High temperature ${weather.temp}°C at ${location}. Heat stress for outdoor workers.`;
      explanationHindi = `${location} में तापमान ${weather.temp}°C। बाहरी काम में सावधानी।`;
      smsEnglish = `BhoomiSuraksha WARNING: Heat stress ${weather.temp}°C near ${location}. Stay hydrated.`;
      smsHindi = `भूमिसुरक्षा: ${location} में गर्मी ${weather.temp}°C। पानी पीते रहें।`;
      recommendedAction = 'Schedule heavy work early morning. Wear light cotton, use shade.';
    } else {
      score = 30;
      explanation = `Temperature ${weather.temp}°C at ${location} is elevated but manageable with hydration.`;
      explanationHindi = `${location} में ${weather.temp}°C — पानी और छाया से प्रबंधन संभव।`;
      smsEnglish = `BhoomiSuraksha: Heat conditions moderate (${weather.temp}°C) at ${location}.`;
      smsHindi = `भूमिसुरक्षा: ${location} में गर्मी मध्यम (${weather.temp}°C)।`;
    }
  }

  // ── Cyclone / Storm ──
  if (type.includes('cyclone') || type.includes('storm')) {
    primaryDisaster = 'Cyclone';
    if (weather.wind > 80) {
      score = 91;
      explanation = `Destructive winds ${weather.wind} km/h near ${location}. Structural damage and tree-fall likely.`;
      explanationHindi = `${location} में विनाशकारी हवा ${weather.wind} किमी/घंटा। पेड़ गिरने/नुकसान संभव।`;
      smsEnglish = `BhoomiSuraksha CRITICAL: Cyclone winds ${weather.wind} km/h near ${location}. Stay indoors. Helpline 1078`;
      smsHindi = `भूमिसुरक्षा: ${location} में चक्रवाती हवा ${weather.wind} किमी/घंटा। घर के अंदर रहें। 1078`;
      recommendedAction = 'Stay away from glass. Secure loose roofs. Do not go out during eye of storm.';
    } else if (weather.wind > 45) {
      score = 58;
      explanation = `Strong winds ${weather.wind} km/h at ${location}. Flying debris hazard.`;
      explanationHindi = `${location} में तेज़ हवा ${weather.wind} किमी/घंटा। उड़ते मलबे का खतरा।`;
      smsEnglish = `BhoomiSuraksha ALERT: High winds ${weather.wind} km/h near ${location}. Secure outdoor items.`;
      smsHindi = `भूमिसुरक्षा: ${location} में तेज़ हवा ${weather.wind} किमी/घंटा। बाहर सामान बाँधें।`;
      recommendedAction = 'Avoid temporary structures and hoardings. Delay non-essential travel.';
    } else {
      score = 25;
      explanation = `Wind ${weather.wind} km/h near ${location} is below cyclone damage thresholds.`;
      explanationHindi = `${location} में हवा ${weather.wind} किमी/घंटा — चक्रवात नुकसान सीमा से कम।`;
      smsEnglish = `BhoomiSuraksha: No cyclone-level wind threat near ${location}.`;
      smsHindi = `भूमिसुरक्षा: ${location} में चक्रवात-स्तर की हवा नहीं।`;
    }
  }

  // ── Multi default blend if still low info ──
  if (type === 'multi' && score < 30) {
    primaryDisaster = 'Multi-Hazard';
    if (weather.rain > 60 || weather.wind > 55 || weather.temp >= 43) {
      score = 57;
      if (weather.rain >= weather.wind && weather.rain >= weather.temp - 20) primaryDisaster = 'Flood';
      else if (weather.wind >= weather.rain) primaryDisaster = 'Storm';
      else primaryDisaster = 'Heat Wave';
      explanation = `Multiple elevated parameters at ${location}: rain ${weather.rain}mm, wind ${weather.wind} km/h, temp ${weather.temp}°C.`;
      explanationHindi = `${location} में कई मौसमी संकेतक ऊँचे: वर्षा ${weather.rain}mm, हवा ${weather.wind}, तापमान ${weather.temp}°C।`;
      smsEnglish = `BhoomiSuraksha ALERT: Elevated ${primaryDisaster} risk near ${location}. Helpline 112`;
      smsHindi = `भूमिसुरक्षा अलर्ट: ${location} में ${primaryDisaster} जोखिम। 112`;
      recommendedAction = 'Follow local SDMA guidance. Keep phone charged and family informed.';
    } else {
      score = 20;
      explanation = `Ambient conditions near ${location} are within normal band (rain ${weather.rain}mm, wind ${weather.wind} km/h, temp ${weather.temp}°C).`;
      explanationHindi = `${location} की मौजूदा मौसम स्थिति सामान्य सीमा में है।`;
      smsEnglish = `BhoomiSuraksha: No severe active hazard near ${location}. Stay aware.`;
      smsHindi = `भूमिसुरक्षा: ${location} में कोई गंभीर सक्रिय खतरा नहीं। सतर्क रहें।`;
      recommendedAction = 'Continue routine monitoring on BhoomiSuraksha dashboard.';
    }
  }

  score = clampScore(score);
  const riskLevel = levelFromScore(score);

  if (!smsEnglish) {
    smsEnglish = `BhoomiSuraksha: ${riskLevel} ${primaryDisaster} risk near ${location} (score ${score}/100). Helpline 112`;
  }
  if (!smsHindi) {
    smsHindi = `भूमिसुरक्षा: ${location} में ${riskLevel} ${primaryDisaster} जोखिम (स्कोर ${score}/100)। 112`;
  }
  if (!explanation) {
    explanation = `${primaryDisaster} assessment for ${location}: score ${score}/100 (${riskLevel}).`;
  }
  if (!explanationHindi) {
    explanationHindi = `${location} के लिए ${primaryDisaster} आकलन: स्कोर ${score}/100 (${riskLevel})।`;
  }

  console.log(`🛰️ [fallbackRisk] ${location} → ${riskLevel} ${score}/100 (${primaryDisaster})`);

  return {
    riskLevel,
    score,
    primaryDisaster,
    explanation,
    explanationHindi,
    smsEnglish,
    smsHindi,
    recommendedAction,
    confidence: 0.72,
    parametersAnalyzed: {
      temp: weather.temp,
      rain: weather.rain,
      windSpeed: weather.wind,
      humidity: weather.humidity
    }
  };
}

// Backward-compatible alias if old code calls calculateRuleBasedRisk
function calculateRuleBasedRisk(weatherData, disasterType, location) {
  return fallbackRisk({
    weather: weatherData,
    disasterType: disasterType || 'multi',
    location: location || 'Selected Location'
  });
}

module.exports = {
  fallbackRisk,
  calculateRuleBasedRisk
};