// ═══════════════════════════════════════════════════════════════
// 🏔️ BhoomiSuraksha — Virtual ESP32 Simulator v2.0
// Real hardware ki tarah POST /api/sensors/ingest par data bhejta hai.
// Hardware aane par sirf URL + key same rakhni hai — payload format wahi hai.
//
// Chalane ka tareeka (server.js alag terminal mein chalu rakho):
//   node iot-simulator.js                  -> sequence: calm → flood → landslide → fire (loop)
//   node iot-simulator.js flood            -> sirf flood ramp
//   node iot-simulator.js landslide|fire|pollution|calm
//   node iot-simulator.js storm            -> flood + landslide + fire ek saath (per-hazard cooldown demo)
//
// Options (env ya CLI):
//   --lat=21.1524 --lng=79.0805   nodes ko is jagah ke paas rakho (judge/phone ki location do)
//   --speed=2                     2x tez (default 1)
//   --url=https://your-app.onrender.com   deployed server
//
// .env se SENSOR_API_KEY apne-aap padhta hai.
// ═══════════════════════════════════════════════════════════════
'use strict';

try { require('dotenv').config(); } catch (e) { /* dotenv optional */ }

const argv = process.argv.slice(2);
const opt = (name, dflt) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : dflt;
};
const MODES = ['sequence', 'flood', 'landslide', 'fire', 'pollution', 'storm', 'calm'];
const MODE = argv.find((a) => MODES.includes(a)) || 'sequence';

const BASE_URL = (opt('url', process.env.BHOOMI_API_URL || 'http://localhost:5000')).replace(/\/+$/, '');
const API_URL = BASE_URL + '/api/sensors/ingest';
const API_KEY = process.env.SENSOR_API_KEY || opt('key', '');
const SPEED = Math.min(10, Math.max(0.25, Number(opt('speed', '1')) || 1));
const TICK_MS = Math.round(4000 / SPEED);

const BASE_LAT = Number(opt('lat', process.env.NODE_LAT || 21.1524));
const BASE_LNG = Number(opt('lng', process.env.NODE_LNG || 79.0805));
const LOCATION_LABEL = opt('label', process.env.NODE_LABEL || 'Nagpur, Maharashtra');

const C = { r: '\x1b[31m', g: '\x1b[32m', y: '\x1b[33m', b: '\x1b[34m', m: '\x1b[35m', c: '\x1b[36m', x: '\x1b[0m', bg: '\x1b[41m\x1b[37m' };
const paint = (col, t) => `${col}${t}${C.x}`;

if (!API_KEY) {
  console.error(paint(C.r, '❌ SENSOR_API_KEY nahi mila.'));
  console.error('   .env mein SENSOR_API_KEY=<random> daalo (server restart karo) ya: node iot-simulator.js --key=<key>');
  console.error('   Key banane ke liye: node -e "console.log(require(\'crypto\').randomBytes(24).toString(\'hex\'))"');
  process.exit(1);
}

// ─── Nodes: har node thoda alag jagah (≈1-2 km) ───
const NODES = {
  jalNode: { deviceId: 'ESP32_JAL_01', dLat: 0, dLng: 0, label: `${LOCATION_LABEL} — River Gauge` },
  bhumiNode: { deviceId: 'ESP32S3_BHUMI_02', dLat: 0.0176, dLng: 0.0095, label: `${LOCATION_LABEL} — Hill Slope` },
  vanNode: { deviceId: 'ESP32_VAN_03', dLat: -0.0124, dLng: -0.0105, label: `${LOCATION_LABEL} — Forest Belt` },
  vayuNode: { deviceId: 'LORA_VAYU_04', dLat: -0.0066, dLng: 0.0077, label: `${LOCATION_LABEL} — Street Node` }
};

const BASE = () => ({
  jal: { waterLevel: 60, rainfallRate: 4 },
  bhumi: { slopeTilt: 0.3, vibration: 4 },
  van: { temperature: 28, humidity: 70, co: 6 },
  vayu: { pm25: 42, pm10: 78, gasIndex: 90 }
});
let S = BASE();
const jitter = (amp) => (Math.random() - 0.5) * 2 * amp;
const r1 = (n) => Math.round(n * 10) / 10;

