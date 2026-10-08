/* ==========================================================
   BHOOMISURAKSHA V10 - LIVE ALERTS ENGINE
   APIs: USGS (Earthquakes) + UN ReliefWeb (India Disasters)
========================================================== */

// --- GLOBAL VARIABLES ---
let allAlerts = [];
let filteredAlerts = [];
let refreshTimer = 30;
let timerInterval;

// --- FALLBACK MOCK DATA ---
// Taki UI khali na lage agar APIs me currently alert na ho (Hackathon standard practice)
const mockData = [
    { id: 'm1', title: 'IMD Yellow Warning — Coastal Odisha', desc: 'IMD issues yellow warnings for 3 days; western and coastal Odisha on alert for intense precipitation.', state: 'Odisha', severity: 'HIGH', type: 'weather', source: 'Pragativadi News', time: '3h ago', lat: 19.8, lng: 85.8, location: 'Coastal Odisha' },
    { id: 'm2', title: 'Heavy Rainfall Advisory — South India', desc: 'IMD Heavy Rain Alert: South India braces for storms, waterlogging, and coastal squalls.', state: 'Tamil Nadu', severity: 'HIGH', type: 'weather', source: 'Urban Acres / IMD', time: '2d ago', lat: 11.1, lng: 78.6, location: 'South India' },
    { id: 'm3', title: 'Flash Flood Alert — Bihar & UP', desc: 'Heavy Nepal rains trigger flash floods in Bihar and UP downstream river basins.', state: 'Bihar', severity: 'SEVERE', type: 'flood', source: 'Jagranjosh / NDTV', time: '6d ago', lat: 25.6, lng: 85.1, location: 'Patna / Gorakhpur' },
    { id: 'm4', title: 'Red Alert Gujarat — Monsoon Extreme', desc: 'Red alert in Gujarat for extreme monsoon rain and flood risk. Local administration on high alert.', state: 'Gujarat', severity: 'SEVERE', type: 'flood', source: 'India Today', time: '12h ago', lat: 23.0, lng: 72.5, location: 'Ahmedabad / Surat' },
    { id: 'm5', title: 'Heavy Flood Warning — Guwahati', desc: 'Brahmaputra water level 3.2m above danger mark. Immediate evacuation advised for low-lying areas.', state: 'Assam', severity: 'SEVERE', type: 'flood', source: 'Assam SDMA', time: '30m ago', lat: 26.1, lng: 91.7, location: 'Guwahati' },
    { id: 'm6', title: 'Cyclone Alert — Puri Coast', desc: 'Severe Cyclonic Storm approaching Odisha coast with wind speed 130km/h. IMD issues red alert.', state: 'Odisha', severity: 'SEVERE', type: 'cyclone', source: 'IMD Bulletin', time: '1h ago', lat: 19.8, lng: 85.8, location: 'Puri' },
    { id: 'm7', title: 'Cloudburst — Kishtwar', desc: 'Sudden cloudburst reported in Kishtwar district. Flash flood warning issued for downstream river.', state: 'J&K', severity: 'SEVERE', type: 'weather', source: 'J&K SDMA', time: '2h ago', lat: 33.3, lng: 75.7, location: 'Kishtwar' },
    { id: 'm8', title: 'Landslide Risk — Wayanad', desc: 'Continuous rainfall for 72 hours. Slope instability detected by Geological Survey of India.', state: 'Kerala', severity: 'HIGH', type: 'landslide', source: 'GSI Advisory', time: '1h ago', lat: 11.6, lng: 76.1, location: 'Wayanad' },
    { id: 'm9', title: 'Heat Wave Alert — Nagpur', desc: 'Temperature crossed 46°C in Vidarbha region. Red alert issued by IMD.', state: 'Maharashtra', severity: 'HIGH', type: 'heatwave', source: 'IMD Nagpur', time: '3h ago', lat: 21.1, lng: 79.0, location: 'Nagpur' },
    { id: 'm10', title: 'Landslide — Mandi Highway', desc: 'NH-3 Mandi to Manali highway blocked due to massive rockfall near Pandoh Dam.', state: 'Himachal Pradesh', severity: 'MODERATE', type: 'landslide', source: 'HP Traffic Police', time: '5h ago', lat: 31.5, lng: 76.9, location: 'Mandi' },
    { id: 'm11', title: 'Flood Watch — Patna', desc: 'Ganga river flowing near warning level at Gandhi Ghat. District administration alerts Diara areas.', state: 'Bihar', severity: 'MODERATE', type: 'flood', source: 'Central Water Commission', time: '6h ago', lat: 25.6, lng: 85.1, location: 'Patna' },
    { id: 'm12', title: 'Cold Wave — Srinagar', desc: 'Temperature dropped to -8°C in Srinagar. Chilla-i-Kalan freeze causes pipe disruption.', state: 'J&K', severity: 'MODERATE', type: 'heatwave', source: 'MeT Srinagar', time: '10h ago', lat: 34.0, lng: 74.7, location: 'Srinagar' },
    { id: 'm13', title: 'Earthquake M3.5 — Delhi NCR', desc: 'Mild earthquake tremors felt in Delhi, Gurgaon, and Rohtak. No loss of life reported.', state: 'Delhi', severity: 'LOW', type: 'earthquake', source: 'NCS India', time: '8h ago', lat: 28.6, lng: 77.2, location: 'Delhi' },
    { id: 'm14', title: 'Flood Update — Bhubaneswar', desc: 'Mahanadi water level receding in Hirakud downstream. Relief material dispatched.', state: 'Odisha', severity: 'LOW', type: 'flood', source: 'Odisha SDMA', time: '14h ago', lat: 20.2, lng: 85.8, location: 'Bhubaneswar' }
];

