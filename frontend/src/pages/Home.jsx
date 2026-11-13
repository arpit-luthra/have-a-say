// Home page: decision list on the left, map on the right.
// On a phone the list shows first and a "Map" button swaps to the map.
//
// `homeLocation` is the spot of the last search. It is never saved.

import { useEffect, useMemo, useState } from 'react'
import CityMap from '../components/CityMap.jsx'
import MapPanel from '../components/MapPanel.jsx'
import FindWard from '../components/FindWard.jsx'
import DecisionCard from '../components/DecisionCard.jsx'
import FilterBar, { NO_FILTERS } from '../components/FilterBar.jsx'
import { filterDecisions } from '../lib/filterDecisions.js'
import { allItems } from '../lib/allItems.js'
import { useResident } from '../lib/ResidentContext.jsx'
import './Home.css'

const PAGE_SIZE = 20

export default function Home() {
  const { homeLocation, setFound } = useResident() // kept in memory for the whole visit
  const [filters, setFilters] = useState(NO_FILTERS)
  const [visible, setVisible] = useState(PAGE_SIZE) // how many cards to show ("load more")
  const [hoveredId, setHoveredId] = useState(null) // card <-> pin highlight
  // useMemo = only redo this when the filters or location change (not on every hover),
  // so the map isn't handed new pin data each time the mouse moves.
  const shown = useMemo(() => filterDecisions([...allItems], filters, homeLocation), [filters, homeLocation])
  const pins = useMemo(() => shown.filter((d) => d.lat != null), [shown]) // pins only for decisions in the list

  // The decision whose pin was clicked. If a filter then removes it from the list, it is deselected.
  const [selectedId, setSelectedId] = useState(null)
  const selected = pins.find((d) => d.id === selectedId) ?? null

  // Clicking a pin: make sure its card is on screen (the list loads 20 at a time), then scroll to it.
  const [scrolledTo, setScrolledTo] = useState(null) // so "Load more" doesn't scroll the list again
  useEffect(() => {
    if (!selected || scrolledTo === selected.id) return
    const position = shown.findIndex((d) => d.id === selected.id)
    if (position >= visible) return setVisible(Math.ceil((position + 1) / PAGE_SIZE) * PAGE_SIZE)
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    document.getElementById(`card-${selected.id}`)?.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' })
    setScrolledTo(selected.id)
  }, [selected?.id, visible]) // eslint-disable-line react-hooks/exhaustive-deps
  const [showMap, setShowMap] = useState(false) // only matters on phones

  return (
    <main className={`home ${showMap ? 'home--map' : ''}`}>
      <section className="home__list">
        <h1 className="home__title">Decisions near you</h1>
        <FindWard onFound={(found) => {
          setFound(found)
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
        <p className="home__mapnote">
          {pins.length} of {shown.length} decisions shown on the map (decisions without a street address aren't mapped).
        </p>
        <ul className="home__cards">
          {shown.slice(0, visible).map((decision) => (
            <li key={decision.id}>
              <DecisionCard decision={decision} active={hoveredId === decision.id || selected?.id === decision.id} onHover={setHoveredId} />
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
        <CityMap
          homeLocation={homeLocation}
          pins={pins}
          hoveredId={hoveredId}
          selectedId={selected?.id ?? null}
          onHoverPin={setHoveredId}
          onSelectPin={(id) => {
            setSelectedId(id)
            setScrolledTo(null)
          }}
        />
        <MapPanel decision={selected} onBack={() => {
            setSelectedId(null)
            setScrolledTo(null)
          }} />
      </section>

      <button className="home__toggle" type="button" onClick={() => setShowMap(!showMap)}>
        {showMap ? 'List' : 'Map'}
      </button>
    </main>
  )
}
