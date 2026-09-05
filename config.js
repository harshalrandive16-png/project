// config.js — local + Render dono pe kaam kare
window.BHOOMI_API =
  (window.location.hostname === 'localhost' ||
   window.location.hostname === '127.0.0.1')
    ? 'http://localhost:5000'
    : window.location.origin;