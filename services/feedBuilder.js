// Fallback/demo data. Real feed na mile to ye use hoga.
const REGIONS = [
  { state: 'Assam',            hazard: 'Flood',     base: 90, lat: 26.2, lng: 92.9 },
  { state: 'Odisha',           hazard: 'Cyclone',   base: 84, lat: 20.3, lng: 85.8 },
  { state: 'Uttarakhand',      hazard: 'Landslide', base: 78, lat: 30.1, lng: 79.0 },
  { state: 'Bihar',            hazard: 'Flood',     base: 72, lat: 25.6, lng: 85.1 },
  { state: 'Himachal Pradesh', hazard: 'Landslide', base: 68, lat: 31.9, lng: 77.2 },
  { state: 'Gujarat',          hazard: 'Heatwave',  base: 64, lat: 23.0, lng: 72.6 },
  { state: 'West Bengal',      hazard: 'Cyclone',   base: 60, lat: 22.6, lng: 88.4 },
  { state: 'Maharashtra',      hazard: 'Flood',     base: 55, lat: 19.0, lng: 73.0 },
  { state: 'Kerala',           hazard: 'Flood',     base: 52, lat: 10.0, lng: 76.3 },
  { state: 'Tamil Nadu',       hazard: 'Cyclone',   base: 46, lat: 13.0, lng: 80.2 }
];

const HIGHWAYS = [
  { name: 'NH-37 (Assam)',              status: 'Closed',  reason: 'Waterlogging' },
  { name: 'NH-58 (Uttarakhand)',        status: 'Delayed', reason: 'Landslide debris' },
  { name: 'NH-44 (Nagpur - Hyderabad)', status: 'Open',    reason: '' },
  { name: 'NH-48 (Mumbai - Pune)',      status: 'Open',    reason: '' }
];

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const level = s => (s >= 80 ? 'high' : s >= 60 ? 'medium' : 'low');

function buildFeed() {
  const now = new Date().toISOString();

  const ranking = REGIONS.map(r => ({
    state: r.state, hazard: r.hazard, lat: r.lat, lng: r.lng,
    severity: clamp(Math.round(r.base + (Math.random() * 2 - 1) * 5), 0, 100)
  })).sort((a, b) => b.severity - a.severity);

  const hazards = ranking.map(r => [r.lat, r.lng, r.severity / 100]);

  const alerts = ranking.filter(r => r.severity >= 60).slice(0, 5).map(r => ({
    id: `${r.state}-${r.hazard}`,
    level: level(r.severity),
    title: `${r.hazard} ${r.severity >= 80 ? 'warning' : 'watch'} – ${r.state}`,
    time: now
  }));

  return { updatedAt: now, source: 'sample', ranking, alerts, highways: HIGHWAYS, hazards };
}

module.exports = { buildFeed };