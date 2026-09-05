/* ================================================================
   Haversine — distance between two GPS points (km)
   ================================================================ */

/**
 * @returns {number} distance in kilometers
 */
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius km
  const toRad = (d) => (d * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Is point inside circle?
 */
function isInsideGeofence(userLat, userLon, centerLat, centerLon, radiusKm) {
  const d = haversineKm(userLat, userLon, centerLat, centerLon);
  return { inside: d <= radiusKm, distanceKm: Math.round(d * 100) / 100 };
}

module.exports = { haversineKm, isInsideGeofence };