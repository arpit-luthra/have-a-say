// The city map: 3D Toronto, with the 25 wards drawn on top in soft colours.
//
// React and MapLibre each want to control the screen, so the pattern is:
// - React renders one empty <div>.
// - MapLibre draws the map inside that div, and we talk to it through `mapRef`.
// - The selected ward and the home pin live in the parent (App). This component
//   reports clicks upward and reacts when those values change.

import { useEffect, useRef, useState } from 'react'
import { MapLibreMap, Marker, NavigationControl, Popup, setWorkerUrl } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
// MapLibre decodes map tiles in a background "worker" script. Vite moves files
// around when bundling, so we tell MapLibre where that file ends up.
// `?url` asks Vite for the file's final web address instead of its contents.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { loadWards, wardSummary } from '../lib/wardData.js'
import { INK, WARD_COLORS } from '../lib/theme.js'
import './WardMap.css'

setWorkerUrl(workerUrl)

// "Liberty" is OpenFreeMap's colourful style: green parks, blue water, warm streets.
const BASE_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty'
const LABELS_URL = '/data/toronto-ward-labels.geojson'
const MASK_URL = '/data/toronto-mask.geojson'

// Toronto's street grid is rotated about 17° from true north. Turning the map
// by the same amount makes the main streets look straight, like locals picture it.
const CAMERA_ANGLE = { bearing: -17, pitch: 45 }

// Respect the "reduce motion" setting some people turn on in their device.
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

export default function WardMap({ selectedWard, homeLocation, getHeaderBox, onSelectWard }) {
  const containerRef = useRef(null) // the <div> MapLibre draws into
  const mapRef = useRef(null) // the MapLibre map object
  const wardsRef = useRef(null) // the ward GeoJSON, once loaded
  const [isReady, setIsReady] = useState(false)

  // Facts the map's own event handlers need. Refs (not state) because those
  // handlers are created once and must always see the latest values.
  const selectedNumberRef = useRef(null) // which ward is selected right now
  const wardZoomRef = useRef(null) // the zoom we flew to for that ward
  const skipNextCameraMoveRef = useRef(false) // see the zoom-out check below

  // Keep the latest props in refs, for the same reason.
  const onSelectWardRef = useRef(onSelectWard)
  const getHeaderBoxRef = useRef(getHeaderBox)
  useEffect(() => {
    onSelectWardRef.current = onSelectWard
    getHeaderBoxRef.current = getHeaderBox
  })

  // --- 1. Create the map once, when the component first appears. ---
  useEffect(() => {
    let cancelled = false // set if the component disappears before loading finishes

    const map = new MapLibreMap({
      container: containerRef.current,
      style: BASE_STYLE_URL,
      center: [-79.38, 43.71], // roughly the middle of Toronto
      zoom: 10,
      ...CAMERA_ANGLE,
      maxPitch: 60,
    })
    mapRef.current = map
    map.addControl(new NavigationControl({ visualizePitch: true }), 'bottom-right')

    map.on('load', async () => {
      const wards = await loadWards()
      if (cancelled) return
      wardsRef.current = wards

      addMapLayers(map, wards)
      addHoverAndClick(map, (ward) => onSelectWardRef.current(ward))

      // Start with the whole city in view, then lock the map around it.
      const cityZoom = flyToWards(map, wards.features, 0, getHeaderBoxRef.current())
      lockToCity(map, wards.features, cityZoom)

      // If someone zooms out by hand while a ward is selected, they've moved on,
      // so go back to "All 25 wards". `fromApp` marks camera moves we made
      // ourselves, so those don't count.
      map.on('zoomend', (event) => {
        if (event.fromApp || selectedNumberRef.current === null) return
        if (map.getZoom() < wardZoomRef.current - 0.75) {
          skipNextCameraMoveRef.current = true // they chose this view; don't yank the camera
          onSelectWardRef.current(null)
        }
      })

      setIsReady(true)
    })

    // Clean-up: when the component goes away, free the map's memory.
    return () => {
      cancelled = true
      map.remove()
    }
  }, [])

  // --- 2. When the selected ward changes: highlight it, fade the rest, move the camera. ---
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
      }
      map.setFeatureState({ source: 'wards', id: ward.id }, state)
      map.setFeatureState({ source: 'ward-labels', id: ward.id }, state)
    }

    if (skipNextCameraMoveRef.current) {
      skipNextCameraMoveRef.current = false
      return
    }
    const selected = wards.find((ward) => ward.id === selectedNumber)
    const zoom = flyToWards(map, selected ? [selected] : wards, 1400, getHeaderBoxRef.current())
    if (selected) wardZoomRef.current = zoom
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
 * free part of the screen, at our turned-and-tilted 3D angle.
 * Returns the zoom level it flies to.
 */
