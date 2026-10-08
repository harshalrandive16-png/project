/**
 * BhoomiSuraksha — Fast2SMS Service (TRAI Compliant - No Links)
 */

const axios = require('axios');

function getApiKey() {
  let key = process.env.FAST2SMS_API_KEY || '';
  return key.trim().replace(/^["']|["']$/g, '');
}

function sanitizeNumbers(phones) {
  if (!phones) return [];
  const list = Array.isArray(phones) ? phones : String(phones).split(',');
  return list
    .map((p) => String(p).replace(/\D/g, '').slice(-10))
    .filter((p) => p.length === 10);
}

/**
 * Clean URL Remover (Ensures TRAI telecom filters don't drop the SMS)
 */
function cleanMessageForTelecom(text) {
  if (!text) return '';
  // Remove any http/https links as telecom filters block unregistered Quick SMS links
  return String(text).replace(/https?:\/\/[^\s]+/g, '').trim();
}

async function sendGeofencedSMS(phoneNumbers, messageText) {
  const apiKey = getApiKey();
  const validNumbers = sanitizeNumbers(phoneNumbers);

  if (!apiKey || apiKey.length < 20) {
    console.warn('⚠️ Fast2SMS: API Key missing in .env');
    return { success: false, error: 'FAST2SMS_API_KEY missing in .env' };
  }

  if (validNumbers.length === 0) {
    return { success: false, error: 'Valid 10-digit mobile number required' };
  }

  const numbersString = validNumbers.join(',');
  const cleanText = cleanMessageForTelecom(messageText);

  try {
    console.log(`📱 [Fast2SMS] Dispatching Clean SMS to [${numbersString}]...`);

    const payload = {
      route: 'q',
      message: cleanText,
      language: 'english',
      flash: 0,
      numbers: numbersString
    };

    const response = await axios.post('https://www.fast2sms.com/dev/bulkV2', payload, {
      headers: {
        authorization: apiKey,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });

    console.log('📥 Fast2SMS Server Response:', response.data);

    if (response.data && response.data.return === true) {
      return {
        success: true,
        numbersSent: validNumbers,
        count: validNumbers.length,
        request_id: response.data.request_id || `REQ_${Date.now()}`,
        message: response.data.message || ['SMS delivered to Fast2SMS gateway']
      };
    } else {
      const errMsg = response.data.message || 'Fast2SMS Rejected Request';
      return { success: false, error: errMsg, raw: response.data };
    }
  } catch (err) {
    const errData = err.response ? err.response.data : err.message;
    console.error('❌ Fast2SMS Exception:', errData);
    return { success: false, error: typeof errData === 'object' ? JSON.stringify(errData) : errData };
  }
}

function getSMSStatus() {
  return {
    configured: !!(getApiKey() && getApiKey().length > 20),
    provider: 'Fast2SMS (bulkV2)',
    route: 'Quick Transactional (Route Q)'
  };
}

module.exports = {
  sendGeofencedSMS,
  getSMSStatus
};