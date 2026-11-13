// Small geography helpers. Kept separate from the components so they are
// easy to read, test and explain on their own.

/**
 * Is the point inside this ring (a closed loop of [lng, lat] points)?
 *
 * "Ray casting": imagine a line from the point going right forever, and count
 * how many edges of the shape it crosses. Odd = inside, even = outside.
 */
function isPointInRing(lng, lat, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x1, y1] = ring[i]
    const [x2, y2] = ring[j]
    const crossesOurHeight = y1 > lat !== y2 > lat
    if (crossesOurHeight && lng < ((x2 - x1) * (lat - y1)) / (y2 - y1) + x1) {
      inside = !inside
    }
  }
  return inside
}

/** Inside a Polygon or MultiPolygon: inside an outer ring, and not inside one of its holes. */
export function isPointInGeometry(lng, lat, geometry) {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
  return polygons.some(
    ([outer, ...holes]) => isPointInRing(lng, lat, outer) && !holes.some((hole) => isPointInRing(lng, lat, hole)),
  )
}

/** The ward feature that contains this point, or undefined if it's outside Toronto. */
export function findWardAt(lng, lat, wardFeatures) {
  return wardFeatures.find((ward) => isPointInGeometry(lng, lat, ward.geometry))
}