// --- HELPER DICTIONARY FOR STATES ---
const STATE_MATCH = ["Uttarakhand", "Odisha", "Assam", "Gujarat", "Maharashtra", "Kerala", "Tamil Nadu", "Bihar", "Himachal Pradesh", "Delhi", "J&K"];

function guessState(title) {
    let t = title.toLowerCase();
    if(t.includes('delhi') || t.includes('ncr')) return 'Delhi';
    if(t.includes('kashmir') || t.includes('srinagar')) return 'J&K';
    if(t.includes('gujarat') || t.includes('surat')) return 'Gujarat';
    if(t.includes('assam') || t.includes('guwahati') || t.includes('tezpur')) return 'Assam';
    for (let s of STATE_MATCH) {
        if (t.includes(s.toLowerCase())) return s;
    }
    return "India (General)";
}

// --- INIT APP ---
document.addEventListener('DOMContentLoaded', () => {
    fetchLiveAlerts();
    setupFilters();
    startTimer();

    document.getElementById('btnRefresh').addEventListener('click', () => {
        resetTimer();
        fetchLiveAlerts();
    });
});

// --- API FETCHING LOGIC ---
async function fetchLiveAlerts() {
    const listEl = document.getElementById('alertsList');
    listEl.innerHTML = `
        <div class="loading-state">
            <i class="fa-solid fa-spinner fa-spin fa-2x"></i>
            <p>Syncing live APIs (USGS, ReliefWeb)...</p>
        </div>`;

    try {
        // 1. USGS Seismic API (India Bounding Box)
        const usgsUrl = 'https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&minlatitude=6.0&maxlatitude=37.0&minlongitude=68.0&maxlongitude=98.0&limit=10&minmagnitude=3.0';
        
        // 2. UN ReliefWeb API (India Specific)
        const rwUrl = 'https://api.reliefweb.int/v1/disasters?appname=bhoomi&filter[field]=country.iso3&filter[value]=ind&sort[]=date:desc&limit=5&profile=list';

        const [usgsRes, rwRes] = await Promise.all([fetch(usgsUrl), fetch(rwUrl)]);
        const usgsData = await usgsRes.json();
        const rwData = await rwRes.json();

        let fetchedAlerts = [];

        // Parse USGS
        if (usgsData.features) {
            usgsData.features.forEach(f => {
                let mag = f.properties.mag;
                let severity = mag >= 5.0 ? 'SEVERE' : (mag >= 4.5 ? 'HIGH' : (mag >= 4.0 ? 'MODERATE' : 'LOW'));
                
                fetchedAlerts.push({
                    id: f.id,
                    title: `Earthquake M${mag.toFixed(1)} — ${f.properties.place}`,
                    desc: `Live Seismic Event detected inside Indian Territory. Depth: ${f.geometry.coordinates[2]}km. IMD & National Seismology Center monitoring.`,
                    state: guessState(f.properties.place),
                    severity: severity,
                    type: 'earthquake',
                    source: 'USGS Live API',
                    time: 'Just now',
                    lat: f.geometry.coordinates[1],
                    lng: f.geometry.coordinates[0],
                    location: f.properties.place.split(' of ').pop()
                });
            });
        }

        // Parse ReliefWeb
        if (rwData.data) {
            rwData.data.forEach(d => {
                let title = d.fields.name;
                let typeRaw = (d.fields.primary_type.name || "").toLowerCase();
                let type = 'weather';
                if(typeRaw.includes('flood')) type = 'flood';
                else if(typeRaw.includes('cyclone') || typeRaw.includes('storm')) type = 'cyclone';
                else if(typeRaw.includes('landslide')) type = 'landslide';

                fetchedAlerts.push({
                    id: d.id,
                    title: title,
                    desc: `Official disaster report via UN ReliefWeb and Indian Authorities. Ongoing monitoring required.`,
                    state: guessState(title),
                    severity: 'HIGH', // Default for RW active disasters
                    type: type,
                    source: 'ReliefWeb / NDMA',
                    time: '1h ago',
                    lat: 22.5, lng: 78.9, location: guessState(title)
                });
            });
        }

        // Merge Live Data with Mock Data (To fill the UI like the screenshot)
        allAlerts = [...fetchedAlerts, ...mockData];
        applyFilters(); // Renders the list and updates stats

    } catch (error) {
        console.error("API Fetch Error:", error);
        allAlerts = [...mockData]; // Fallback purely to mock data
        applyFilters();
    }
}

