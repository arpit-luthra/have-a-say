// Small geography helpers. Kept separate from the map component so they are
// easy to read, test and explain on their own.

/**
 * Find the bounding box of a GeoJSON Polygon or MultiPolygon.
 * Returns [[west, south], [east, north]], the format MapLibre's fitBounds() expects.
 *
 * How it works: a ward's shape is just a long list of [longitude, latitude]
 * points. The box that contains it is the smallest and largest longitude
 * and latitude among all those points.
 */
export function getBounds(geometry) {
  // A Polygon is a list of rings; a MultiPolygon is a list of Polygons.
  // Turn both into one flat list of rings so we only need one loop.
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
  const rings = polygons.flat()

  let west = Infinity
  let south = Infinity
  let east = -Infinity
  let north = -Infinity

  for (const ring of rings) {
    for (const [lng, lat] of ring) {
      west = Math.min(west, lng)
      east = Math.max(east, lng)
      south = Math.min(south, lat)
      north = Math.max(north, lat)
    }
  }

  return [
    [west, south],
    [east, north],
  ]
}

/** Bounding box around several features (used to fit the whole city on screen). */
export function getBoundsOfAll(features) {
  const boxes = features.map((feature) => getBounds(feature.geometry))
  return [
    [Math.min(...boxes.map((b) => b[0][0])), Math.min(...boxes.map((b) => b[0][1]))],
    [Math.max(...boxes.map((b) => b[1][0])), Math.max(...boxes.map((b) => b[1][1]))],
  ]
}
