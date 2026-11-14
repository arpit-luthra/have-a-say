// The city map: a detailed, Google-Maps-style map of Toronto, locked to the city.
//
// React and MapLibre each want to control the screen, so the pattern is:
// - React renders one empty <div>.
// - MapLibre draws the map inside that div, and we talk to it through `mapRef`.
// - The "You live here" pin lives in the parent (App); this component reacts when it changes.

import { useEffect, useRef, useState } from 'react'
import { MapLibreMap, Marker, NavigationControl, Popup, setWorkerUrl } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
// MapLibre decodes map tiles in a background "worker" script. Vite moves files
// around when bundling, so we tell MapLibre where that file ends up.
// `?url` asks Vite for the file's final web address instead of its contents.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { tooltipText } from '../lib/cardText.js'
import { loadWards } from '../lib/wardData.js'
import { findWardAt, isPointInGeometry } from '../lib/geo.js'
import './CityMap.css'

setWorkerUrl(workerUrl)

// "Liberty" is OpenFreeMap's detailed style: street names, parks, shops, transit
// stops, water, and 3D buildings when zoomed in close.
const BASE_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty'

// Toronto's street grid is rotated about 17° from true north. Turning the map
// by the same amount makes the main streets look straight and fills wide screens better.
const BEARING = -17

// Respect the "reduce motion" setting some people turn on in their device.
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

const PIN_RED = '#b3261e' // deep red for the pins and the highlighted building

// The close-up 3D view when a pin is clicked.
const CLOSE_UP = { zoom: 17.5, pitch: 60, bearing: BEARING + 20, duration: 2200 }

