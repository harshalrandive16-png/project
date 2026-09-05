/* ================================================================
   Geofence — find users in radius + build alert payload
   ================================================================ */
const { isInsideGeofence } = require('./haversine');

/**
 * Filter Firestore user docs that have lastLocation and are in radius
 * @param {FirebaseFirestore.QueryDocumentSnapshot[]} userDocs
 */
function findUsersInRadius(userDocs, centerLat, centerLon, radiusKm) {
  const matched = [];

  userDocs.forEach((doc) => {
    const u = doc.data();
    const loc = u.lastLocation;
    if (!loc || loc.lat == null || loc.lon == null) return;

    const { inside, distanceKm } = isInsideGeofence(
      Number(loc.lat),
      Number(loc.lon),
      Number(centerLat),
      Number(centerLon),
      Number(radiusKm)
    );

    if (inside) {
      matched.push({
        uid: doc.id,
        name: u.name || 'Citizen',
        email: u.email || '',
        phone: u.phone || '',
        state: u.state || '',
        distanceKm,
        lastLocation: loc
      });
    }
  });

  // nearest first
  matched.sort((a, b) => a.distanceKm - b.distanceKm);
  return matched;
}

function buildGeofenceAlert({
  centerLat,
  centerLon,
  radiusKm,
  location,
  riskLevel,
  score,
  primaryDisaster,
  smsEnglish,
  smsHindi,
  matchedUsers,
  engine
}) {
  return {
    type: 'geofence',
    location: location || 'Unknown',
    center: { lat: Number(centerLat), lon: Number(centerLon) },
    radiusKm: Number(radiusKm),
    riskLevel,
    score,
    primaryDisaster: primaryDisaster || 'Multi',
    smsEnglish: smsEnglish || '',
    smsHindi: smsHindi || '',
    userCount: matchedUsers.length,
    targetedUserIds: matchedUsers.map((u) => u.uid),
    engine: engine || 'unknown',
    message: `⚠️ ${riskLevel} ${primaryDisaster || 'disaster'} risk near ${location}. ${radiusKm}km geofence — ${matchedUsers.length} users notified.`,
    createdAt: new Date().toISOString()
  };
}

module.exports = { findUsersInRadius, buildGeofenceAlert };