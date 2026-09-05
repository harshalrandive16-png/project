// =========================================
// BhoomiSuraksha Alerts – Pan-India Multi-Disaster
// =========================================

let alertsData = [
  {
    id: 'ALT-KL-001',
    title: 'Wayanad Belt',
    district: 'Wayanad',
    state: 'Kerala',
    type: 'Landslide',
    level: 'severe',
    levelText: 'Severe Risk',
    updated: '12 mins ago',
    desc: 'AI model indicates severe slope failure risk after 142mm rainfall. Debris flow possible on hill roads. Evacuation advisory for vulnerable settlements.',
    metricName: 'Rainfall',
    metricVal: '142 mm/24h',
    stat2Name: 'Soil Saturation',
    stat2Val: '94%',
    stat3Name: 'AI Hazard Index',
    stat3Val: '8.9 / 10',
    stat4Name: 'Geofence SMS',
    stat4Val: '3,840 people',
    score: 89,
    smsDispatched: '3,840 residents (5–10 km)',
    authority: 'Kerala SDMA + NDRF alerted'
  },
  {
    id: 'ALT-OD-014',
    title: 'Puri–Konark Coast',
    district: 'Puri',
    state: 'Odisha',
    type: 'Cyclone',
    level: 'severe',
    levelText: 'Severe Risk',
    updated: '28 mins ago',
    desc: 'Cyclonic winds and storm surge risk along coastal belt. Fishermen advised not to venture into sea. Relief shelters on standby.',
    metricName: 'Wind Speed',
    metricVal: '110 km/h',
    stat2Name: 'Storm Surge',
    stat2Val: '1.8 m',
    stat3Name: 'AI Hazard Index',
    stat3Val: '8.4 / 10',
    stat4Name: 'Geofence SMS',
    stat4Val: '12,500 people',
    score: 84,
    smsDispatched: '12,500 residents (coastal belt)',
    authority: 'Odisha OSDMA + Coast Guard'
  },
  {
    id: 'ALT-AS-022',
    title: 'Guwahati Corridor',
    district: 'Kamrup Metro',
    state: 'Assam',
    type: 'Flood',
    level: 'high',
    levelText: 'High Risk',
    updated: '45 mins ago',
    desc: 'Brahmaputra water level rising. Low-lying areas may face inundation in next 12–18 hours. Traffic restrictions likely on key urban roads.',
    metricName: 'Water Level',
    metricVal: '+0.6 m rising',
    stat2Name: 'Rainfall',
    stat2Val: '98 mm/24h',
    stat3Name: 'AI Hazard Index',
    stat3Val: '7.1 / 10',
    stat4Name: 'Geofence SMS',
    stat4Val: '8,200 people',
    score: 71,
    smsDispatched: '8,200 residents',
    authority: 'Assam SDMA notified'
  },
  {
    id: 'ALT-MH-031',
    title: 'Mumbai Coastal',
    district: 'Mumbai Suburban',
    state: 'Maharashtra',
    type: 'Flood',
    level: 'high',
    levelText: 'High Risk',
    updated: '1 hour ago',
    desc: 'Heavy rain and poor drainage may cause urban flooding. Suburban local trains and low-lying roads under watch.',
    metricName: 'Rainfall',
    metricVal: '125 mm/24h',
    stat2Name: 'Drain Load',
    stat2Val: 'Critical',
    stat3Name: 'AI Hazard Index',
    stat3Val: '6.8 / 10',
    stat4Name: 'Geofence SMS',
    stat4Val: '15,000 people',
    score: 68,
    smsDispatched: '15,000 residents',
    authority: 'BMC Disaster Cell'
  },
  {
    id: 'ALT-UK-009',
    title: 'Joshimath Sector',
    district: 'Chamoli',
    state: 'Uttarakhand',
    type: 'Landslide',
    level: 'moderate',
    levelText: 'Moderate Watch',
    updated: '2 hours ago',
    desc: 'Ground movement sensors show elevated readings. Continuous monitoring active. Tourist movement advisory issued.',
    metricName: 'Displacement',
    metricVal: '4.2 mm/day',
    stat2Name: 'Rainfall',
    stat2Val: '40 mm/24h',
    stat3Name: 'AI Hazard Index',
    stat3Val: '4.6 / 10',
    stat4Name: 'Status',
    stat4Val: 'Monitoring',
    score: 46,
    smsDispatched: '1,100 residents',
    authority: 'Uttarakhand SDMA'
  },
  {
    id: 'ALT-DL-003',
    title: 'Delhi NCR Yamuna Belt',
    district: 'East Delhi',
    state: 'Delhi',
    type: 'Flood',
    level: 'low',
    levelText: 'Low / Watch',
    updated: '5 hours ago',
    desc: 'Yamuna level within watch band. No immediate overflow risk. Monitoring continues through night.',
    metricName: 'River Level',
    metricVal: 'Safe band',
    stat2Name: 'Rainfall',
    metricVal2: '18 mm/24h',
    stat2Val: '18 mm/24h',
    stat3Name: 'AI Hazard Index',
    stat3Val: '2.1 / 10',
    stat4Name: 'Road Status',
    stat4Val: 'Open',
    score: 21,
    smsDispatched: 'Advisory only',
    authority: 'Delhi DDMA'
  }
];