// `pins`: the located decisions in the current list.
// `hoveredId`: the decision whose card (or pin) the mouse is on.
// `selectedId`: the decision whose pin was clicked. The map flies in close on it; null = flat city view.
export default function CityMap({ homeLocation, pins = [], hoveredId = null, selectedId = null, onHoverPin = () => {}, onSelectPin = () => {} }) {
  const containerRef = useRef(null) // the <div> MapLibre draws into
  const mapRef = useRef(null) // the MapLibre map object
  const [isReady, setIsReady] = useState(false)
  // The map is created once, so it reads these through refs to always see the latest versions.
  const onHoverPinRef = useRef(onHoverPin)
  onHoverPinRef.current = onHoverPin
  const onSelectPinRef = useRef(onSelectPin)
  onSelectPinRef.current = onSelectPin
  const pinsRef = useRef(pins)
  pinsRef.current = pins
  const cityCameraRef = useRef(null) // the flat "whole Toronto" view, to fly back to
  const flightRef = useRef(0) // counts selections, so a slow old one can't finish after a new one
  const wasSelectedRef = useRef(false)

  // --- 1. Create the map once, when the component first appears. ---
  useEffect(() => {
    let cancelled = false // set if the component disappears before loading finishes

    const map = new MapLibreMap({
      container: containerRef.current,
      style: BASE_STYLE_URL,
      center: [-79.38, 43.71], // roughly the middle of Toronto
      zoom: 10,
      bearing: BEARING,
      maxZoom: 19, // all the way down to street level
      maxPitch: 60, // right-drag (or two-finger drag) tilts the map to see 3D buildings
    })
    map.touchZoomRotate.disableRotation() // pinch zooms, but never twists the map
    mapRef.current = map
    // Just the + and - buttons (no compass), bottom right.
    map.addControl(new NavigationControl({ showCompass: false }), 'bottom-right')

    map.on('load', async () => {
      hideBusStops(map)

      // The ward file isn't drawn. We only use its outline as "the shape of Toronto".
      const wards = await loadWards()
      if (cancelled) return

      // Toronto fills the screen on load, and that zoom is as far out as anyone can go.
      const points = outlinePoints(wards.features, 3)
      const camera = fitCity(map, points)
      map.jumpTo({ ...camera, bearing: BEARING, pitch: 0 }, { fromApp: true })
      map.setMinZoom(camera.zoom - 0.01) // tiny allowance so rounding can't trip the limit
      // A hard box around Toronto: MapLibre itself refuses to show anything far outside it,
      // so the map can never zoom out to the whole GTA, whatever the screen size.
      map.setMaxBounds(cityBox(points, 0.03))
      keepInsideToronto(map, wards.features)
      hidePlaceNamesOutsideToronto(map, wards.features)
      addBuildingHighlight(map)
      await addPinLayers(map, (id) => onHoverPinRef.current(id), (id) => onSelectPinRef.current(id))
      if (cancelled) return
      cityCameraRef.current = camera

      // If the window changes size, the "whole city fits" zoom changes too, so work it out again.
      // (Skipped while the map is hidden: a 0-pixel-wide map would give a nonsense zoom.)
      map.on('resize', () => {
        if (!map.getContainer().clientWidth || !map.getContainer().clientHeight) return
        // fitCity moves the camera while measuring, so remember where we were first.
        const before = { center: map.getCenter(), zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch() }
        const fitted = fitCity(map, points)
        map.setMinZoom(fitted.zoom - 0.01)
        cityCameraRef.current = fitted
        map.jumpTo({ ...before, zoom: Math.max(before.zoom, fitted.zoom) }, { fromApp: true })
      })

      setIsReady(true)
    })

    // Clean-up: when the component goes away, free the map's memory.
    return () => {
      cancelled = true
      map.remove()
    }
  }, [])

  // --- 2. The "You live here" pin, then zoom to that area. Only kept in memory. ---
  useEffect(() => {
    if (!isReady || !homeLocation) return
    const map = mapRef.current
    const marker = new Marker({ element: createHomePin(homeLocation.label), anchor: 'bottom' })
      .setLngLat([homeLocation.lng, homeLocation.lat])
      .addTo(map)
    map.flyTo(
      { center: [homeLocation.lng, homeLocation.lat], zoom: 13.5, duration: prefersReducedMotion ? 0 : 1400, essential: true },
      { fromApp: true }, // a tag on the move's events, so we can tell our moves from the user's
    )
    return () => marker.remove() // removed when the location changes or the page closes
  }, [homeLocation, isReady])

  // --- 3. Pins: keep the map's pin data equal to the decisions in the filtered list. ---
  useEffect(() => {
    if (!isReady) return
    // Decisions at the exact same spot would hide each other, so each one is nudged a few
    // metres around a small circle (only where it is drawn; flying in uses the true spot).
    const sameSpot = new Map()
    for (const d of pins) {
      const key = `${d.lng},${d.lat}`
      sameSpot.set(key, [...(sameSpot.get(key) ?? []), d])
    }
    const features = pins.map((d) => {
      const group = sameSpot.get(`${d.lng},${d.lat}`)
      const angle = (group.indexOf(d) / group.length) * 2 * Math.PI
      const nudge = group.length > 1
      return {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [d.lng + (nudge ? 0.00012 * Math.cos(angle) : 0), d.lat + (nudge ? 0.00008 * Math.sin(angle) : 0)],
        },
        properties: { id: d.id, lat: d.lat },
      }
    })
    mapRef.current.getSource('decisions').setData({ type: 'FeatureCollection', features })
  }, [pins, isReady])

  // --- 4. Close-up view: show ONLY the selected decision's pin (all pins again when nothing is selected). ---
  useEffect(() => {
    if (!isReady) return
    mapRef.current.setFilter('pin-points', selectedId ? ['==', ['get', 'id'], selectedId] : null)
  }, [selectedId, isReady])

  // --- 4b. Hovering a pin (or its card in the list) shows a small tooltip with the plain title. ---
  useEffect(() => {
    if (!isReady || !hoveredId) return
    const map = mapRef.current
    const pin = pinsRef.current.find((d) => d.id === hoveredId)
    if (!pin) return
    // Lift the tooltip above the pin's head (the pin grows from 1x to 1.5x between zoom 11 and 17).
    const pinHeight = 24 * (1 + 0.5 * Math.min(1, Math.max(0, (map.getZoom() - 11) / 6)))
    const tooltip = new Popup({ closeButton: false, closeOnClick: false, className: 'pin-tooltip', offset: [0, -pinHeight - 4], maxWidth: '260px' })
      .setLngLat([pin.lng, pin.lat])
      .setText(tooltipText(pin)) // setText (not HTML), so text can never inject markup
      .addTo(map)
    return () => tooltip.remove()
  }, [hoveredId, isReady])

  // --- 5. Selecting a pin: fly in close in 3D (and back out when it is cleared). ---
  useEffect(() => {
    if (!isReady) return
    const map = mapRef.current
    const flight = ++flightRef.current
    showBuilding(map, null) // clear any earlier highlight
    const pin = pinsRef.current.find((d) => d.id === selectedId)

    if (!pin) {
      if (wasSelectedRef.current) {
        const { center, zoom } = cityCameraRef.current
        map.flyTo(
          { center, zoom, bearing: BEARING, pitch: 0, duration: prefersReducedMotion ? 0 : 1800, essential: true },
          { fromApp: true },
        )
      }
      wasSelectedRef.current = false
      return
    }
    wasSelectedRef.current = true
    map.setLayoutProperty('building-3d', 'visibility', 'visible') // make sure 3D buildings are on
    map.flyTo(
      { center: [pin.lng, pin.lat], ...CLOSE_UP, duration: prefersReducedMotion ? 0 : CLOSE_UP.duration, essential: true },
      { fromApp: true },
    )
    // "approximate" pins (a whole street, not one address) get no building highlight.
    // Only Housing and Heritage pins with an exact address get the site outline.
    if (!pin.detailed && !pin.approximate && (pin.topic === 'Housing' || pin.topic === 'Heritage')) {
      // 'idle' = the flight is over and the close-up map tiles are loaded, so footprints can be read.
      map.once('idle', () => {
        if (flight === flightRef.current) showBuilding(map, buildingAt(map, pin.lng, pin.lat))
      })
    }
  }, [selectedId, isReady])

  return <div ref={containerRef} className="city-map" aria-label="Map of Toronto" />
}

