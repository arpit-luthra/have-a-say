// The city map: 3D Toronto with the 25 wards drawn on top.
//
// React and MapLibre each want to control the screen, so the pattern is:
// - React renders one empty <div>.
// - MapLibre draws the map inside that div, and we talk to it through `mapRef`.
// - The *selected ward* lives in the parent (App), so other parts of the page
//   (like the side panel in later steps) can use it. This component just
//   reports clicks upward and reacts when the selection changes.

import { useEffect, useRef, useState } from 'react'
import { MapLibreMap, NavigationControl, Popup, setWorkerUrl } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
// MapLibre does its heavy lifting (decoding map tiles) in a background "worker"
// script. By default it looks for that file next to itself, but Vite moves files
// around when bundling, so we tell it where the file ends up. `?url` asks Vite
// for the final web address of the file instead of its contents.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { getBounds, getBoundsOfAll } from '../lib/geo.js'
import './WardMap.css'

// Free, no API key. "Positron" is a quiet light-grey base map, so our own
// layers (wards, decisions) are what stands out.
const BASE_STYLE_URL = 'https://tiles.openfreemap.org/styles/positron'
const WARDS_URL = '/data/toronto-wards.geojson'

setWorkerUrl(workerUrl)

// Map paint colours can't read CSS variables, so they live here.
// Keep these in sync with the tokens in index.css.
const COLORS = {
  wardLine: '#26303b',
  wardFill: '#3d5a73',
  building: '#e2e0da',
}

// Toronto's street grid is rotated about 17° from true north. Turning the map
// by the same amount makes the main streets look straight, like locals picture it.
const CAMERA_ANGLE = { bearing: -17, pitch: 45 }

export default function WardMap({ selectedWardNumber, onSelectWard }) {
  const containerRef = useRef(null) // the <div> MapLibre draws into
  const mapRef = useRef(null) // the MapLibre map object
  const wardsRef = useRef(null) // the ward GeoJSON, once loaded
  const [isReady, setIsReady] = useState(false)

  // Keep the latest callback in a ref. MapLibre's click handler is created once,
  // so without this it would keep calling an old copy of onSelectWard.
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
      ...CAMERA_ANGLE,
      maxPitch: 60,
    })
    mapRef.current = map
    map.addControl(new NavigationControl({ visualizePitch: true }), 'bottom-right')

    map.on('load', async () => {
      const response = await fetch(WARDS_URL)
      const wards = await response.json()
      if (cancelled) return
      wardsRef.current = wards

      addWardAndBuildingLayers(map, wards)
      addHoverAndClick(map, (ward) => onSelectWardRef.current(ward))

      // Start with the whole city in view (duration 0 = jump there, no animation).
      flyToBounds(map, getBoundsOfAll(wards.features), 0)
      setIsReady(true)
    })

    // Clean-up: when the component goes away, free the map's memory and WebGL context.
    return () => {
      cancelled = true
      map.remove()
    }
  }, [])

  // --- 2. Whenever the selected ward changes, highlight it and move the camera. ---
  useEffect(() => {
    if (!isReady) return
    const map = mapRef.current
    const wards = wardsRef.current.features

    // "Feature state" is MapLibre's way of tagging one shape (e.g. selected: true)
    // so the paint rules below can style it differently, without re-drawing all data.
    for (const ward of wards) {
      map.setFeatureState({ source: 'wards', id: ward.id }, { selected: ward.id === selectedWardNumber })
    }

    const selected = wards.find((ward) => ward.id === selectedWardNumber)
    const bounds = selected ? getBounds(selected.geometry) : getBoundsOfAll(wards)
    flyToBounds(map, bounds, 1200)
  }, [selectedWardNumber, isReady])

  return <div ref={containerRef} className="ward-map" aria-label="Map of Toronto's 25 wards" />
}