// ─── Scenarios: har tick par state ko aage badhate hain; true = scenario khatam ───
const scenarios = {
  calm(t) {
    S.jal.waterLevel = 60 + jitter(3); S.jal.rainfallRate = 4 + jitter(1);
    S.bhumi.slopeTilt = 0.3 + jitter(0.05); S.bhumi.vibration = 4 + jitter(1);
    S.van.temperature = 28 + jitter(0.4); S.van.humidity = 70 + jitter(2); S.van.co = 6 + jitter(1);
    S.vayu.pm25 = 42 + jitter(4); S.vayu.pm10 = 78 + jitter(5);
    return t >= 5;
  },
  flood(t) {
    // Heavy rain: paani ek steady rate se chadhta hai → trend detect → PREDICTED → SEVERE
    const peak = 335;
    if (S.jal._receding) {
      S.jal.waterLevel = Math.max(60, S.jal.waterLevel - 28); S.jal.rainfallRate = Math.max(4, S.jal.rainfallRate - 20);
      return S.jal.waterLevel <= 60;
    }
    S.jal.waterLevel += 9 + jitter(1.2);
    S.jal.rainfallRate = Math.min(160, 20 + t * 4);
    if (S.jal.waterLevel >= peak) { S.jal.waterLevel = peak; S.jal._hold = (S.jal._hold || 0) + 1; if (S.jal._hold > 3) S.jal._receding = true; }
    return false;
  },
  landslide(t) {
    if (S.bhumi._receding) {
      S.bhumi.slopeTilt = Math.max(0.3, S.bhumi.slopeTilt - 0.5); S.bhumi.vibration = Math.max(4, S.bhumi.vibration - 6);
      return S.bhumi.slopeTilt <= 0.3;
    }
    S.bhumi.slopeTilt += 0.13 + jitter(0.02);
    S.bhumi.vibration = Math.min(70, 4 + t * 2.2);
    if (S.bhumi.slopeTilt >= 3.4) { S.bhumi._hold = (S.bhumi._hold || 0) + 1; if (S.bhumi._hold > 3) S.bhumi._receding = true; }
    return false;
  },
  fire(t) {
    // Garmi + dhuaan: temp aur CO dono badhte hain; SEVERE ke liye dono threshold cross honi chahiye
    if (S.van._receding) {
      S.van.temperature = Math.max(28, S.van.temperature - 2.5); S.van.co = Math.max(6, S.van.co - 7);
      S.van.humidity = Math.min(70, S.van.humidity + 4); S.vayu.pm25 = Math.max(42, S.vayu.pm25 - 25);
      return S.van.temperature <= 28 && S.van.co <= 6;
    }
    S.van.temperature += 1.3 + jitter(0.15);
    S.van.co += 3.6 + jitter(0.4);
    S.van.humidity = Math.max(12, S.van.humidity - 3);
    S.vayu.pm25 = Math.min(420, S.vayu.pm25 + 12);             // dhuaan Vayu node par bhi dikhta hai
    S.vayu.pm10 = Math.min(600, S.vayu.pm10 + 16);
    if (S.van.temperature >= 50 && S.van.co >= 78) { S.van._hold = (S.van._hold || 0) + 1; if (S.van._hold > 3) S.van._receding = true; }
    return false;
  },
  pollution(t) {
    // Sirf air quality — advisory, siren/SMS nahi bajna chahiye
    S.vayu.pm25 = Math.min(300, 42 + t * 14); S.vayu.pm10 = Math.min(480, 78 + t * 20);
    S.vayu.gasIndex = Math.min(400, 90 + t * 9);
    return t >= 26;
  }
};

const SEQUENCE = ['calm', 'flood', 'landslide', 'fire'];
let seqIdx = 0, stageTick = 0, active = MODE === 'sequence' ? [SEQUENCE[0]] : MODE === 'storm' ? ['flood', 'landslide', 'fire'] : [MODE];
const doneSet = new Set();

function advance() {
  stageTick++;
  const finished = [];
  for (const name of active) {
    if (scenarios[name](stageTick)) finished.push(name);
  }
  if (!finished.length) return;
  finished.forEach((n) => doneSet.add(n));
  if (MODE === 'sequence') {
    seqIdx = (seqIdx + 1) % SEQUENCE.length;
    active = [SEQUENCE[seqIdx]];
    if (seqIdx === 0) { S = BASE(); console.log(paint(C.g, '\n🔄 Scenario loop dobara shuru — sab sensors normal\n')); }
  } else if (MODE === 'storm') {
    if (['flood', 'landslide', 'fire'].every((n) => doneSet.has(n))) { S = BASE(); doneSet.clear(); console.log(paint(C.g, '\n🔄 Storm loop reset\n')); }
    active = active.filter((n) => !finished.includes(n)); if (!active.length) active = ['flood', 'landslide', 'fire'];
  } else if (MODE === 'calm' || MODE === 'pollution') {
    S = BASE(); active = [MODE];
  } else {
    S = BASE(); active = [MODE];
  }
  stageTick = 0;
  // naya scenario shuru hone par private flags saaf
  Object.values(S).forEach((o) => { delete o._receding; delete o._hold; });
}