/** Hide bus stops (they clutter the map). Every other place marker stays. */
function hideBusStops(map) {
  for (const layer of map.getStyle().layers) {
    if (!layer.id.startsWith('poi')) continue
    const notBus = ['!=', ['get', 'class'], 'bus']
    map.setFilter(layer.id, layer.filter ? ['all', layer.filter, notBus] : notBus)
  }
}

/** Every ward outline as ONE shape (a MultiPolygon). Used to ask "is this point inside Toronto?". */
function torontoShape(wardFeatures) {
  const polygons = wardFeatures.flatMap((w) =>
    w.geometry.type === 'Polygon' ? [w.geometry.coordinates] : w.geometry.coordinates,
  )
  return { type: 'MultiPolygon', coordinates: polygons }
}

/** Hide place names (Vaughan, Markham, ...) and the airport label (Pearson) whose point is outside Toronto. */
function hidePlaceNamesOutsideToronto(map, wardFeatures) {
  const insideToronto = ['within', torontoShape(wardFeatures)]
  for (const layer of map.getStyle().layers) {
    if (layer.type !== 'symbol' || !['place', 'aerodrome_label'].includes(layer['source-layer'])) continue
    map.setFilter(layer.id, layer.filter ? ['all', layer.filter, insideToronto] : insideToronto)
  }
}

const MAX_BUILDING_DISTANCE_M = 15 // a building further than this from the pin is not "the" building

/** Distance in metres from a point to a polygon's outline (rough flat-earth maths, fine at this size). */
function metresToOutline(lng, lat, ring) {
  const toMetres = ([x, y]) => [(x - lng) * Math.cos((lat * Math.PI) / 180) * 111320, (y - lat) * 110540]
  const points = ring.map(toMetres)
  let nearest = Infinity
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [x1, y1] = points[j]
    const [x2, y2] = points[i]
    const [dx, dy] = [x2 - x1, y2 - y1]
    // closest spot on this edge to the pin (which is at 0,0 in these coordinates)
    const t = dx || dy ? Math.max(0, Math.min(1, -(x1 * dx + y1 * dy) / (dx * dx + dy * dy))) : 0
    nearest = Math.min(nearest, Math.hypot(x1 + t * dx, y1 + t * dy))
  }
  return nearest
}

/**
 * The ONE building footprint at this spot, or null. We read the buildings drawn on screen
 * around the pin, split any multi-building shapes into single polygons, and keep the closest
 * polygon: the one containing the pin, or else one within 15 m. Returns { geometry, properties }.
 */
