// Turns an address or postal code into a map position (this is called "geocoding").
//
// We use Nominatim, OpenStreetMap's free search. Its usage rules: at most one
// search per second, no search-as-you-type, and credit OpenStreetMap. So we only
// search when the person presses "Find", and the page shows the credit.
//
// Privacy: the typed address goes to Nominatim to be looked up. This app never
// saves it: not in the browser, not on a server.

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'

// Only look inside a box around Toronto, so "King St" finds Toronto's King St.
// Order: west, north, east, south.
const TORONTO_VIEWBOX = '-79.64,43.86,-79.11,43.57'

/**
 * Look up an address. Returns { lng, lat }, or null if nothing was found.
 * Throws if the search service can't be reached.
 */
export async function geocodeAddress(text) {
  const params = new URLSearchParams({
    q: `${text}, Toronto`,
    format: 'jsonv2',
    limit: '1',
    countrycodes: 'ca',
    viewbox: TORONTO_VIEWBOX,
    bounded: '1', // only return results inside the box
    'accept-language': 'en',
  })

  const response = await fetch(`${NOMINATIM_URL}?${params}`)
  if (!response.ok) throw new Error(`Address search failed (${response.status})`)

  const results = await response.json()
  if (results.length === 0) return null
  return { lng: Number(results[0].lon), lat: Number(results[0].lat) }
}
