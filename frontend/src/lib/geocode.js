// Turns an address or postal code into a map position (this is called "geocoding").
//
// We use Nominatim, OpenStreetMap's free search. Its usage rules: at most one
// request per second, and credit OpenStreetMap (the page shows the credit).
// Autocomplete is allowed here because the search box waits 300 ms after the
// person stops typing before asking (see FindWard.jsx), and shows max 5 results.
//
// Privacy: the typed address goes to Nominatim to be looked up. This app never
// saves it: not in the browser, not on a server.

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'

// Only look inside a box around Toronto, so "King St" finds Toronto's King St.
// Order: west, north, east, south.
const TORONTO_VIEWBOX = '-79.64,43.86,-79.11,43.57'

/** Shared search: asks Nominatim for up to `limit` places inside Toronto. */
async function searchNominatim(text, limit, signal) {
  const params = new URLSearchParams({
    q: `${text}, Toronto`,
    format: 'jsonv2',
    addressdetails: '1',
    limit: String(limit),
    countrycodes: 'ca',
    viewbox: TORONTO_VIEWBOX,
    bounded: '1', // only return results inside the box
    'accept-language': 'en',
  })
  const response = await fetch(`${NOMINATIM_URL}?${params}`, { signal })
  if (!response.ok) throw new Error(`Address search failed (${response.status})`)
  return response.json()
}

/** A short label for a result, like "245 Eglinton Avenue East, Toronto". */
function labelFor(result) {
  const a = result.address ?? {}
  const street = [a.house_number, a.road].filter(Boolean).join(' ')
  const area = a.suburb || a.neighbourhood || a.city_district
  const first = street || result.name || result.display_name.split(',')[0]
  return [first, area, a.postcode].filter(Boolean).join(', ')
}

/**
 * Look up an address. Returns { lng, lat }, or null if nothing was found.
 * Throws if the search service can't be reached.
 */
export async function geocodeAddress(text) {
  const results = await searchNominatim(text, 1)
  if (results.length === 0) return null
  return { lng: Number(results[0].lon), lat: Number(results[0].lat) }
}

/**
 * Autocomplete: up to 5 matching Toronto places as { label, lng, lat }.
 * `signal` lets the caller cancel the request if the person keeps typing.
 */
export async function suggestAddresses(text, signal) {
  const results = await searchNominatim(text, 5, signal)
  const seen = new Set() // drop suggestions that read exactly the same
  return results
    .map((r) => ({ label: labelFor(r), lng: Number(r.lon), lat: Number(r.lat) }))
    .filter((s) => !seen.has(s.label) && seen.add(s.label))
}
