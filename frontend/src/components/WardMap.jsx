// The city map: a flat, Google-Maps-style Toronto with the 25 wards drawn on top as thin borders.
//
// React and MapLibre each want to control the screen, so the pattern is:
// - React renders one empty <div>.
// - MapLibre draws the map inside that div, and we talk to it through `mapRef`.
// - The selected ward and the home pin live in the parent (App). This component
//   reports clicks upward and reacts when those values change.

import { useEffect, useRef, useState } from 'react'
import { MapLibreMap, Marker, NavigationControl, setWorkerUrl } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
// MapLibre decodes map tiles in a background "worker" script. Vite moves files
// around when bundling, so we tell MapLibre where that file ends up.
// `?url` asks Vite for the file's final web address instead of its contents.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { loadWards, wardSummary } from '../lib/wardData.js'
import { INK } from '../lib/theme.js'
import './WardMap.css'

setWorkerUrl(workerUrl)

// "Bright" is OpenFreeMap's Google-Maps-like style: light green parks, white roads, blue water.
const BASE_STYLE_URL = 'https://tiles.openfreemap.org/styles/bright'
const LABELS_URL = '/data/toronto-ward-labels.geojson'
const MASK_URL = '/data/toronto-mask.geojson'

// Flat (no tilt), turned -17° so Toronto's street grid looks straight.
const BEARING = -17

// Poster colours: one solid colour for the city, a touch lighter on hover.
const POSTER = '#2f4d63'
const POSTER_HOVER = '#3f6580'

// A box around Toronto with some breathing room: [west, south, east, north].
// People can pan and zoom anywhere inside it, but not off into the rest of Ontario.
// Plain colour for everything outside Toronto.
const OUTSIDE_COLOR = '#eceae4'

const TORONTO_AREA = [-79.75, 43.5, -79.0, 43.95]

// Respect the "reduce motion" setting some people turn on in their device.
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

export default function WardMap({ selectedWard, homeLocation, onSelectWard }) {
  const containerRef = useRef(null) // the <div> MapLibre draws into
  const mapRef = useRef(null) // the MapLibre map object
  const wardsRef = useRef(null) // the ward GeoJSON, once loaded
  const [isReady, setIsReady] = useState(false)

  // Facts the map's own event handlers need. Refs (not state) because those
  // handlers are created once and must always see the latest values.
  const selectedNumberRef = useRef(null) // which ward is selected right now
  const cityZoomRef = useRef(null) // the zoom that fits the whole city
  // The box [west, south, east, north] people may pan inside: the city, or the open ward.
  const areaRef = useRef(TORONTO_AREA)

  // Keep the latest props in refs, for the same reason.
  const onSelectWardRef = useRef(onSelectWard)
  useEffect(() => {
    onSelectWardRef.current = onSelectWard
  })

  // --- 1. Create the map once, when the component first appears. ---
  useEffect(() => {
    let cancelled = false // set if the component disappears before loading finishes

    const map = new MapLibreMap({
      container: containerRef.current,
      style: BASE_STYLE_URL,
      center: [-79.38, 43.71], // roughly the middle of Toronto
      zoom: 10,
      maxZoom: 19, // all the way down to street level
      bearing: BEARING,
      dragRotate: false, // people can't turn the map themselves
      pitchWithRotate: false,
    })
    map.touchZoomRotate.disableRotation() // pinch zooms, but never twists the map
    mapRef.current = map
    // Just the + and - buttons (no compass), bottom right.
    map.addControl(new NavigationControl({ showCompass: false }), 'bottom-right')

    map.on('load', async () => {
      const wards = await loadWards()
      if (cancelled) return
      wardsRef.current = wards

      addMapLayers(map, wards)
      addHoverAndClick(map, (ward) => onSelectWardRef.current(ward), () => selectedNumberRef.current !== null)

      // Start with the whole city in view, then keep people inside the allowed area.
      cityZoomRef.current = flyToWards(map, wards.features, 0)
      map.setMinZoom(cityZoomRef.current - 0.5)
      map.on('moveend', (event) => {
        if (event.fromApp) return
        const { lng, lat } = map.getCenter()
        const [w, s, e, n] = areaRef.current
        const inside = [Math.min(Math.max(lng, w), e), Math.min(Math.max(lat, s), n)]
        if (inside[0] !== lng || inside[1] !== lat) map.easeTo({ center: inside, duration: 400 }, { fromApp: true })
      })

      setIsReady(true)
    })

    // Clean-up: when the component goes away, free the map's memory.
    return () => {
      cancelled = true
      map.remove()
    }
  }, [])

  // --- 2. When the selected ward changes: show only that ward, and move the camera. ---
  useEffect(() => {
    if (!isReady) return
    const map = mapRef.current
    const wards = wardsRef.current.features
    const selectedNumber = selectedWard?.number ?? null
    selectedNumberRef.current = selectedNumber

    // "Feature state" tags one shape (e.g. selected: true) so the paint rules
    // below can style it differently, without re-drawing all the data.
    for (const ward of wards) {
      const state = {
        selected: ward.id === selectedNumber,
        dimmed: selectedNumber !== null && ward.id !== selectedNumber,
        hover: false,
      }
      map.setFeatureState({ source: 'wards', id: ward.id }, state)
      map.setFeatureState({ source: 'ward-labels', id: ward.id }, state)
    }
    // The city outline only belongs on the city view.
    map.setPaintProperty('city-border', 'line-opacity', selectedNumber === null ? 0.9 : 0)

    const selected = wards.find((ward) => ward.id === selectedNumber)
    if (!selected) {
      areaRef.current = TORONTO_AREA
      map.setMinZoom(cityZoomRef.current - 0.5) // lowering the limit first is always safe
      flyToWards(map, wards, 1400)
      return
    }
    // Ward page: fit the ward, then stop people zooming out or dragging off it.
    areaRef.current = paddedBox(selected)
    const zoom = flyToWards(map, [selected], 1400)
    map.once('moveend', () => map.setMinZoom(zoom - 0.3))
  }, [selectedWard, isReady])

  // --- 3. The "You live here" pin. Only kept in memory, never saved. ---
  useEffect(() => {
    if (!isReady || !homeLocation) return
    const marker = new Marker({ element: createHomePin(), anchor: 'bottom' })
      .setLngLat([homeLocation.lng, homeLocation.lat])
      .addTo(mapRef.current)
    return () => marker.remove() // removed when the location changes or the page closes
  }, [homeLocation, isReady])

  return <div ref={containerRef} className="ward-map" aria-label="Map of Toronto's 25 wards" />
}