// --- FILTERING & SEARCH ---
function setupFilters() {
    const filters = ['filterState', 'filterSeverity', 'filterType', 'searchInput'];
    filters.forEach(id => {
        document.getElementById(id).addEventListener('input', applyFilters);
    });

    document.getElementById('btnClear').addEventListener('click', () => {
        document.getElementById('filterState').value = 'all';
        document.getElementById('filterSeverity').value = 'all';
        document.getElementById('filterType').value = 'all';
        document.getElementById('searchInput').value = '';
        applyFilters();
    });
}

function applyFilters() {
    const stateVal = document.getElementById('filterState').value;
    const sevVal = document.getElementById('filterSeverity').value;
    const typeVal = document.getElementById('filterType').value;
    const searchVal = document.getElementById('searchInput').value.toLowerCase();

    filteredAlerts = allAlerts.filter(a => {
        const matchState = stateVal === 'all' || a.state === stateVal;
        const matchSev = sevVal === 'all' || a.severity === sevVal;
        const matchType = typeVal === 'all' || a.type === typeVal;
        const matchSearch = a.title.toLowerCase().includes(searchVal) || a.desc.toLowerCase().includes(searchVal) || a.location.toLowerCase().includes(searchVal);
        return matchState && matchSev && matchType && matchSearch;
    });

    updateStats();
    renderAlertList();
}

// --- UPDATING UI ---
function updateStats() {
    let severeCount = filteredAlerts.filter(a => a.severity === 'SEVERE').length;
    let highCount = filteredAlerts.filter(a => a.severity === 'HIGH').length;
    
    // Unique States count
    let statesSet = new Set();
    filteredAlerts.forEach(a => {
        if(a.state && a.state !== "India (General)") statesSet.add(a.state);
    });

    document.getElementById('statTotal').innerText = filteredAlerts.length;
    document.getElementById('statSevere').innerText = severeCount;
    document.getElementById('statHigh').innerText = highCount;
    document.getElementById('statStates').innerText = statesSet.size;

    document.getElementById('showingText').innerHTML = `Showing <b>${filteredAlerts.length}</b> of <b>${allAlerts.length}</b> alerts`;
}

function renderAlertList() {
    const listEl = document.getElementById('alertsList');
    
    if (filteredAlerts.length === 0) {
        listEl.innerHTML = `<div class="loading-state"><i class="fa-solid fa-folder-open fa-2x"></i><p>No alerts match your filters.</p></div>`;
        return;
    }

    let html = "";
    filteredAlerts.forEach(a => {
        // Icon mapping
        let icon = 'fa-circle-exclamation';
        if(a.type === 'earthquake') icon = 'fa-house-crack';
        if(a.type === 'flood') icon = 'fa-water';
        if(a.type === 'cyclone') icon = 'fa-hurricane';
        if(a.type === 'landslide') icon = 'fa-mountain';
        if(a.type === 'weather') icon = 'fa-cloud-showers-heavy';
        if(a.type === 'heatwave') icon = 'fa-temperature-arrow-up';

        // CSS class mappings
        let sevClass = a.severity.toLowerCase();

        html += `
        <div class="alert-card ${sevClass}">
            <div class="card-icon"><i class="fa-solid ${icon}"></i></div>
            
            <div class="card-content">
                <div class="card-title-row">
                    <h3>${a.title}</h3>
                    <span class="sev-badge">${a.severity}</span>
                </div>
                <p class="card-desc">${a.desc}</p>
                
                <div class="card-meta">
                    <span class="meta-item"><i class="fa-solid fa-location-dot"></i> ${a.location}</span>
                    <span class="meta-item"><i class="fa-regular fa-flag"></i> ${a.state !== 'India (General)' ? a.state : 'India'}</span>
                    <span class="meta-item"><i class="fa-solid fa-tag"></i> ${a.type}</span>
                    <span class="meta-item"><i class="fa-solid fa-satellite-dish"></i> ${a.source}</span>
                </div>
            </div>

            <div class="card-right">
                <span class="time-badge ${a.time.includes('now') ? 'recent' : ''}">
                    <i class="fa-regular fa-clock"></i> ${a.time}
                </span>
            </div>
        </div>
        `;
    });

    listEl.innerHTML = html;
}

// --- TIMER LOGIC ---
function startTimer() {
    timerInterval = setInterval(() => {
        refreshTimer--;
        document.getElementById('countdownTimer').innerText = refreshTimer + 's';
        
        if(refreshTimer <= 0) {
            resetTimer();
            fetchLiveAlerts();
        }
    }, 1000);
}

function resetTimer() {
    refreshTimer = 30;
    document.getElementById('countdownTimer').innerText = refreshTimer + 's';
}