function buildingAt(map, lng, lat) {
  const { x, y } = map.project([lng, lat])
  const nearby = map.queryRenderedFeatures([[x - 80, y - 80], [x + 80, y + 80]], { layers: ['building-3d'] })

  let best = null
  for (const feature of nearby) {
    const { type, coordinates } = feature.geometry
    for (const polygon of type === 'Polygon' ? [coordinates] : coordinates) {
      const geometry = { type: 'Polygon', coordinates: polygon }
      const distance = isPointInGeometry(lng, lat, geometry) ? 0 : metresToOutline(lng, lat, polygon[0])
      if (distance <= MAX_BUILDING_DISTANCE_M && (!best || distance < best.distance)) {
        best = { distance, geometry, properties: feature.properties }
      }
    }
  }
  return best
}

const HIGHLIGHT_GROW_M = 0.5 // how far the outline is pushed outward on every side

/**
 * The "site" of a decision: a thin soft-red outline and a very light red fill, flat on the ground
 * (no 3D block), plus a small label. Drawn above the grey buildings, under the pins.
 */
function addBuildingHighlight(map) {
  map.addSource('building-highlight', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
  const layers = map.getStyle().layers
  const above3d = layers[layers.findIndex((layer) => layer.id === 'building-3d') + 1]
  map.addLayer({ id: 'building-highlight', type: 'fill', source: 'building-highlight', paint: { 'fill-color': PIN_RED, 'fill-opacity': 0.12 } }, above3d?.id)
  map.addLayer({ id: 'building-highlight-line', type: 'line', source: 'building-highlight', paint: { 'line-color': PIN_RED, 'line-opacity': 0.7, 'line-width': 1.5 } }, above3d?.id)
  map.addLayer({
    id: 'building-highlight-label',
    type: 'symbol',
    source: 'building-highlight',
    layout: { 'text-field': 'Site of this decision', 'text-font': ['Noto Sans Regular'], 'text-size': 12, 'text-offset': [0, 1.2], 'text-anchor': 'top', 'text-allow-overlap': true },
    paint: { 'text-color': PIN_RED, 'text-halo-color': '#fff', 'text-halo-width': 1.5 },
  })
}

/**
 * Pushes every corner of a polygon outward by `metres` (inner courtyard holes shrink instead,
 * so the solid part grows everywhere). Each corner moves along the average of its two
 * neighbouring edges' outward directions.
 */
function growPolygon(rings, metres) {
  return rings.map((ring, ringIndex) => {
    const lat0 = ring[0][1]
    const lngPerMetre = 1 / (111320 * Math.cos((lat0 * Math.PI) / 180))
    const latPerMetre = 1 / 110540
    const flat = ring.slice(0, -1).map(([lng, lat]) => [(lng - ring[0][0]) / lngPerMetre, (lat - lat0) / latPerMetre])
    const n = flat.length
    // Which way is "right" of an edge? Depends on whether the ring runs clockwise or not.
    const area = flat.reduce((sum, [x, y], i) => sum + (x * flat[(i + 1) % n][1] - flat[(i + 1) % n][0] * y), 0)
    const side = (area > 0 ? 1 : -1) * (ringIndex === 0 ? 1 : -1)
    const normal = (a, b) => {
      const [dx, dy] = [b[0] - a[0], b[1] - a[1]]
      const length = Math.hypot(dx, dy) || 1
      return [(dy / length) * side, (-dx / length) * side]
    }
    const moved = flat.map((point, i) => {
      const before = normal(flat[(i + n - 1) % n], point)
      const after = normal(point, flat[(i + 1) % n])
      const [mx, my] = [before[0] + after[0], before[1] + after[1]]
      const mLength = Math.hypot(mx, my) || 1
      // On sharp corners the move is lengthened so the SIDES (not just the corner) shift by `metres`; capped.
      const stretch = Math.min(2, 1 / Math.max(0.5, (mx * before[0] + my * before[1]) / mLength))
      return [point[0] + (mx / mLength) * metres * stretch, point[1] + (my / mLength) * metres * stretch]
    })
    const out = moved.map(([x, y]) => [ring[0][0] + x * lngPerMetre, lat0 + y * latPerMetre])
    return [...out, out[0]] // close the ring again
  })
}

/** Outline this building's footprint, or clear the highlight when `building` is undefined/null. */
function showBuilding(map, building) {
  const features = building
    ? [{
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: growPolygon(building.geometry.coordinates, HIGHLIGHT_GROW_M) },
        properties: {},
      }]
    : []
  map.getSource('building-highlight').setData({ type: 'FeatureCollection', features })
}

