// The top-level screen: a full-screen map of Toronto with a search bar floating on top.
//
// App holds one piece of memory: `homeLocation`, the spot of the last search.
// It is never saved: refresh the page and it's gone.

import { useState } from 'react'
import CityMap from './components/CityMap.jsx'
import FindWard from './components/FindWard.jsx'
import './App.css'

export default function App() {
  // null, or { lng, lat } after a search.
  const [homeLocation, setHomeLocation] = useState(null)

  return (
    <main className="app">
      <CityMap homeLocation={homeLocation} />
      <FindWard onFound={({ location }) => setHomeLocation(location)} />
    </main>
  )
}
