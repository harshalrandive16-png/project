// liveData.js — real-time disaster data (no API keys needed)
// server.js mein:  app.use('/api', require('./liveData'));
// Node 18+ chahiye (global fetch).

const express = require('express');
const router = express.Router();

// ---------- cache (5 min) ----------
const cache = {};
async function cached(key, ttlMs, fn) {
  const hit = cache[key];
  if (hit && Date.now() - hit.t < ttlMs) return hit.v;
  try {
    const v = await fn();
    cache[key] = { t: Date.now(), v };
    return v;
  } catch (e) {
    console.error(`[liveData:${key}]`, e.message);
    return hit ? hit.v : [];   // purana data de do, fake nahi
  }
}

const getJSON = async (url) => {
  const r = await fetch(url, { headers: { 'User-Agent': 'BhoomiSuraksha/1.0' } });
  if (!r.ok) throw new Error(`${url} -> ${r.status}`);
  return r.json();
};

// ---------- sources ----------
// 1) USGS earthquakes (India region, last 7 days, M3+)
async function fetchQuakes() {
  const start = new Date(Date.now() - 7 * 864e5).toISOString();
  const url = 'https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson'
    + '&minlatitude=6&maxlatitude=37.5&minlongitude=68&maxlongitude=98'
    + `&minmagnitude=3&orderby=time&starttime=${start}`;
  const d = await getJSON(url);
  return d.features.map(f => ({
    id: 'usgs-' + f.id,
    type: 'earthquake',
    title: `M${f.properties.mag} Earthquake — ${f.properties.place}`,
    severity: f.properties.mag >= 5.5 ? 'severe' : f.properties.mag >= 4.5 ? 'high' : 'moderate',
    lat: f.geometry.coordinates[1],
    lon: f.geometry.coordinates[0],
    occurredAt: new Date(f.properties.time).toISOString(),
    source: 'USGS',
    url: f.properties.url
  }));
}

// 2) NASA EONET (floods, storms, wildfires, volcanoes, landslides…)
async function fetchEonet() {
  const url = 'https://eonet.gsfc.nasa.gov/api/v3/events?status=all&days=14&bbox=68,37.5,98,6';
  const d = await getJSON(url);
  return d.events.map(e => {
    const g = e.geometry[e.geometry.length - 1];       // latest position
    const first = e.geometry[0];
    const cat = (e.categories[0] && e.categories[0].id) || 'other';
    return {
      id: 'eonet-' + e.id,
      type: cat,                                        // floods, severeStorms, wildfires...
      title: e.title,
      severity: ['severeStorms', 'floods', 'volcanoes'].includes(cat) ? 'high' : 'moderate',
      lat: g.coordinates[1],
      lon: g.coordinates[0],
      occurredAt: new Date(first.date).toISOString(),   // kab shuru hua
      updatedAt: new Date(g.date).toISOString(),
      source: 'NASA EONET',
      url: (e.sources[0] && e.sources[0].url) || e.link
    };
  });
}

// 3) ReliefWeb news (India disasters) — appname registered hona chahiye (free)
//    https://apidoc.reliefweb.int/ -> appname env mein RELIEFWEB_APPNAME
async function fetchNews() {
  const app = process.env.RELIEFWEB_APPNAME;
  if (!app) return [];
  const url = `https://api.reliefweb.int/v1/reports?appname=${app}`
    + '&filter[field]=country.name&filter[value]=India'
    + '&sort[]=date.original:desc&limit=15&fields[include][]=title&fields[include][]=date.original&fields[include][]=url_alias&fields[include][]=source.name';
  const d = await getJSON(url);
  return d.data.map(r => ({
    id: 'rw-' + r.id,
    title: r.fields.title,
    publishedAt: r.fields.date.original,
    source: (r.fields.source && r.fields.source[0] && r.fields.source[0].name) || 'ReliefWeb',
    url: r.fields.url_alias
  }));
}

async function allEvents() {
  return cached('events', 5 * 60 * 1000, async () => {
    const [q, e] = await Promise.allSettled([fetchQuakes(), fetchEonet()]);
    const list = [...(q.value || []), ...(e.value || [])];
    return list.sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt));
  });
}

