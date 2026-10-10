/**
 * BhoomiSuraksha v5.2 - Global API Configuration & Environment Router
 * Pipeline: SENSE → PREDICT → ALERT → RESPOND
 * Security Spec: Strict Dynamic Origin Selector
 */

(function () {
    // 1. Detect Host Domain
    const hostname = window.location.hostname;
    
    // 2. Determine API Gateway Endpoint
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
        // Local Node.js Express Server
        window.BHOOMI_API = 'http://localhost:5000';
    } else if (hostname.includes('github.io')) {
        // GitHub Pages Deployment -> Points to Live Render Node Server
        window.BHOOMI_API = 'https://project-2-wszb.onrender.com';
    } else {
        // Render or Custom Production Server Origin
        window.BHOOMI_API = window.location.origin;
    }

    // 3. Fallback Header & Debug Logger
    console.log("%cBhoomiSuraksha v5.2 System Active", "color: #10b981; font-weight: bold; font-size: 14px;");
    console.log(`🌐 Target Backend Gateway (window.BHOOMI_API): ${window.BHOOMI_API}`);

    // 4. Global Helper for API Headers
    window.getAuthHeaders = function () {
        const token = localStorage.getItem('bhoomi_token');
        return {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        };
    };
})();
