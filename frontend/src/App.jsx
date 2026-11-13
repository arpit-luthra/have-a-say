// The top-level screen: the map plus a small header panel floating over it.
//
// App owns the two pieces of memory that several parts of the page need:
// - selectedWard: which ward is open (the map zooms to it, the header describes it)
// - home: where "You live here" goes, after a "Find my ward" search
// Neither is ever saved: refresh the page and both are gone.

import { useRef, useState } from 'react'
import WardMap from './components/WardMap.jsx'
import FindWard from './components/FindWard.jsx'
import { WARD_COLORS } from './lib/theme.js'
import './App.css'

export default function App() {
  // null = whole-city view. Otherwise { number, name, neighbourhoods, colorGroup }.
  const [selectedWard, setSelectedWard] = useState(null)
  // null, or { location: { lng, lat }, wardNumber } after a search.
  const [home, setHome] = useState(null)

  // The map needs to know where the header panel ends, so it can keep the city
  // out from under it. Measured at the moment the map moves, so it's always current.
  const headerRef = useRef(null)
  const getHeaderBox = () => {
    const header = headerRef.current
    if (!header) return { right: 0, bottom: 0 }
    return { right: header.offsetLeft + header.offsetWidth, bottom: header.offsetTop + header.offsetHeight }
  }

  function handleFound({ location, ward }) {
    setHome({ location, wardNumber: ward.number })
    setSelectedWard(ward)
  }

  const isHomeWard = selectedWard && home?.wardNumber === selectedWard.number

  return (
    <main className="app">
      <WardMap
        selectedWard={selectedWard}
        homeLocation={home?.location ?? null}
        getHeaderBox={getHeaderBox}
        onSelectWard={setSelectedWard}
      />

      <header className="app-header" ref={headerRef}>
        {/* `key` makes React treat each ward as a fresh block, which replays the fade-in. */}
        <div className="app-header__body" key={selectedWard?.number ?? 'city'}>
          {selectedWard ? (
            <>
              <p className="app-header__eyebrow">
                <span
                  className="app-header__swatch"
                  style={{ background: WARD_COLORS[selectedWard.colorGroup] }}
                />
                Ward {selectedWard.number}
                {isHomeWard && ' · Your ward'}
              </p>
              <h1 className="app-header__title">{selectedWard.name}</h1>
              <p className="app-header__hint">Includes {selectedWard.neighbourhoods}</p>
              <button className="app-header__back" onClick={() => setSelectedWard(null)}>
                ← All 25 wards
              </button>
            </>
          ) : (
            <>
              <p className="app-header__eyebrow">City of Toronto</p>
              <h1 className="app-header__title">All 25 wards</h1>
              <p className="app-header__hint">Tap a ward to see it up close.</p>
            </>
          )}
        </div>

        <FindWard onFound={handleFound} />
      </header>
    </main>
  )
}
