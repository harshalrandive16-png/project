function fallbackRisk({ weather, disasterType, location }) {
  const rain = Number(weather?.precipitation || 0);
  const wind = Number(weather?.windSpeed || 0);
  const humidity = Number(weather?.humidity || 0);

  let score = 20;
  score += Math.min(40, rain * 8);
  score += Math.min(25, wind * 0.6);
  score += humidity > 85 ? 10 : 0;
  score = Math.max(0, Math.min(100, Math.round(score)));

  let riskLevel = 'Low';
  if (score >= 80) riskLevel = 'Severe';
  else if (score >= 60) riskLevel = 'High';
  else if (score >= 40) riskLevel = 'Moderate';

  const primary =
    disasterType === 'cyclone' ? 'Cyclone' :
    disasterType === 'landslide' ? 'Landslide' :
    disasterType === 'earthquake' ? 'Earthquake' :
    disasterType === 'flood' ? 'Flood' : 'Multi';

  const loc = location || 'your area';

  return {
    riskLevel,
    score,
    primaryDisaster: primary,
    explanation: `Current conditions near ${loc} indicate ${riskLevel.toLowerCase()} multi-hazard concern based on rainfall ${rain} mm and wind ${wind} km/h.`,
    explanationHindi: `${loc} के आसपास वर्तमान मौसम के अनुसार जोखिम स्तर ${riskLevel} है। वर्षा ${rain} मिमी और हवा ${wind} किमी/घंटा दर्ज की गई है।`,
    smsEnglish: `BhoomiSuraksha ALERT: ${riskLevel} risk in ${loc}. Stay alert. Follow SDMA advisories. Helpline 112.`,
    smsHindi: `भूमिसुरक्षा अलर्ट: ${loc} में ${riskLevel} जोखिम। सतर्क रहें। 112 पर संपर्क करें।`,
    recommendedAction: (riskLevel === 'Severe' || riskLevel === 'High')
      ? 'Move to safer ground if advised, avoid flooded roads, keep emergency kit ready, call 112/NDRF 1070 if needed.'
      : 'Monitor official alerts, avoid unnecessary travel in heavy rain, keep phone charged.',
    confidence: 55
  };
}

module.exports = { fallbackRisk };