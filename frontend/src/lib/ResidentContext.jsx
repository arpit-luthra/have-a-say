// Remembers the resident's searched location and ward while the page is open, so the
// list, the cards and the decision page can all use it.
// It lives only in memory (React state): never saved in the browser or sent anywhere.

import { createContext, useContext, useState } from 'react'
import { loadWards, wardSummary } from './wardData.js'
import { findWardAt } from './geo.js'

const ResidentContext = createContext({ homeLocation: null, ward: null, setFound: () => {}, clearFound: () => {} })

export function ResidentProvider({ children }) {
  const [homeLocation, setHomeLocation] = useState(null)
  const [ward, setWard] = useState(null) // { number, name, ... } or null

  // Address search gives us the ward already. "Current location" only gives a spot,
  // so then we work the ward out from the ward shapes.
  async function setFound({ location, ward: foundWard }) {
    setHomeLocation(location)
    if (foundWard) return setWard(foundWard)
    try {
      const wards = await loadWards()
      const match = findWardAt(location.lng, location.lat, wards.features)
      setWard(match ? wardSummary(match.properties) : null)
    } catch {
      setWard(null)
    }
  }

  // The "×" in the search box: forget the address and ward again (they were only ever kept in memory).
  function clearFound() {
    setHomeLocation(null)
    setWard(null)
  }

  return <ResidentContext.Provider value={{ homeLocation, ward, setFound, clearFound }}>{children}</ResidentContext.Provider>
}

export function useResident() {
  return useContext(ResidentContext)
}