// ─── Payloads (server /api/sensors/ingest ka exact format) ───
function payloads() {
  const loc = (n) => ({ lat: r1000(BASE_LAT + NODES[n].dLat), lng: r1000(BASE_LNG + NODES[n].dLng), label: NODES[n].label });
  return [
    { nodeId: 'jalNode', deviceId: NODES.jalNode.deviceId, location: loc('jalNode'),
      data: { waterLevel: Math.round(S.jal.waterLevel), rainfallRate: r1(S.jal.rainfallRate) } },
    { nodeId: 'bhumiNode', deviceId: NODES.bhumiNode.deviceId, location: loc('bhumiNode'),
      data: { slopeTilt: Math.round(S.bhumi.slopeTilt * 100) / 100, vibration: Math.round(S.bhumi.vibration) } },
    { nodeId: 'vanNode', deviceId: NODES.vanNode.deviceId, location: loc('vanNode'),
      data: { temperature: r1(S.van.temperature), humidity: Math.round(S.van.humidity), co: Math.round(S.van.co) } },
    { nodeId: 'vayuNode', deviceId: NODES.vayuNode.deviceId, location: loc('vayuNode'),
      data: { pm25: Math.round(S.vayu.pm25), pm10: Math.round(S.vayu.pm10), gasIndex: Math.round(S.vayu.gasIndex) } }
  ];
}
function r1000(n) { return Math.round(n * 100000) / 100000; }

const RISK_COL = { LOW: C.g, MODERATE: C.y, HIGH: C.m, SEVERE: C.r };
const ICON = { jalNode: '🌊', bhumiNode: '⛰️ ', vanNode: '🔥', vayuNode: '🌫️ ' };
const lastAlertKey = {};

async function post(p) {
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
      body: JSON.stringify(p),
      signal: AbortSignal.timeout(8000)
    });
    const j = await res.json().catch(() => ({}));
    if (res.status === 401 || res.status === 403) {
      console.error(paint(C.r, `❌ ${res.status} Unauthorized — SENSOR_API_KEY server ke .env se match nahi karti (server restart kiya?)`));
      return;
    }
    if (!res.ok || !j.ok) {
      console.error(paint(C.r, `❌ ${p.nodeId}: ${res.status} ${j.error || 'rejected'}`));
      return;
    }
    const st = j.state || {};
    const vals = Object.entries(p.data).map(([k, v]) => `${k}=${v}`).join(' ');
    const eta = st.prediction && st.prediction.etaToSevereMin != null && st.prediction.etaToSevereMin > 0
      ? paint(C.c, ` ⏱ ETA ${st.prediction.etaToSevereMin}m`) : '';
    console.log(`${ICON[p.nodeId] || '📡'} ${p.nodeId.padEnd(9)} ${paint(RISK_COL[st.risk] || C.x, (st.risk || '?').padEnd(8))} ${vals}${eta}`);

    if (st.alert && st.alert.triggered) {
      const key = p.nodeId + st.alert.kind;
      if (lastAlertKey[p.nodeId] !== key) {
        lastAlertKey[p.nodeId] = key;
        const banner = st.alert.kind === 'PREDICTED' ? '⚠️  PREDICTED ALERT REQUESTED' : '🚨 SEVERE ALERT REQUESTED';
        console.log(paint(st.alert.kind === 'PREDICTED' ? C.y : C.bg, `   ${banner} — ${p.nodeId}, radius ${st.alert.radiusKm} km`));
        await showSiren();
      }
    } else if (st.alert && st.alert.advisory) {
      console.log(paint(C.m, `   ℹ️  ${p.nodeId}: air quality SEVERE — advisory record hua (siren/SMS nahi)`));
    }
    if (st.risk === 'LOW' && lastAlertKey[p.nodeId]) delete lastAlertKey[p.nodeId];
  } catch (err) {
    console.error(paint(C.r, `❌ Server se connect nahi hua (${BASE_URL}) — node server.js chalu hai?`));
  }
}

async function showSiren() {
  try {
    const r = await fetch(BASE_URL + '/api/siren/status', { signal: AbortSignal.timeout(4000) });
    const s = await r.json();
    console.log(paint(C.c, `   📣 Siren status: ${s.alertActive ? 'ACTIVE' : 'inactive'} | connected phones: ${s.connectedDevices}`));
  } catch (e) { /* best effort */ }
}

console.log(paint(C.c, '═══════════════════════════════════════════════════════'));
console.log(paint(C.g, '🚀 BhoomiSuraksha — Virtual ESP32 Simulator v2'));
console.log(paint(C.c, '═══════════════════════════════════════════════════════'));
console.log(`Mode      : ${MODE}   | Tick: ${TICK_MS} ms (speed ${SPEED}x)`);
console.log(`Endpoint  : ${API_URL}`);
console.log(`Location  : ${BASE_LAT}, ${BASE_LNG} (${LOCATION_LABEL})`);
console.log('Stop      : CTRL + C\n');

let busy = false;
async function tick() {
  if (busy) return;
  busy = true;
  try {
    advance();
    console.log(paint(C.b, `── ${new Date().toLocaleTimeString('en-IN')} • scenario: ${active.join('+')} (t=${stageTick}) ──`));
    for (const p of payloads()) await post(p);
  } finally { busy = false; }
}
tick();
setInterval(tick, TICK_MS);
process.on('SIGINT', () => { console.log('\n👋 Simulator band.'); process.exit(0); });
