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
import { allItems } from '../lib/allItems.js'
import './Home.css'

const PAGE_SIZE = 20

export default function Home() {
  const [homeLocation, setHomeLocation] = useState(null)
  const [filters, setFilters] = useState(NO_FILTERS)
  const [visible, setVisible] = useState(PAGE_SIZE) // how many cards to show ("load more")
  const shown = filterDecisions([...allItems], filters, homeLocation)
  const [showMap, setShowMap] = useState(false) // only matters on phones

  return (
    <main className={`home ${showMap ? 'home--map' : ''}`}>
      <section className="home__list">
        <h1 className="home__title">Decisions near you</h1>
        <FindWard onFound={({ location }) => {
          setHomeLocation(location)
          setFilters((f) => ({ ...f, sort: 'Closest to me' }))
        }} />
        <FilterBar
          filters={filters}
          onChange={(next) => {
            setFilters(next)
            setVisible(PAGE_SIZE) // new filter -> start from the top again
          }}
          count={shown.length}
        />
        <ul className="home__cards">
          {shown.slice(0, visible).map((decision) => (
            <li key={decision.id}>
              <DecisionCard decision={decision} />
            </li>
          ))}
        </ul>
        {visible < shown.length && (
          <button className="home__more" type="button" onClick={() => setVisible(visible + PAGE_SIZE)}>
            Load more ({shown.length - visible} left)
          </button>
        )}
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
