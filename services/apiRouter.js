const express = require('express');
const { buildFeed } = require('./feedBuilder');

const router = express.Router();

/**
 * ⚠️ Mujhe nahi pata services/realtimeFeed.js kya export karta hai.
 * Ye code common naam try karta hai. Agar wo function ye shape return kare:
 *   { ranking:[], alerts:[], highways:[], hazards:[[lat,lng,0-1]] }
 * to REAL data use hoga (source:'live'), warna sample (source:'sample').
 */
async function getFeed() {
  try {
    const rt = require('./realtimeFeed');
    const fn = typeof rt === 'function'
      ? rt
      : rt.getLiveFeed || rt.getFeed || rt.buildFeed || rt.fetchFeed;

    if (fn) {
      const data = await fn();
      if (data && Array.isArray(data.ranking) && data.ranking.length) {
        return {
          updatedAt: data.updatedAt || new Date().toISOString(),
          source: 'live',
          ranking: data.ranking,
          alerts: data.alerts || [],
          highways: data.highways || [],
          hazards: data.hazards || []
        };
      }
    }
  } catch (err) {
    console.warn('[live-feed] realtimeFeed use nahi ho paya:', err.message);
  }
  return buildFeed();
}

router.get('/health', (req, res) => res.json({ ok: true }));

router.get('/live-feed', async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    res.json(await getFeed());
  } catch (err) {
    console.error('[live-feed] error:', err);
    res.status(500).json({ error: 'Feed build fail ho gaya' });
  }
});

module.exports = router;