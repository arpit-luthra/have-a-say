// The top-level screen. For now: the map plus a small header.
//
// App owns `selectedWard` because more than one part of the page needs it:
// the map (to zoom and highlight) and, from step 3, the side panel of decisions.

import { useState } from 'react'
import WardMap from './components/WardMap.jsx'
import './App.css'

export default function App() {
  // null = whole city view. Otherwise { number, name } of the chosen ward.
  const [selectedWard, setSelectedWard] = useState(null)

  return (
    <main className="app">
      <WardMap
        selectedWardNumber={selectedWard?.number ?? null}
        onSelectWard={setSelectedWard}
      />

      <header className="app-header">
        <p className="app-header__eyebrow">City of Toronto</p>
        {selectedWard ? (
          <>
            <h1 className="app-header__title">
              Ward {selectedWard.number} · {selectedWard.name}
            </h1>
            <button className="app-header__back" onClick={() => setSelectedWard(null)}>
              ← All 25 wards
            </button>
          </>
        ) : (
          <>
            <h1 className="app-header__title">Choose a ward</h1>
            <p className="app-header__hint">Tap a ward on the map to see it up close.</p>
          </>
        )}
      </header>
    </main>
  )
}
