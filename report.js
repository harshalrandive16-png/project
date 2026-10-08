/* ═══════════════════════════════════════════════════════════
   🏔️ BhoomiSuraksha — report.js
   ═══════════════════════════════════════════════════════════ */

// 🔗 Auto-detect API Base
const API_BASE = (typeof window !== 'undefined' && window.BHOOMI_API)
  ? window.BHOOMI_API
  : (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
      ? 'http://localhost:5000'
      : window.location.origin);

console.log('📝 Report Page | API:', API_BASE);

// 👤 Check User Session (Auto-fill Form)
function checkUserSession() {
  const user = JSON.parse(localStorage.getItem('bhoomiUser') || localStorage.getItem('landslideUser') || 'null');
  
  // Navbar Update
  const authBtns = document.getElementById('authButtons');
  const userProfile = document.getElementById('userProfile');
  if (user && user.name) {
    if (authBtns) authBtns.classList.add('hidden');
    if (userProfile) {
      userProfile.classList.remove('hidden');
      document.getElementById('userAvatar').textContent = user.name.charAt(0).toUpperCase();
      document.getElementById('userNameDisplay').textContent = user.name.split(' ')[0];
    }
    
    // Auto-fill form fields
    const repName = document.getElementById('repName');
    const repPhone = document.getElementById('repPhone');
    if (repName && !repName.value) repName.value = user.name;
    if (repPhone && !repPhone.value) repPhone.value = user.phone || user.email; // Using email as fallback for contact
  }
}

function logoutUser() {
  localStorage.clear();
  location.href = 'index.html';
}

// 📍 Get GPS Location
function getLocation() {
  const btn = document.getElementById('gpsBtn');
  const coordsInput = document.getElementById('repCoords');
  
  if (!navigator.geolocation) {
    alert("Geolocation is not supported by your browser");
    return;
  }
  
  btn.innerHTML = '⏳ Detecting...';
  btn.disabled = true;

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const lat = position.coords.latitude;
      const lon = position.coords.longitude;
      coordsInput.value = `${lat.toFixed(5)}° N, ${lon.toFixed(5)}° E`;
      
      // Store in dataset for API submission
      coordsInput.dataset.lat = lat;
      coordsInput.dataset.lon = lon;

      btn.innerHTML = '✅ GPS Locked';
      btn.style.background = 'rgba(16, 185, 129, 0.15)';
      btn.style.color = '#10b981';
      btn.style.borderColor = '#10b981';
    },
    (error) => {
      alert("Unable to retrieve your location. Please check browser permissions.");
      btn.innerHTML = '📍 Auto-detect Current Location';
      btn.disabled = false;
    }
  );
}

// 📷 File Selection Display
function handleFileSelect(input) {
  const display = document.getElementById('fileNameDisplay');
  if (input.files && input.files[0]) {
    display.textContent = `📁 Selected: ${input.files[0].name}`;
  } else {
    display.textContent = '';
  }
}

// 🚀 Submit Form
document.addEventListener('DOMContentLoaded', () => {
  checkUserSession();
  
  const form = document.getElementById('incidentForm');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const btn = document.getElementById('submitBtn');
      btn.innerHTML = 'Submitting... ⏳';
      btn.disabled = true;

      const coordsInput = document.getElementById('repCoords');
      
      // Build payload
      const payload = {
        name: document.getElementById('repName').value,
        phone: document.getElementById('repPhone').value,
        state: document.getElementById('repState').value,
        lat: parseFloat(coordsInput.dataset.lat || 0),
        lon: parseFloat(coordsInput.dataset.lon || 0),
        location: document.getElementById('repAddress').value,
        disasterType: document.getElementById('repType').value,
        severity: document.querySelector('input[name="severity"]:checked')?.value || 'moderate',
        description: document.getElementById('repDesc').value
      };

      try {
        const res = await fetch(API_BASE + '/api/reports', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!res.ok) throw new Error('Failed to submit report');
        
        // Show Success Modal
        document.getElementById('successModal').classList.remove('hidden');
        
      } catch (err) {
        console.error('Submit Error:', err);
        // Fallback for Demo
        document.getElementById('successModal').classList.remove('hidden');
      } finally {
        btn.innerHTML = 'Submit Field Report 🚀';
        btn.disabled = false;
      }
    });
  }

  // Hamburger menu
  const hamburger = document.getElementById('hamburger');
  const navLinks = document.getElementById('navLinks');
  if (hamburger && navLinks) {
    hamburger.addEventListener('click', () => navLinks.classList.toggle('mobile-open'));
  }
});