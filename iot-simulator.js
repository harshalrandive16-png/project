/**
 * ═══════════════════════════════════════════════════════════════
 * 🏔️ BhoomiSuraksha v5.2 — IoT Telemetry Hardware Simulator
 * Simulates ESP32 Nodes: Jal-Suraksha, Bhumi-Suraksha, Van-Suraksha
 * Target Latency: < 1.5s Pipeline (SENSE → PREDICT → ALERT → RESPOND)
 * ═══════════════════════════════════════════════════════════════
 */

require('dotenv').config();
const axios = require('axios');

// Target API Gateway Endpoint
const TARGET_API = process.env.SIMULATOR_TARGET_URL || 'http://localhost:5000/api/sensors/ingest';
const SENSOR_KEY = process.env.SENSOR_API_KEY || 'bhoomi_sensor_secret_key_v52';

console.log('═══════════════════════════════════════════════════════════');
console.log('🚀 BhoomiSuraksha v5.2 Virtual ESP32 Hardware Simulator');
console.log(`🌐 Target Ingest Endpoint: ${TARGET_API}`);
console.log(`🔑 HMAC Sensor Key: ${SENSOR_KEY.substring(0, 8)}...`);
console.log('⏱️ Telemetry Interval: 4000ms (4 seconds)');
console.log('═══════════════════════════════════════════════════════════\n');

// ── Node Telemetry State Generators ──

// 🌊 Jal-Suraksha: ESP32 + JSN-SR04T Ultrasonic
function getJalNodeData(mode = 'normal') {
    let waterLevelCm = Math.floor(20 + Math.random() * 20); // Normal: 20 - 40 cm
    let flowRateMs = parseFloat((0.5 + Math.random() * 0.8).toFixed(2)); // 0.5 - 1.3 m/s

    if (mode === 'yellow') waterLevelCm = Math.floor(55 + Math.random() * 20); // L1: 50-80cm
    if (mode === 'orange') waterLevelCm = Math.floor(85 + Math.random() * 30); // L2: 80-120cm
    if (mode === 'red') {
        waterLevelCm = Math.floor(125 + Math.random() * 40); // L3 RED: >120cm
        flowRateMs = parseFloat((3.2 + Math.random() * 1.5).toFixed(2));
    }

    return {
        nodeId: 'JAL_01',
        location: 'Nagpur Wardha River Basin',
        deviceId: 'ESP32_JAL_8237',
        metrics: {
            waterLevelCm,
            flowRateMs
        }
    };
}

// ⛰️ Bhumi-Suraksha: ESP32-S3 + MPU-6050 IMU
function getBhumiNodeData(mode = 'normal') {
    let tiltDegrees = parseFloat((0.2 + Math.random() * 0.8).toFixed(2)); // Normal: < 1.0°
    let vibrationHz = parseFloat((1.0 + Math.random() * 3.0).toFixed(2));  // Normal: < 5.0 Hz

    if (mode === 'yellow') tiltDegrees = parseFloat((1.6 + Math.random() * 0.8).toFixed(2)); // L1: 1.5-2.5°
    if (mode === 'orange') tiltDegrees = parseFloat((2.8 + Math.random() * 1.8).toFixed(2)); // L2: 2.5-5.0°
    if (mode === 'red') {
        tiltDegrees = parseFloat((4.8 + Math.random() * 3.0).toFixed(2)); // L3 RED: >4.5°
        vibrationHz = parseFloat((22.0 + Math.random() * 10.0).toFixed(2)); // + >20Hz
    }

    return {
        nodeId: 'BHUMI_01',
        location: 'Western Ghats Slope Node 4',
        deviceId: 'ESP32_S3_BHUMI_9359',
        metrics: {
            tiltDegrees,
            vibrationHz
        }
    };
}

// 🔥 Van-Suraksha: ESP32 + BME280 + MQ-7
function getVanNodeData(mode = 'normal') {
    let temperatureC = parseFloat((28.0 + Math.random() * 5.0).toFixed(1)); // Normal: 28-33°C
    let humidity = Math.floor(45 + Math.random() * 20);                    // Normal: 45-65%
    let coPpm = Math.floor(5 + Math.random() * 10);                          // Normal: < 15 ppm

    if (mode === 'yellow') coPpm = Math.floor(25 + Math.random() * 20);      // L1: 20-50ppm
    if (mode === 'orange') coPpm = Math.floor(60 + Math.random() * 150);     // L2: 50-250ppm
    if (mode === 'red') {
        coPpm = Math.floor(260 + Math.random() * 200);                       // L3 RED: >250ppm
        temperatureC = parseFloat((49.5 + Math.random() * 8.0).toFixed(1)); // + >48°C
        humidity = Math.floor(12 + Math.random() * 10);
    }

    return {
        nodeId: 'VAN_01',
        location: 'Melghat Forest Range B',
        deviceId: 'ESP32_VAN_9209',
        metrics: {
            temperatureC,
            humidity,
            coPpm
        }
    };
}

// Global mode switcher for demo testing: 'normal' | 'yellow' | 'orange' | 'red'
let currentSimulationMode = process.env.SIM_MODE || 'normal';

// Allow command line mode argument: `node iot-simulator.js red`
if (process.argv[2]) {
    const argMode = process.argv[2].toLowerCase();
    if (['normal', 'yellow', 'orange', 'red'].includes(argMode)) {
        currentSimulationMode = argMode;
    }
}

async function sendTelemetry(payload) {
    try {
        const response = await axios.post(TARGET_API, payload, {
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': SENSOR_KEY,
                'x-sensor-key': SENSOR_KEY
            },
            timeout: 3000
        });

        const state = response.data?.state || {};
        const level = state.level || 'L0';
        
        let color = '\x1b[32m'; // Green
        if (level === 'L1') color = '\x1b[33m'; // Yellow
        if (level === 'L2') color = '\x1b[35m'; // Purple/Orange
        if (level === 'L3') color = '\x1b[31m'; // Red

        console.log(`[${new Date().toLocaleTimeString()}] ${payload.nodeId} (${payload.location}) → Status: ${color}${level}\x1b[0m | Metrics: ${JSON.stringify(payload.metrics)}`);

    } catch (error) {
        console.error(`❌ [${payload.nodeId}] Telemetry Ingest Failed:`, error.response?.data?.error || error.message);
    }
}

// ── Main Simulation Loop ──
let cycle = 0;

function runSimulationCycle() {
    cycle++;
    
    // Inject periodic anomaly every 10 cycles if running in 'normal' mode
    let nodeMode = currentSimulationMode;
    if (currentSimulationMode === 'normal' && cycle % 10 === 0) {
        nodeMode = 'yellow'; // periodic test warning
    }

    const jalData = getJalNodeData(nodeMode);
    const bhumiData = getBhumiNodeData(nodeMode);
    const vanData = getVanNodeData(nodeMode);

    sendTelemetry(jalData);
    setTimeout(() => sendTelemetry(bhumiData), 1200);
    setTimeout(() => sendTelemetry(vanData), 2400);
}

// Run immediately and repeat every 4 seconds
runSimulationCycle();
setInterval(runSimulationCycle, 4000);

console.log(`📡 Simulation running in \x1b[36m[${currentSimulationMode.toUpperCase()}]\x1b[0m mode.`);
console.log(`💡 Tip: Run \`node iot-simulator.js red\` to test L3 CRITICAL Autopilot Emergency trigger!\n`);
