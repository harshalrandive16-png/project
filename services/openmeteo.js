// ═══════════════════════════════════════════════════════
// 🏔️ BhoomiSuraksha — Open-Meteo Weather Data Fetcher
// Satellite + sensor data (FREE, no API key)
// ═══════════════════════════════════════════════════════

const axios = require('axios');

async function fetchWeatherData(lat, lon) {
    try {
        console.log(`🛰️ Fetching satellite/sensor data for [${lat}, ${lon}]...`);

        const currentUrl =
            `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
            `&current=temperature_2m,relative_humidity_2m,precipitation,rain,showers,snowfall,weather_code,cloud_cover,pressure_msl,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m` +
            `&hourly=temperature_2m,relative_humidity_2m,precipitation_probability,precipitation,rain,showers,snowfall,weather_code,cloud_cover,wind_speed_10m,wind_gusts_10m,soil_temperature_0cm,soil_moisture_0_to_1cm` +
            `&forecast_days=3&timezone=Asia/Kolkata`;

        const response = await axios.get(currentUrl, { timeout: 10000 });
        const data = response.data;

        if (!data || !data.current) {
            throw new Error('Invalid weather response');
        }

        const current = data.current;
        const hourly = data.hourly || {};

        const precipArray = hourly.precipitation || [];
        const next24h = precipArray.slice(0, 24);
        const next48h = precipArray.slice(0, 48);

        const totalRain24h = next24h.reduce((a, b) => a + (b || 0), 0);
        const totalRain48h = next48h.reduce((a, b) => a + (b || 0), 0);
        const maxHourlyRain = Math.max(...next24h, 0);

        const soilMoistureArray = hourly.soil_moisture_0_to_1cm || [];
        const avgSoilMoisture =
            soilMoistureArray.length > 0
                ? soilMoistureArray.slice(0, 24).reduce((a, b) => a + (b || 0), 0) /
                  Math.min(soilMoistureArray.length, 24)
                : null;

        const windGustArray = hourly.wind_gusts_10m || [];
        const maxWindGust = Math.max(...(windGustArray.slice(0, 24).length ? windGustArray.slice(0, 24) : [0]), 0);

        const precipProbArray = hourly.precipitation_probability || [];
        const maxPrecipProb = Math.max(...(precipProbArray.slice(0, 24).length ? precipProbArray.slice(0, 24) : [0]), 0);

        const cloudBurstRisk = maxHourlyRain > 50;

        const weatherResult = {
            temperature: current.temperature_2m,
            humidity: current.relative_humidity_2m,
            currentRainfall: current.precipitation || 0,
            currentRain: current.rain || 0,
            weatherCode: current.weather_code,
            cloudCover: current.cloud_cover,
            pressureMSL: current.pressure_msl,
            surfacePressure: current.surface_pressure,
            windSpeed: current.wind_speed_10m,
            windDirection: current.wind_direction_10m,
            windGusts: current.wind_gusts_10m,

            totalRainfall24h: Math.round(totalRain24h * 10) / 10,
            totalRainfall48h: Math.round(totalRain48h * 10) / 10,
            maxHourlyRainfall: Math.round(maxHourlyRain * 10) / 10,
            maxWindGust: Math.round(maxWindGust * 10) / 10,
            maxPrecipitationProbability: maxPrecipProb,

            avgSoilMoisture: avgSoilMoisture ? Math.round(avgSoilMoisture * 1000) / 1000 : null,
            cloudBurstRisk: cloudBurstRisk,

            hourlyPrecipitation: next48h,
            hourlyPrecipProbability: precipProbArray.slice(0, 48),
            hourlyTemperature: (hourly.temperature_2m || []).slice(0, 48),
            hourlyWindSpeed: (hourly.wind_speed_10m || []).slice(0, 48),
            hourlySoilMoisture: soilMoistureArray.slice(0, 48),

            latitude: data.latitude,
            longitude: data.longitude,
            timezone: data.timezone,
            fetchedAt: new Date().toISOString(),
            source: 'Open-Meteo Satellite/Sensor API'
        };

        console.log(
            `✅ Weather data fetched: Rain24h=${weatherResult.totalRainfall24h}mm, Temp=${weatherResult.temperature}°C, Wind=${weatherResult.windSpeed}km/h`
        );

        return weatherResult;
    } catch (error) {
        console.error('❌ Open-Meteo fetch failed:', error.message);

        // Demo never breaks
        return {
            temperature: 28,
            humidity: 75,
            currentRainfall: 5,
            currentRain: 5,
            weatherCode: 61,
            cloudCover: 80,
            pressureMSL: 1008,
            surfacePressure: 1005,
            windSpeed: 15,
            windDirection: 180,
            windGusts: 25,
            totalRainfall24h: 45,
            totalRainfall48h: 78,
            maxHourlyRainfall: 20,
            maxWindGust: 35,
            maxPrecipitationProbability: 70,
            avgSoilMoisture: 0.35,
            cloudBurstRisk: false,
            hourlyPrecipitation: [],
            hourlyPrecipProbability: [],
            hourlyTemperature: [],
            hourlyWindSpeed: [],
            hourlySoilMoisture: [],
            latitude: lat || null,
            longitude: lon || null,
            timezone: 'Asia/Kolkata',
            fetchedAt: new Date().toISOString(),
            source: 'Fallback (Open-Meteo unavailable)'
        };
    }
}

module.exports = { fetchWeatherData };