function flyToWards(map, wardFeatures, duration, header) {
  const camera = fitCamera(map, outlinePoints(wardFeatures), screenSpace(map, header))
  map.flyTo(
    { ...camera, ...CAMERA_ANGLE, duration: prefersReducedMotion ? 0 : duration, essential: true },
    { fromApp: true }, // a tag on the move's events, so we can tell our moves from the user's
  )
  return camera.zoom
}

/** The part of the screen the wards should fit in: everything except the header panel. */
function screenSpace(map, header) {
  const width = map.getContainer().clientWidth
  const height = map.getContainer().clientHeight
  const margin = width < 600 ? 16 : 40
  const space = { left: margin, top: margin, right: width - margin, bottom: height - margin }
  // On wide screens the panel sits on the left, so start to its right;
  // on narrow screens (phones), start below it.
  if (width >= 900) space.left = header.right + margin / 2
  else space.top = header.bottom + margin / 2
  return space
}

/** Every 4th border point of the given wards: plenty to measure their shape. */
function outlinePoints(wardFeatures) {
  const points = []
  for (const ward of wardFeatures) {
    const polygons = ward.geometry.type === 'Polygon' ? [ward.geometry.coordinates] : ward.geometry.coordinates
    for (const [outerRing] of polygons) {
      outerRing.forEach((point, index) => index % 4 === 0 && points.push(point))
    }
  }
  return points
}

/**
 * Work out the camera (centre + zoom) that makes the points fill `space`.
 *
 * MapLibre's own fitBounds() can't do this for a turned and tilted map: on a
 * tilted map, things lower on the screen look bigger, so the city spilled off
 * phone screens. So we measure instead:
 *   1. Jump the camera to a first guess (instantly, behind the scenes).
 *   2. See where the points actually land on screen.
 *   3. Zoom by however much makes them fit, and shift so they're centred.
 *   4. Repeat a few times (each round gets closer), then jump back.
 * This all happens before the screen redraws, so you never see the jumps.
 */