// A realistic pushpin as SVG text: a small glossy dark-red sphere (10px wide in city view),
// a thin grey needle and a very soft ground shadow. No outlines. The needle tip is at y=24 in
// a 30-high picture, so 6px of padding sits below the tip (for the shadow).
const PUSHPIN_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="32" height="60" viewBox="0 0 16 30">
  <defs>
    <radialGradient id="head" cx="38%" cy="32%" r="75%">
      <stop offset="0" stop-color="#cc4a42"/>
      <stop offset="0.5" stop-color="#b3261e"/>
      <stop offset="1" stop-color="#8c1d17"/>
    </radialGradient>
    <linearGradient id="needle" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0" stop-color="#d1d5db"/>
      <stop offset="1" stop-color="#9ca3af"/>
    </linearGradient>
    <radialGradient id="shadow">
      <stop offset="0" stop-color="#000" stop-opacity="0.22"/>
      <stop offset="1" stop-color="#000" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <ellipse cx="8" cy="24" rx="4.5" ry="1.4" fill="url(#shadow)"/>
  <polygon points="7.6,10 8.4,10 8,24" fill="url(#needle)"/>
  <circle cx="8" cy="6" r="5" fill="url(#head)"/>
  <ellipse cx="6.4" cy="4.2" rx="1.3" ry="0.8" fill="#fff" fill-opacity="0.5" transform="rotate(-30 6.4 4.2)"/>
</svg>`

/** Turns the SVG text into a picture MapLibre can use as a map icon (resolves when it is ready). */
function addPinImage(map, name) {
  return new Promise((resolve, reject) => {
    const image = new Image(32, 60) // drawn at 2x so it stays sharp on retina screens
    image.onload = () => {
      map.addImage(name, image, { pixelRatio: 2 })
      resolve()
    }
    image.onerror = reject
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(PUSHPIN_SVG)}`
  })
}

/**
 * The decision pins: one GeoJSON source, no clustering (every decision is its own marker at
 * every zoom). Pins never change size on hover; hovering shows a tooltip instead (see effect 4b).
 */