// ---------- helpers ----------
function km(a, b) {
  const R = 6371, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const x = Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

// ---------- routes ----------

// Live Alerts Feed
router.get('/live/alerts', async (req, res) => {
  const hours = Math.min(parseInt(req.query.hours) || 72, 24 * 14);
  const cutoff = Date.now() - hours * 3600e3;
  const events = (await allEvents()).filter(e => new Date(e.occurredAt) >= cutoff);
  res.json({ updatedAt: new Date().toISOString(), count: events.length, alerts: events });
});

// Recent disasters + live news (time ke saath)
router.get('/live/news', async (req, res) => {
  const news = await cached('news', 10 * 60 * 1000, fetchNews);
  res.json({ updatedAt: new Date().toISOString(), news });
});

// Highway Status — sirf disaster-impact, traffic nahi (neeche note dekho)
const HIGHWAYS = [
  { name: 'NH44 (Srinagar–Kanyakumari)', pts: [[34.08,74.8],[28.6,77.2],[23.2,77.4],[21.15,79.09],[17.4,78.5],[12.97,77.6],[8.09,77.55]] },
  { name: 'NH48 (Delhi–Mumbai–Chennai)', pts: [[28.6,77.2],[26.9,75.8],[23.0,72.6],[19.07,72.87],[18.5,73.85],[12.97,77.6],[13.08,80.27]] },
  { name: 'NH19 (Delhi–Kolkata)', pts: [[28.6,77.2],[27.17,78.0],[25.43,81.84],[25.6,85.1],[23.8,86.4],[22.57,88.36]] },
  { name: 'NH58 (Delhi–Badrinath)', pts: [[28.98,77.7],[29.95,78.16],[30.3,78.0],[30.74,79.49]] },
  { name: 'NH66 (Mumbai–Kanyakumari, coastal)', pts: [[19.07,72.87],[15.5,73.83],[12.9,74.85],[10.0,76.3],[8.09,77.55]] },
  { name: 'NH27 (East–West Corridor)', pts: [[31.6,74.9],[26.4,80.3],[26.15,91.7],[24.8,93.9]] }
];

router.get('/live/highways', async (req, res) => {
  const events = (await allEvents()).filter(e =>
    Date.now() - new Date(e.occurredAt) < 3 * 864e5);       // last 72h
  const out = HIGHWAYS.map(h => {
    const near = events.filter(ev =>
      h.pts.some(([lat, lon]) => km({ lat, lon }, ev) <= 60));
    const worst = near.find(n => n.severity === 'severe') ? 'danger'
      : near.length ? 'caution' : 'clear';
    return {
      name: h.name,
      status: worst,                                         // clear / caution / danger
      reason: near.length ? near.map(n => n.title).slice(0, 3) : [],
      lastIncidentAt: near[0] ? near[0].occurredAt : null
    };
  });
  res.json({
    updatedAt: new Date().toISOString(),
    note: 'Status disaster events (earthquake/flood/storm) ke 60 km ke andar hone par based hai; live traffic/road-closure data nahi.',
    highways: out
  });
});

// National Risk Ranking — state centroid ke 250 km ke andar ke events ka weighted score
const STATES = {
  'Uttarakhand':[30.07,79.02],'Himachal Pradesh':[31.9,77.2],'Jammu & Kashmir':[33.8,76.6],
  'Assam':[26.2,92.9],'Arunachal Pradesh':[28.2,94.7],'Manipur':[24.8,93.9],'Sikkim':[27.5,88.5],
  'West Bengal':[23.0,87.9],'Odisha':[20.5,84.4],'Andhra Pradesh':[15.9,79.7],'Tamil Nadu':[11.1,78.7],
  'Kerala':[10.5,76.3],'Karnataka':[15.3,75.7],'Maharashtra':[19.7,75.7],'Gujarat':[22.3,71.7],
  'Rajasthan':[27.0,74.2],'Punjab':[31.1,75.3],'Haryana':[29.1,76.1],'Delhi':[28.6,77.2],
  'Uttar Pradesh':[26.8,80.9],'Bihar':[25.6,85.6],'Madhya Pradesh':[23.5,78.5],'Chhattisgarh':[21.3,81.8],
  'Jharkhand':[23.6,85.3],'Telangana':[17.9,79.1]
};
const W = { severe: 10, high: 5, moderate: 2 };

router.get('/live/risk-ranking', async (req, res) => {
  const events = await allEvents();
  const rank = Object.entries(STATES).map(([state, [lat, lon]]) => {
    let score = 0, count = 0;
    for (const ev of events) {
      if (km({ lat, lon }, ev) > 250) continue;
      const ageDays = (Date.now() - new Date(ev.occurredAt)) / 864e5;
      score += (W[ev.severity] || 1) * Math.exp(-ageDays / 4);   // purane events ka weight kam
      count++;
    }
    return { state, score: Math.round(score * 10) / 10, activeEvents: count };
  }).filter(s => s.score > 0).sort((a, b) => b.score - a.score);
  rank.forEach((r, i) => (r.rank = i + 1));
  res.json({ updatedAt: new Date().toISOString(), ranking: rank.slice(0, 10) });
});

// ====================================================================
// /api/live-feed  — dashboard.js (v6) ka expected format: { alerts, roads, ranking }
// ====================================================================
const decode = t => t.replace(/<!\[CDATA\[|\]\]>/g, '')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();

async function googleNews(query) {
  const url = 'https://news.google.com/rss/search?hl=en-IN&gl=IN&ceid=IN:en&q=' + encodeURIComponent(query);
  const r = await fetch(url, { headers: { 'User-Agent': 'BhoomiSuraksha/1.0' } });
  if (!r.ok) throw new Error('news ' + r.status);
  const xml = await r.text();
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => m[1]);
  const pick = (blk, tag) => { const x = blk.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`)); return x ? decode(x[1]) : ''; };
  return items.map(b => ({
    title: pick(b, 'title'),
    url: pick(b, 'link'),
    ts: new Date(pick(b, 'pubDate')).getTime(),
    source: pick(b, 'source') || 'Google News'
  })).filter(n => n.title && !isNaN(n.ts));
}

const levelOf = sev => ({ severe: 'severe', high: 'high', moderate: 'moderate' }[sev] || 'low');

router.get('/live-feed', async (req, res) => {
  const events = await allEvents();
  const now = Date.now();

  // ---- alerts: sensor/satellite events (+ ReliefWeb news agar appname set hai)
  const alerts = events.slice(0, 40).map(e => ({
    title: e.title, hazard: e.type, state: '', level: levelOf(e.severity),
    ts: new Date(e.occurredAt).getTime(), source: e.source, url: e.url
  }));

  // ---- roads: highway blockage news (real headlines, real publish time)
  const roadNews = await cached('roadnews', 10 * 60 * 1000, () =>
    googleNews('(highway OR "NH") (blocked OR closed OR landslide OR waterlogged) India when:3d'));
  const roads = roadNews
    .filter(n => /\bNH[-\s]?\d+[A-Z]?\b|highway/i.test(n.title))
    .slice(0, 12)
    .map(n => {
      const code = (n.title.match(/\bNH[-\s]?\d+[A-Z]?\b/i) || ['Highway'])[0].toUpperCase().replace(/\s/, '-');
      const blocked = /block|closed|shut|washed|cut off|stranded/i.test(n.title);
      return { code, status: blocked ? 'BLOCKED' : 'CAUTION', level: blocked ? 'severe' : 'moderate',
               title: n.title, url: n.url, ts: n.ts, source: n.source };
    });

  // ---- ranking: state-wise score 0-100
  const ranking = Object.entries(STATES).map(([name, [lat, lng]]) => {
    let raw = 0, reports = 0, latest = 0; const hz = {};
    for (const ev of events) {
      if (km({ lat, lon: lng }, ev) > 250) continue;
      const t = new Date(ev.occurredAt).getTime();
      raw += (W[ev.severity] || 1) * Math.exp(-((now - t) / 864e5) / 4);
      reports++; latest = Math.max(latest, t); hz[ev.type] = (hz[ev.type] || 0) + 1;
    }
    const score = Math.min(100, Math.round(raw * 8));
    const hazard = Object.entries(hz).sort((a, b) => b[1] - a[1])[0];
    return { name, hazard: hazard ? hazard[0] : 'none', reports, ts: latest, lat, lng, score,
             level: score >= 70 ? 'SEVERE' : score >= 40 ? 'HIGH' : score >= 15 ? 'MODERATE' : 'LOW' };
  }).filter(z => z.reports > 0).sort((a, b) => b.score - a.score).slice(0, 10);

  res.json({ updatedAt: new Date().toISOString(), alerts, roads, ranking });
});

module.exports = router;