function fitCamera(map, points, space) {
  const start = { center: map.getCenter(), zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch() }
  map.stop() // stop any flight in progress, so we measure from a still camera

  // First guess: centred on the middle of the points, at the current zoom.
  const lngs = points.map(([lng]) => lng)
  const lats = points.map(([, lat]) => lat)
  const middle = [(Math.min(...lngs) + Math.max(...lngs)) / 2, (Math.min(...lats) + Math.max(...lats)) / 2]
  let camera = { center: middle, zoom: start.zoom }

  for (let round = 0; round < 3; round++) {
    // a) Zoom so the shape is the right size. Zoom levels double the size each
    //    step, so the zoom change is log2 of how much bigger it could be.
    map.jumpTo({ ...camera, ...CAMERA_ANGLE }, { fromApp: true })
    let box = boxOnScreen(map, points)
    const scale = Math.min((space.right - space.left) / box.width, (space.bottom - space.top) / box.height)
    camera.zoom = Math.min(15, camera.zoom + Math.log2(scale))

    // b) At that new zoom, shift so the middle of the shape lands on the
    //    middle of the free space. (Measuring the shift *after* zooming
    //    matters: a shift worked out at the old zoom would be far too big.)
    map.jumpTo({ ...camera, ...CAMERA_ANGLE }, { fromApp: true })
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

/**
 * Stop people from wandering off into the rest of Ontario.
 *
 * 1. Zoom: a little room past the whole-city view, but no further out.
 * 2. Panning: if a drag leaves the centre of the map outside Toronto, glide
 *    it back to the nearest point inside.
 *
 * "Inside" means inside a rectangle that hugs the city. Toronto is tilted 17°
 * (like its street grid), so a plain north-south rectangle would include big
 * empty corners outside the city; we use a rectangle tilted by the same 17°.
 *
 * (MapLibre's built-in setMaxBounds was too strict on tall phone screens with
 * the tilted view: it forced the map to zoom in and cut off the edges of the city.)
 */
function lockToCity(map, wardFeatures, cityZoom) {
  map.setMinZoom(cityZoom - 0.4)

  // The city's edges, measured in the tilted ("street grid") direction.
  const gridPoints = outlinePoints(wardFeatures).map(toGrid)
  const xs = gridPoints.map(([x]) => x)
  const ys = gridPoints.map(([, y]) => y)
  const box = { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) }

  map.on('moveend', (event) => {
    if (event.fromApp) return // our own camera moves are always fine
    const { lng, lat } = map.getCenter()
    const [x, y] = toGrid([lng, lat])
    const insideX = Math.min(Math.max(x, box.minX), box.maxX)
    const insideY = Math.min(Math.max(y, box.minY), box.maxY)
    if (insideX !== x || insideY !== y) {
      map.easeTo(
        { center: fromGrid([insideX, insideY]), duration: prefersReducedMotion ? 0 : 450 },
        { fromApp: true },
      )
    }
  })
}

// Turning map positions into "street grid" directions and back.
// A degree of longitude is narrower than a degree of latitude this far north,
// so we shrink longitude by cos(latitude) first, to measure in equal units.
const GRID_ANGLE = (-CAMERA_ANGLE.bearing * Math.PI) / 180 // the same 17° we turn the map by
const LNG_SHRINK = Math.cos((43.7 * Math.PI) / 180) // Toronto is at about 43.7° north

function toGrid([lng, lat]) {
  const x = lng * LNG_SHRINK
  return [x * Math.cos(GRID_ANGLE) + lat * Math.sin(GRID_ANGLE), -x * Math.sin(GRID_ANGLE) + lat * Math.cos(GRID_ANGLE)]
}

function fromGrid([gx, gy]) {
  const x = gx * Math.cos(GRID_ANGLE) - gy * Math.sin(GRID_ANGLE)
  const lat = gx * Math.sin(GRID_ANGLE) + gy * Math.cos(GRID_ANGLE)
  return [x / LNG_SHRINK, lat]
}

/** Draw everything we add on top of the base map. */
function addMapLayers(map, wards) {
  // Liberty's own 3D buildings only appear at zoom 14+. We add our own below
  // that start at zoom 13, so remove theirs to avoid drawing buildings twice.
  if (map.getLayer('building-3d')) map.removeLayer('building-3d')
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

  // Put the ward colours *under* street and place names so those stay readable.
  const firstLabelLayer = map.getStyle().layers.find((layer) => layer.type === 'symbol')
  const beforeLabels = firstLabelLayer?.id

  // A small helper to read the hover/selected/dimmed tags inside paint rules.
  const is = (tag) => ['boolean', ['feature-state', tag], false]

  // Each ward's soft see-through colour, picked from WARD_COLORS by its colour group.
  map.addLayer(
    {
      id: 'ward-fill',
      type: 'fill',
      source: 'wards',
      paint: {
        // ['match', value, 0, colour0, 1, colour1, ..., fallback] works like a lookup table.
        'fill-color': ['match', ['get', 'color_group'], ...WARD_COLORS.flatMap((color, group) => [group, color]), INK],
        // Stronger colours when zoomed out (to tell wards apart), lighter when
        // zoomed in (so streets stay readable). In each `case`, the first match wins.
        'fill-opacity': [
          'interpolate', ['linear'], ['zoom'],
          10, ['case', is('hover'), 0.6, is('selected'), 0.5, is('dimmed'), 0.1, 0.38],
          14, ['case', is('hover'), 0.3, is('selected'), 0.12, is('dimmed'), 0.05, 0.16],
        ],
      },
    },
    beforeLabels,
  )

  // Borders: thin normally, thicker on hover, thickest when selected.
  map.addLayer(
    {
      id: 'ward-line',
      type: 'line',
      source: 'wards',
      layout: { 'line-join': 'round' },
      paint: {
        'line-color': INK,
        'line-width': ['case', is('selected'), 3.5, is('hover'), 2.5, 1],
        'line-opacity': ['case', is('selected'), 0.9, is('hover'), 0.9, is('dimmed'), 0.25, 0.55],
      },
    },
    beforeLabels,
  )

  // 3D buildings, using building heights from OpenStreetMap (via OpenFreeMap's tiles).
  // They appear from zoom 13 and grow to full height by 13.5, so they don't "pop" in.
  map.addLayer(
    {
      id: 'buildings-3d',
      type: 'fill-extrusion',
      source: 'openmaptiles',
      'source-layer': 'building',
      minzoom: 13,
      paint: {
        'fill-extrusion-color': '#e4ddd1',
        'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 13, 0, 13.5, ['get', 'render_height']],
        'fill-extrusion-base': ['interpolate', ['linear'], ['zoom'], 13, 0, 13.5, ['get', 'render_min_height']],
        'fill-extrusion-opacity': 0.9,
      },
    },
    beforeLabels,
  )

  // Fade out everything outside Toronto: a pale sheet with a Toronto-shaped hole.
  // Added on top of the labels, so place names outside the city fade too.
  map.addLayer({
    id: 'outside-mask',
    type: 'fill',
    source: 'toronto-mask',
    paint: { 'fill-color': '#efece6', 'fill-opacity': 0.85 },
  })
  // The edge of that hole is the city border: draw it as a crisp line.
  map.addLayer({
    id: 'city-border',
    type: 'line',
    source: 'toronto-mask',
    layout: { 'line-join': 'round' },
    paint: { 'line-color': INK, 'line-width': 1.5, 'line-opacity': 0.7 },
  })

  // Ward number badges: a white circle with the number on top.
  // They grow a little as you zoom in (interpolate between zoom 9 and 13).
  map.addLayer({
    id: 'ward-badge',
    type: 'circle',
    source: 'ward-labels',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 9, 13, 14],
      'circle-color': ['case', is('selected'), INK, '#ffffff'],
      'circle-stroke-color': INK,
      'circle-stroke-width': 1.25,
      'circle-opacity': ['case', is('dimmed'), 0.5, 1],
      'circle-stroke-opacity': ['case', is('dimmed'), 0.4, 0.9],
    },
  })
  map.addLayer({
    id: 'ward-badge-number',
    type: 'symbol',
    source: 'ward-labels',
    layout: {
      'text-field': ['to-string', ['get', 'ward_number']],
      'text-font': ['Noto Sans Bold'],
      'text-size': ['interpolate', ['linear'], ['zoom'], 9, 10, 13, 14],
      'text-allow-overlap': true, // always show every badge, even when crowded
      'text-ignore-placement': true,
    },
    paint: {
      'text-color': ['case', is('selected'), '#ffffff', INK],
      'text-opacity': ['case', is('dimmed'), 0.5, 1],
    },
  })
}