/**
 * Smoothly fly the camera so some wards (one ward, or the whole city) fill the
 * screen as large as possible. Returns the zoom level it flies to.
 */
function flyToWards(map, wardFeatures, duration) {
  const camera = fitCamera(map, outlinePoints(wardFeatures))
  map.flyTo(
    { ...camera, bearing: BEARING, duration: prefersReducedMotion ? 0 : duration, essential: true },
    { fromApp: true }, // a tag on the move's events, so we can tell our moves from the user's
  )
  return camera.zoom
}

/** A ward's bounding box [west, south, east, north], with 10% extra room around it. */
function paddedBox(ward) {
  const points = outlinePoints([ward])
  const lngs = points.map(([lng]) => lng)
  const lats = points.map(([, lat]) => lat)
  const [w, e, s, n] = [Math.min(...lngs), Math.max(...lngs), Math.min(...lats), Math.max(...lats)]
  const [padX, padY] = [(e - w) * 0.1, (n - s) * 0.1]
  return [w - padX, s - padY, e + padX, n + padY]
}

/** Border points of the given wards (every 3rd one: plenty to measure the shape). */
function outlinePoints(wardFeatures) {
  const points = []
  for (const ward of wardFeatures) {
    const polygons = ward.geometry.type === 'Polygon' ? [ward.geometry.coordinates] : ward.geometry.coordinates
    for (const [outerRing] of polygons) {
      outerRing.forEach((point, index) => index % 3 === 0 && points.push(point))
    }
  }
  return points
}

/**
 * Work out the camera (centre + zoom) that makes the points fill the screen.
 * The map is turned, so a plain north-up bounding box wastes space. Instead we
 * measure: jump the camera (invisibly, before the screen redraws), see where the
 * points land in pixels, zoom by the amount that makes them fit, re-centre, repeat.
 */
