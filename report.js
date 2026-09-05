// =========================================
// REPORT INCIDENT PAGE - FUNCTIONALITY
// =========================================

// Handle File Selection (Display File Name)
function handleFileSelect(input) {
  const displayArea = document.getElementById('fileNameDisplay');
  if (input.files && input.files.length > 0) {
    const fileName = input.files[0].name;
    displayArea.innerText = `Selected File: ${fileName}`;
  } else {
    displayArea.innerText = '';
  }
}

// Handle Auto-Detect GPS Location
function getLocation() {
  const btn = document.getElementById('gpsBtn');
  const coordsInput = document.getElementById('repCoords');
  const stateSelect = document.getElementById('repState');
  const addressInput = document.getElementById('repAddress');
  
  // Visual Loading State
  btn.classList.add('loading');
  btn.innerHTML = '<span>⏳</span> Detecting satellites...';
  
  // Simulate delay for fetching GPS
  setTimeout(() => {
    // Dummy Data injection (Simulating Shillong, Meghalaya for demo purposes)
    coordsInput.value = "25.5788° N, 91.8933° E";
    stateSelect.value = "Meghalaya";
    addressInput.value = "NH-6 Highway Bypass, Shillong Hills";
    
    // Reset Button
    btn.classList.remove('loading');
    btn.innerHTML = '<span>✅</span> Location Acquired';
    btn.style.background = 'rgba(16, 185, 129, 0.1)';
    btn.style.color = '#10b981';
    btn.style.borderColor = 'rgba(16, 185, 129, 0.3)';
    
    // Add success glow to inputs
    coordsInput.style.borderColor = '#10b981';
    stateSelect.style.borderColor = '#10b981';
    
    setTimeout(() => {
      coordsInput.style.borderColor = '';
      stateSelect.style.borderColor = '';
    }, 2000);
    
  }, 1500);
}

// Handle Form Submission
document.getElementById('incidentForm').addEventListener('submit', function(e) {
  e.preventDefault(); // Prevent page reload
  
  // In a real app, here you would construct FormData and send it to your backend API via fetch()
  // Example: 
  // const formData = new FormData(this);
  // fetch('YOUR_API_ENDPOINT', { method: 'POST', body: formData }) ...

  // Show Success Modal
  document.getElementById('successModal').classList.remove('hidden');
});

// Close Success Modal and Reset Form
function closeSuccessModal() {
  // Hide modal
  document.getElementById('successModal').classList.add('hidden');
  
  // Reset Form completely
  document.getElementById('incidentForm').reset();
  
  // Reset UI elements that aren't form inputs
  document.getElementById('fileNameDisplay').innerText = '';
  
  const gpsBtn = document.getElementById('gpsBtn');
  gpsBtn.innerHTML = '<span>📍</span> Auto-detect Current Location';
  gpsBtn.style.background = '';
  gpsBtn.style.color = '';
  gpsBtn.style.borderColor = '';
  
  // Redirect to Dashboard (Optional - uncomment to enable)
  // window.location.href = "dashboard.html"; 
}