/** Light up a ward and show its details on hover; report clicks and taps. */
function addHoverAndClick(map, onWardClick) {
  // A small label that follows the mouse. No close button: it hides on mouse leave.
  const tooltip = new Popup({ closeButton: false, closeOnClick: false, offset: 16, className: 'ward-tooltip' })
  let hoveredId = null

  function clearHover() {
    if (hoveredId !== null) map.setFeatureState({ source: 'wards', id: hoveredId }, { hover: false })
    hoveredId = null
  }

  map.on('mousemove', 'ward-fill', (event) => {
    const ward = event.features[0]
    if (ward.id !== hoveredId) {
      clearHover()
      hoveredId = ward.id
      map.setFeatureState({ source: 'wards', id: hoveredId }, { hover: true })
      tooltip.setDOMContent(tooltipContent(ward.properties))
    }
    map.getCanvas().style.cursor = 'pointer'
    tooltip.setLngLat(event.lngLat).addTo(map)
  })

  map.on('mouseleave', 'ward-fill', () => {
    clearHover()
    map.getCanvas().style.cursor = ''
    tooltip.remove()
  })

  // Clicks (and taps on phones) select the ward. The header now shows the same
  // details, so close the hover card (on phones it would linger after a tap).
  map.on('click', 'ward-fill', (event) => {
    tooltip.remove()
    onWardClick(wardSummary(event.features[0].properties))
  })
}

/**
 * The tooltip's contents. Built with textContent (not HTML strings), so any
 * text from the data is always shown as plain text, never run as code.
 */
function tooltipContent(properties) {
  const root = document.createElement('div')
  root.className = 'ward-tooltip__body'
  const title = document.createElement('strong')
  title.textContent = `Ward ${properties.ward_number} · ${properties.ward_name}`
  const places = document.createElement('span')
  places.textContent = properties.neighbourhoods
  root.append(title, places)
  return root
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