function fitCamera(map, points) {
  map.resize() // make sure MapLibre knows the real screen size
  const start = { center: map.getCenter(), zoom: map.getZoom(), bearing: map.getBearing() }
  map.stop()

  // Small margins; a little extra at the top for the search bar.
  const width = map.getContainer().clientWidth
  const height = map.getContainer().clientHeight
  const margin = 10
  const space = { left: margin, right: width - margin, top: 60, bottom: height - margin }

  const lngs = points.map(([lng]) => lng)
  const lats = points.map(([, lat]) => lat)
  const camera = {
    center: [(Math.min(...lngs) + Math.max(...lngs)) / 2, (Math.min(...lats) + Math.max(...lats)) / 2],
    zoom: start.zoom,
  }

  for (let round = 0; round < 4; round++) {
    // a) zoom so the shape is as big as fits (each zoom step doubles the size)
    map.jumpTo({ ...camera, bearing: BEARING }, { fromApp: true })
    let box = boxOnScreen(map, points)
    const scale = Math.min((space.right - space.left) / box.width, (space.bottom - space.top) / box.height)
    camera.zoom = Math.min(16, camera.zoom + Math.log2(scale))

    // b) at the new zoom, shift so the shape's middle sits in the middle of the free space
    map.jumpTo({ ...camera, bearing: BEARING }, { fromApp: true })
    box = boxOnScreen(map, points)
    const shapeMiddle = map.unproject([box.middleX, box.middleY])
    const spaceMiddle = map.unproject([(space.left + space.right) / 2, (space.top + space.bottom) / 2])
    const { lng, lat } = map.getCenter()
    camera.center = [lng + shapeMiddle.lng - spaceMiddle.lng, lat + shapeMiddle.lat - spaceMiddle.lat]
  }

  map.jumpTo(start, { fromApp: true }) // put the camera back; flyTo() does the real move
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

/** Draw everything we add on top of the base map. */
function addMapLayers(map, wards) {
  // Hide big city names ("Toronto", "Mississauga"): the page already says
  // Toronto, and that label would sit on top of the downtown ward badges.
  if (map.getLayer('label_city')) map.setLayoutProperty('label_city', 'visibility', 'none')

  map.addSource('wards', {
    type: 'geojson',
    data: wards,
    attribution: 'Wards &amp; neighbourhoods: <a href="https://open.toronto.ca/">City of Toronto Open Data</a>',
  })
  // promoteId: use each point's ward number as its id, so feature state works on badges too.
  map.addSource('ward-labels', { type: 'geojson', data: LABELS_URL, promoteId: 'ward_number' })
  map.addSource('toronto-mask', { type: 'geojson', data: MASK_URL })

  // A small helper to read the hover/selected tags inside paint rules.
  const is = (tag) => ['boolean', ['feature-state', tag], false]

  // POSTER VIEW: each ward is covered by a solid colour that hides the street map
  // underneath. Selecting a ward fades *its* cover to nothing, which reveals the
  // real map (same map, nothing reloads). Hovering lightens a ward a little.
  map.addLayer({
    id: 'ward-fill',
    type: 'fill',
    source: 'wards',
    paint: {
      // Other wards, once one is open, turn into the plain light background.
      'fill-color': ['case', is('dimmed'), OUTSIDE_COLOR, is('hover'), POSTER_HOVER, POSTER],
      'fill-opacity': ['case', is('selected'), 0, 1],
      'fill-opacity-transition': { duration: prefersReducedMotion ? 0 : 700 },
      'fill-color-transition': { duration: 150 },
    },
  })

  // Hide everything outside Toronto: a solid sheet with a Toronto-shaped hole.
  // It sits above the labels, so outside streets and towns disappear.
  map.addLayer({
    id: 'outside-mask',
    type: 'fill',
    source: 'toronto-mask',
    paint: { 'fill-color': OUTSIDE_COLOR, 'fill-opacity': 1 },
  })
  // The edge of that hole is Toronto's outer boundary: one clear line.
  map.addLayer({
    id: 'city-border',
    type: 'line',
    source: 'toronto-mask',
    layout: { 'line-join': 'round' },
    paint: { 'line-color': INK, 'line-width': 2.5, 'line-opacity': 0.9 },
  })

  // Thin white borders in poster view; a dark outline on the opened ward.
  map.addLayer({
    id: 'ward-line',
    type: 'line',
    source: 'wards',
    layout: { 'line-join': 'round' },
    paint: {
      'line-color': ['case', is('selected'), INK, '#ffffff'],
      'line-width': ['case', is('selected'), 3, 1],
      'line-opacity': ['case', is('dimmed'), 0, 1],
    },
  })

  // Big bold ward numbers in the middle of each ward; they fade out on the opened ward.
  map.addLayer({
    id: 'ward-number',
    type: 'symbol',
    source: 'ward-labels',
    layout: {
      'text-field': ['to-string', ['get', 'ward_number']],
      'text-font': ['Noto Sans Bold'],
      'text-size': ['interpolate', ['linear'], ['zoom'], 9, 20, 12, 34],
      'text-allow-overlap': true,
      'text-ignore-placement': true,
    },
    paint: {
      'text-color': '#ffffff',
      'text-opacity': ['case', is('selected'), 0, is('dimmed'), 0, 1],
      'text-opacity-transition': { duration: prefersReducedMotion ? 0 : 400 },
    },
  })
}

/** Thicken the border of the hovered ward; report clicks and taps. No popup. */
function addHoverAndClick(map, onWardClick, isLocked) {
  let hoveredId = null

  function clearHover() {
    if (hoveredId !== null) map.setFeatureState({ source: 'wards', id: hoveredId }, { hover: false })
    hoveredId = null
  }

  map.on('mousemove', 'ward-fill', (event) => {
    if (isLocked()) {
      map.getCanvas().style.cursor = '' // on a ward page, the other wards are out of play
      return
    }
    const ward = event.features[0]
    if (ward.id !== hoveredId) {
      clearHover()
      hoveredId = ward.id
      map.setFeatureState({ source: 'wards', id: hoveredId }, { hover: true })
    }
    map.getCanvas().style.cursor = 'pointer'
  })

  map.on('mouseleave', 'ward-fill', () => {
    clearHover()
    map.getCanvas().style.cursor = ''
  })

  map.on('click', 'ward-fill', (event) => {
    if (isLocked()) return
    onWardClick(wardSummary(event.features[0].properties))
  })
}

/** The "You live here" pin: a label above a dot. */
function createHomePin() {
  const pin = document.createElement('div')
  pin.className = 'home-pin'
  const label = document.createElement('span')
  label.className = 'home-pin__label'
  label.textContent = 'You live here'
  const dot = document.createElement('span')
  dot.className = 'home-pin__dot'
  pin.append(label, dot)
  return pin
}