async function addPinLayers(map, onHover, onSelect) {
  map.addSource('decisions', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
  await addPinImage(map, 'pin')

  map.addLayer({
    id: 'pin-points',
    type: 'symbol',
    source: 'decisions',
    layout: {
      'icon-image': 'pin',
      'icon-anchor': 'bottom',
      'icon-offset': [0, 6], // lifts the 6px of shadow padding so the needle tip sits on the spot
      // Small (10px head) when zoomed out, growing a little as you zoom in.
      'icon-size': ['interpolate', ['linear'], ['zoom'], 11, 1, 17, 1.5],
      'icon-allow-overlap': true, // never hide a pin
      'icon-ignore-placement': true,
      'symbol-sort-key': ['*', -1, ['get', 'lat']], // southern pins are drawn in front, like real objects
    },
  })

  map.on('mouseenter', 'pin-points', () => (map.getCanvas().style.cursor = 'pointer'))
  map.on('mouseleave', 'pin-points', () => (map.getCanvas().style.cursor = ''))
  map.on('mousemove', 'pin-points', (event) => onHover(event.features[0].properties.id))
  map.on('mouseleave', 'pin-points', () => onHover(null))

  // Click a pin: the page selects it, and the map flies in (see effect 5 above).
  map.on('click', 'pin-points', (event) => onSelect(event.features[0].properties.id))
}

/** Border points of the wards, taking every `step`-th one (fewer points = faster to measure). */
function outlinePoints(wardFeatures, step) {
  const points = []
  for (const ward of wardFeatures) {
    const polygons = ward.geometry.type === 'Polygon' ? [ward.geometry.coordinates] : ward.geometry.coordinates
    for (const [outerRing] of polygons) {
      outerRing.forEach((point, index) => index % step === 0 && points.push(point))
    }
  }
  return points
}

/** The box (south-west and north-east corners) around the points, with a small margin. */
function cityBox(points, margin) {
  const lngs = points.map(([lng]) => lng)
  const lats = points.map(([, lat]) => lat)
  return [
    [Math.min(...lngs) - margin, Math.min(...lats) - margin],
    [Math.max(...lngs) + margin, Math.max(...lats) + margin],
  ]
}

/**
 * Work out the camera (centre + zoom) that makes Toronto fill the whole screen.
 * The map is turned, so a plain north-up bounding box wastes space. Instead we
 * measure: jump the camera (invisibly, before the screen redraws), see where the
 * border points land in pixels, zoom by the amount that makes them fit, re-centre, repeat.
 */
function fitCity(map, points) {
  map.resize() // make sure MapLibre knows the real screen size
  const width = map.getContainer().clientWidth
  const height = map.getContainer().clientHeight

  const lngs = points.map(([lng]) => lng)
  const lats = points.map(([, lat]) => lat)
  const camera = {
    center: [(Math.min(...lngs) + Math.max(...lngs)) / 2, (Math.min(...lats) + Math.max(...lats)) / 2],
    zoom: map.getZoom(),
  }

  for (let round = 0; round < 4; round++) {
    // a) zoom so the city is as big as fits (each zoom step doubles the size)
    map.jumpTo({ ...camera, bearing: BEARING, pitch: 0 }, { fromApp: true })
    let box = boxOnScreen(map, points)
    // The smaller scale is the limiting side: the tall (or wide) edge touches the screen edge.
    camera.zoom += Math.log2(Math.min(width / box.width, height / box.height))

    // b) at the new zoom, shift so the city's middle sits in the middle of the screen
    map.jumpTo({ ...camera, bearing: BEARING, pitch: 0 }, { fromApp: true })
    box = boxOnScreen(map, points)
    const shapeMiddle = map.unproject([box.middleX, box.middleY])
    const screenMiddle = map.unproject([width / 2, height / 2])
    const { lng, lat } = map.getCenter()
    camera.center = [lng + shapeMiddle.lng - screenMiddle.lng, lat + shapeMiddle.lat - screenMiddle.lat]
  }
  return camera
}

/** Where the points land on screen right now: the box around them, in pixels. */
function boxOnScreen(map, points) {
  const onScreen = points.map((point) => map.project(point))
  const xs = onScreen.map((p) => p.x)
  const ys = onScreen.map((p) => p.y)
  const [left, right, top, bottom] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  return { width: right - left, height: bottom - top, middleX: (left + right) / 2, middleY: (top + bottom) / 2 }
}

/**
 * If a drag ends with the middle of the screen outside Toronto, glide back to
 * the nearest point on Toronto's border. (Checked only when a move ends, so
 * dragging stays smooth.)
 */
function keepInsideToronto(map, wardFeatures) {
  const borderPoints = outlinePoints(wardFeatures, 1)
  map.on('moveend', (event) => {
    if (event.fromApp) return // our own camera moves are always fine
    const { lng, lat } = map.getCenter()
    if (findWardAt(lng, lat, wardFeatures)) return // still inside Toronto

    // Nearest border point (longitude shrunk by cos(latitude) so distances are fair).
    const shrink = Math.cos((lat * Math.PI) / 180)
    let nearest = borderPoints[0]
    let best = Infinity
    for (const point of borderPoints) {
      const distance = ((point[0] - lng) * shrink) ** 2 + (point[1] - lat) ** 2
      if (distance < best) {
        best = distance
        nearest = point
      }
    }
    map.easeTo({ center: nearest, duration: prefersReducedMotion ? 0 : 450 }, { fromApp: true })
  })
}

/** The "You live here" pin: a label above a dot. */
function createHomePin(text) {
  const pin = document.createElement('div')
  pin.className = 'home-pin'
  const label = document.createElement('span')
  label.className = 'home-pin__label'
  label.textContent = text
  const dot = document.createElement('span')
  dot.className = 'home-pin__dot'
  pin.append(label, dot)
  return pin
}