// fix accidental key if any
alertsData = alertsData.map(a => {
  if (a.metricVal2) delete a.metricVal2;
  return a;
});

let currentFilter = 'all';
let currentStateFilter = 'all';
let currentTypeFilter = 'all';

const levelStyles = {
  severe: {
    border: 'border-red-500/30',
    badge: 'severe',
    text: 'text-red',
    bar: 'bg-red'
  },
  high: {
    border: 'border-orange-500/30',
    badge: 'high',
    text: 'text-orange',
    bar: 'bg-orange'
  },
  moderate: {
    border: 'border-yellow-500/30',
    badge: 'moderate',
    text: 'text-yellow',
    bar: 'bg-yellow'
  },
  low: {
    border: 'border-emerald-500/20',
    badge: 'low',
    text: 'text-green',
    bar: 'bg-green'
  }
};

function renderAlerts(data) {
  const container = document.getElementById('alertsContainer');
  if (!container) return;
  container.innerHTML = '';

  if (!data.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🛡️</div>
        <div class="empty-title">No Active Alerts Found</div>
        <div class="empty-desc">Try changing disaster type, state or search filters.</div>
      </div>`;
    return;
  }

  data.forEach(item => {
    const card = document.createElement('div');
    card.className = `alert-card ${item.level}`;
    card.innerHTML = `
      <div class="alert-card-inner">
        <div class="alert-left">
          <div class="alert-meta-row">
            <span class="alert-badge ${item.level}">
              <span class="alert-badge-dot"></span> ${item.levelText}
            </span>
            <span class="alert-time">🕒 ${item.updated}</span>
            <span class="alert-id">#${item.id}</span>
            <span class="alert-id">${item.type}</span>
          </div>
          <div>
            <h2 class="alert-title">
              ${item.title}
              <span class="alert-title-sub">• ${item.district}, ${item.state}</span>
            </h2>
            <p class="alert-desc">${item.desc}</p>
          </div>
          <div class="alert-stats-grid">
            <div class="alert-stat">
              <div class="alert-stat-label">${item.metricName || 'Metric'}</div>
              <div class="alert-stat-value ${item.level}">${item.metricVal}</div>
            </div>
            <div class="alert-stat">
              <div class="alert-stat-label">${item.stat2Name}</div>
              <div class="alert-stat-value ${item.level}">${item.stat2Val}</div>
            </div>
            <div class="alert-stat">
              <div class="alert-stat-label">${item.stat3Name}</div>
              <div class="alert-stat-value ${item.level}">${item.stat3Val}</div>
            </div>
            <div class="alert-stat">
              <div class="alert-stat-label">${item.stat4Name}</div>
              <div class="alert-stat-value">${item.stat4Val}</div>
            </div>
          </div>
        </div>
        <div class="alert-right">
          <div class="alert-score-block">
            <div class="alert-score-header">
              <span class="alert-score-label">Threat Score</span>
              <span class="alert-score-value ${item.level}">${item.score}%</span>
            </div>
            <div class="alert-progress">
              <div class="alert-progress-bar ${item.level}" style="width:${item.score}%"></div>
            </div>
          </div>
          <div class="alert-info-list">
            <div class="alert-info-item">✅ SMS: ${item.smsDispatched}</div>
            <div class="alert-info-item">🛡️ ${item.authority}</div>
          </div>
          <div class="alert-actions">
            <button class="alert-btn alert-btn-broadcast ${item.level}" type="button"
              onclick="triggerToast('Re-broadcasting ${item.type} alert for ${item.title} (5–10 km)...')">
              📡 Re-Broadcast
            </button>
            <button class="alert-btn alert-btn-map" type="button"
              onclick="triggerToast('Opening GIS layer for ${item.title}...')">
              📍 Map
            </button>
          </div>
        </div>
      </div>`;
    container.appendChild(card);
  });

  const countEl = document.getElementById('totalAlertsCount');
  if (countEl) countEl.textContent = String(data.length).padStart(2, '0');
}

function applyFilters() {
  const q = (document.getElementById('searchInput')?.value || '').toLowerCase();
  const filtered = alertsData.filter(item => {
    const okLevel = currentFilter === 'all' || item.level === currentFilter;
    const okState = currentStateFilter === 'all' || item.state === currentStateFilter;
    const okType = currentTypeFilter === 'all' || item.type === currentTypeFilter;
    const okSearch =
      item.title.toLowerCase().includes(q) ||
      item.state.toLowerCase().includes(q) ||
      item.district.toLowerCase().includes(q) ||
      item.type.toLowerCase().includes(q) ||
      item.desc.toLowerCase().includes(q);
    return okLevel && okState && okType && okSearch;
  });
  renderAlerts(filtered);
}

function filterByLevel(level) {
  currentFilter = level;
  document.querySelectorAll('.filter-tab').forEach(btn => btn.classList.remove('active'));
  document.querySelector(`.filter-tab[data-level="${level}"]`)?.classList.add('active');
  applyFilters();
}

function handleSearch() { applyFilters(); }
function handleStateFilter() {
  currentStateFilter = document.getElementById('stateSelect').value;
  applyFilters();
}
function handleTypeFilter() {
  currentTypeFilter = document.getElementById('typeSelect').value;
  applyFilters();
}

function syncSensors() {
  const icon = document.getElementById('syncIcon');
  if (icon) icon.style.animation = 'spin 1s linear';
  if (!document.getElementById('spinKey')) {
    const s = document.createElement('style');
    s.id = 'spinKey';
    s.textContent = '@keyframes spin{to{transform:rotate(360deg)}}';
    document.head.appendChild(s);
  }
  setTimeout(() => {
    if (icon) icon.style.animation = '';
    triggerToast('National grid synced · IMD/CWC/IoT feeds updated');
  }, 900);
}

function openModal() {
  document.getElementById('broadcastModal')?.classList.remove('hidden');
}
function closeModal() {
  document.getElementById('broadcastModal')?.classList.add('hidden');
}

function submitBroadcast(e) {
  e.preventDefault();
  const zone = document.getElementById('modalZone').value.trim();
  const type = document.getElementById('modalType').value;
  const severity = document.getElementById('modalSeverity').value;
  const metric = document.getElementById('modalMetric').value.trim();
  const radius = document.getElementById('modalRadius').value;
  const msg = document.getElementById('modalMsg').value.trim();

  const scoreMap = { severe: 90, high: 72, moderate: 48, low: 22 };
  const parts = zone.split('-');
  const title = (parts[0] || zone).trim();
  const state = (parts[1] || 'India').trim();

  alertsData.unshift({
    id: 'ALT-IN-' + Math.floor(100 + Math.random() * 900),
    title,
    district: 'Target Sector',
    state,
    type,
    level: severity,
    levelText: severity.charAt(0).toUpperCase() + severity.slice(1) + ' Risk',
    updated: 'Just now',
    desc: msg,
    metricName: 'Key Metric',
    metricVal: metric,
    stat2Name: 'Geofence',
    stat2Val: radius === 'district' ? 'Full district' : radius + ' km',
    stat3Name: 'AI Hazard Index',
    stat3Val: (scoreMap[severity] / 10).toFixed(1) + ' / 10',
    stat4Name: 'Status',
    stat4Val: 'Broadcasted',
    score: scoreMap[severity],
    smsDispatched: 'Geofenced residents notified',
    authority: 'National Emergency Ops'
  });

  closeModal();
  e.target.reset();
  applyFilters();
  triggerToast(`${type} broadcast dispatched for ${title}`);

  const smsEl = document.getElementById('smsSentCount');
  if (smsEl) {
    const n = parseInt(String(smsEl.textContent).replace(/,/g, ''), 10) || 0;
    smsEl.textContent = (n + 2500).toLocaleString('en-IN');
  }
}

function triggerToast(message) {
  const toast = document.getElementById('toast');
  const msg = document.getElementById('toastMsg');
  if (!toast || !msg) return;
  msg.textContent = message;
  toast.classList.remove('toast-hidden');
  setTimeout(() => toast.classList.add('toast-hidden'), 3000);
}

document.addEventListener('click', (e) => {
  if (e.target.id === 'broadcastModal') closeModal();
});

document.addEventListener('DOMContentLoaded', () => {
  renderAlerts(alertsData);
});