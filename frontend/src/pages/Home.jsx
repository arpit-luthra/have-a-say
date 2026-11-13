// Home page: decision list on the left, map on the right.
// On a phone the list shows first and a "Map" button swaps to the map.
//
// `homeLocation` is the spot of the last search. It is never saved.

import { useState } from 'react'
import CityMap from '../components/CityMap.jsx'
import FindWard from '../components/FindWard.jsx'
import DecisionCard from '../components/DecisionCard.jsx'
import FilterBar, { NO_FILTERS } from '../components/FilterBar.jsx'
import { filterDecisions } from '../lib/filterDecisions.js'
import decisions from '../data/decisions.json'
import './Home.css'

export default function Home() {
  const [homeLocation, setHomeLocation] = useState(null)
  const [filters, setFilters] = useState(NO_FILTERS)
  const shown = filterDecisions([...decisions], filters, homeLocation)
  const [showMap, setShowMap] = useState(false) // only matters on phones

  return (
    <main className={`home ${showMap ? 'home--map' : ''}`}>
      <section className="home__list">
        <h1 className="home__title">Decisions near you</h1>
        <FindWard onFound={({ location }) => {
          setHomeLocation(location)
          setFilters((f) => ({ ...f, sort: 'Closest to me' }))
        }} />
        <FilterBar filters={filters} onChange={setFilters} count={shown.length} />
        <ul className="home__cards">
          {shown.map((decision) => (
            <li key={decision.id}>
              <DecisionCard decision={decision} />
            </li>
          ))}
        </ul>
      </section>

      {/* Always rendered (even when hidden on phones) so the map keeps its size. */}
      <section className="home__map">
        <CityMap homeLocation={homeLocation} />
      </section>

      <button className="home__toggle" type="button" onClick={() => setShowMap(!showMap)}>
        {showMap ? 'List' : 'Map'}
      </button>
    </main>
  )
}
