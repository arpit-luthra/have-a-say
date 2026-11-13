// Loads the ward file once and shares it.
// Both the map and the "Find my ward" search need the ward shapes. Keeping the
// download here means it happens a single time, however many parts ask for it.

const WARDS_URL = '/data/toronto-wards.geojson'

let wardsPromise = null

export function loadWards() {
  if (!wardsPromise) {
    wardsPromise = fetch(WARDS_URL).then((response) => {
      if (!response.ok) throw new Error(`Could not load ward data (${response.status})`)
      return response.json()
    })
  }
  return wardsPromise
}

/** The few ward details the page shows, taken from a ward's properties. */
export function wardSummary(properties) {
  return {
    number: properties.ward_number,
    name: properties.ward_name,
    neighbourhoods: properties.neighbourhoods,
    colorGroup: properties.color_group,
  }
}
