// The city map: a detailed, Google-Maps-style map of Toronto, locked to the city.
//
// React and MapLibre each want to control the screen, so the pattern is:
// - React renders one empty <div>.
// - MapLibre draws the map inside that div, and we talk to it through `mapRef`.
// - The "You live here" pin lives in the parent (App); this component reacts when it changes.

import { useEffect, useRef, useState } from 'react'
import { MapLibreMap, Marker, NavigationControl, setWorkerUrl } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
// MapLibre decodes map tiles in a background "worker" script. Vite moves files
// around when bundling, so we tell MapLibre where that file ends up.
// `?url` asks Vite for the file's final web address instead of its contents.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { loadWards } from '../lib/wardData.js'
import { findWardAt } from '../lib/geo.js'
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

export default function CityMap({ homeLocation }) {
  const containerRef = useRef(null) // the <div> MapLibre draws into
  const mapRef = useRef(null) // the MapLibre map object
  const [isReady, setIsReady] = useState(false)

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
      const camera = fitCity(map, outlinePoints(wards.features, 3))
      map.jumpTo({ ...camera, bearing: BEARING, pitch: 0 }, { fromApp: true })
      map.setMinZoom(camera.zoom - 0.01) // tiny allowance so rounding can't trip the limit
      keepInsideToronto(map, wards.features)

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
      { center: [homeLocation.lng, homeLocation.lat], zoom: 15, duration: prefersReducedMotion ? 0 : 1400, essential: true },
      { fromApp: true }, // a tag on the move's events, so we can tell our moves from the user's
    )
    return () => marker.remove() // removed when the location changes or the page closes
  }, [homeLocation, isReady])

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