/**
 * Smoothly move the camera so a box (a ward, or the whole city) fills the screen,
 * then turn and tilt it to our 3D angle.
 *
 * Why not just fitBounds() with the angle? MapLibre would fit the *rotated*
 * north-aligned box, which is much bigger than the city itself, so Toronto
 * ended up tiny on phones. Toronto's shape follows its street grid, so working
 * out the zoom un-rotated and then rotating gives a much snugger fit.
 */
function flyToBounds(map, bounds, duration) {
  const isSmallScreen = map.getContainer().clientWidth < 600
  const camera = map.cameraForBounds(bounds, { padding: isSmallScreen ? 16 : 60, maxZoom: 15 })
  map.flyTo({ ...camera, ...CAMERA_ANGLE, duration })
}

/** Draw ward fills, ward outlines and 3D buildings. */
function addWardAndBuildingLayers(map, wards) {
  map.addSource('wards', {
    type: 'geojson',
    data: wards,
    attribution: 'Ward boundaries: <a href="https://open.toronto.ca/dataset/city-wards/">City of Toronto Open Data</a>',
  })

  // Put our layers *under* the street and place labels so those stay readable.
  const firstLabelLayer = map.getStyle().layers.find((layer) => layer.type === 'symbol')
  const beforeId = firstLabelLayer?.id

  // Light translucent fill. ['feature-state', ...] reads the tags set in setFeatureState.
  map.addLayer(
    {
      id: 'ward-fill',
      type: 'fill',
      source: 'wards',
      paint: {
        'fill-color': COLORS.wardFill,
        'fill-opacity': [
          'case',
          ['boolean', ['feature-state', 'hover'], false], 0.18,
          ['boolean', ['feature-state', 'selected'], false], 0.1,
          0.04,
        ],
      },
    },
    beforeId,
  )

  // Thin dark outline; thicker for the selected ward.
  map.addLayer(
    {
      id: 'ward-line',
      type: 'line',
      source: 'wards',
      paint: {
        'line-color': COLORS.wardLine,
        'line-width': ['case', ['boolean', ['feature-state', 'selected'], false], 2.5, 0.9],
        'line-opacity': 0.75,
      },
    },
    beforeId,
  )

  // 3D buildings, using building heights from OpenStreetMap (via OpenFreeMap's tiles).
  // They only appear when zoomed in (zoom 13+), and grow from flat to full height
  // between zoom 13 and 13.5 so they don't suddenly "pop" in.
  map.addLayer(
    {
      id: 'buildings-3d',
      type: 'fill-extrusion',
      source: 'openmaptiles',
      'source-layer': 'building',
      minzoom: 13,
      paint: {
        'fill-extrusion-color': COLORS.building,
        'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 13, 0, 13.5, ['get', 'render_height']],
        'fill-extrusion-base': ['interpolate', ['linear'], ['zoom'], 13, 0, 13.5, ['get', 'render_min_height']],
        'fill-extrusion-opacity': 0.85,
      },
    },
    beforeId,
  )
}

/** Show the ward name on hover, and report clicks. */
function addHoverAndClick(map, onWardClick) {
  // A small label that follows the mouse. No close button: it hides on mouse leave.
  const tooltip = new Popup({ closeButton: false, closeOnClick: false, offset: 14, className: 'ward-tooltip' })
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
    }
    map.getCanvas().style.cursor = 'pointer'
    tooltip
      .setLngLat(event.lngLat)
      .setText(`Ward ${ward.properties.ward_number} · ${ward.properties.ward_name}`)
      .addTo(map)
  })

  map.on('mouseleave', 'ward-fill', () => {
    clearHover()
    map.getCanvas().style.cursor = ''
    tooltip.remove()
  })

  // Clicks (and taps on phones) on a ward select it.
  map.on('click', 'ward-fill', (event) => {
    const ward = event.features[0]
    onWardClick({ number: ward.properties.ward_number, name: ward.properties.ward_name })
  })
}
