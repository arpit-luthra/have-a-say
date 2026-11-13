// The top-level screen: a full-screen map with controls floating on top.
//
// Two "pages" share one map, chosen by the web address:
// - /          the city poster, with the "Find my ward" search bar
// - /ward/7    one ward on its own, with a back button and the ward's name
// The address is the single source of truth, so links, refreshes and the
// browser's back button all work. We use the browser's History API directly
// (no router library) because we only have these two pages.
//
// Nothing is saved: the home pin lives in memory only.

import { useEffect, useState } from 'react'
import WardMap from './components/WardMap.jsx'
import FindWard from './components/FindWard.jsx'
import { loadWards, wardSummary } from './lib/wardData.js'
import './App.css'

/** "/ward/7" -> 7. Any other address -> null (the city view). */
function wardNumberFromAddress() {
  const match = window.location.pathname.match(/^\/ward\/(\d+)\/?$/)
  return match ? Number(match[1]) : null
}

export default function App() {
  // null = whole-city view. Otherwise { number, name, neighbourhoods, colorGroup }.
  const [selectedWard, setSelectedWard] = useState(null)
  // null, or { lng, lat } after a search.
  const [homeLocation, setHomeLocation] = useState(null)

  // Make the page match the web address: on first load, and whenever the
  // browser's back/forward buttons are used.
  useEffect(() => {
    async function syncWithAddress() {
      const number = wardNumberFromAddress()
      if (number === null) return setSelectedWard(null)
      const wards = await loadWards()
      const ward = wards.features.find((feature) => feature.properties.ward_number === number)
      // An unknown number (like /ward/99) just shows the city.
      setSelectedWard(ward ? wardSummary(ward.properties) : null)
    }
    syncWithAddress()
    window.addEventListener('popstate', syncWithAddress)
    return () => window.removeEventListener('popstate', syncWithAddress)
  }, [])

  // Opening a ward adds a new entry to the browser history, like a real page.
  function openWard(ward) {
    window.history.pushState(null, '', `/ward/${ward.number}`)
    setSelectedWard(ward)
  }

  function showAllWards() {
    window.history.pushState(null, '', '/')
    setSelectedWard(null)
  }

  function handleFound({ location, ward }) {
    setHomeLocation(location)
    openWard(ward)
  }

  return (
    <main className="app">
      <WardMap selectedWard={selectedWard} homeLocation={homeLocation} onSelectWard={openWard} />

      {selectedWard ? (
        <div className="ward-bar">
          <button className="ward-bar__back" onClick={showAllWards}>
            ← All wards
          </button>
          <h1 className="ward-bar__name">
            Ward {selectedWard.number} · {selectedWard.name}
          </h1>
        </div>
      ) : (
        <FindWard onFound={handleFound} />
      )}
    </main>
  )
}
