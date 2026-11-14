// Home page: decision list on the left, map on the right.
// On a phone the list shows first and a "Map" button swaps to the map.
//
// `homeLocation` is the spot of the last search. It is never saved.

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import CityMap from '../components/CityMap.jsx'
import MapPanel from '../components/MapPanel.jsx'
import FindWard from '../components/FindWard.jsx'
import DecisionCard from '../components/DecisionCard.jsx'
import FilterBar, { NO_FILTERS } from '../components/FilterBar.jsx'
import { filterDecisions, STATUS_TOGGLE } from '../lib/filterDecisions.js'
import { distanceKm } from '../lib/geo.js'
import { allItems } from '../lib/allItems.js'
import { useResident } from '../lib/ResidentContext.jsx'
import './Home.css'

const PAGE_SIZE = 20
const NEAR_KM = 2
const WIDE_KM = 5

export default function Home() {
  const { homeLocation, setFound } = useResident() // kept in memory for the whole visit
  const [filters, setFilters] = useState({ ...NO_FILTERS, sort: 'Closest to me' })
  const [radius, setRadius] = useState(NEAR_KM) // km around the searched spot
  const focusId = useSearchParams()[0].get('focus') // from a decision page's "Show on map" link
  const [showAll, setShowAll] = useState(Boolean(focusId)) // "Show all of Toronto" (off by default)
  const [filtersOpen, setFiltersOpen] = useState(false)
  // With no searched spot there is nothing to be "near", so everything is shown.
  const nearOnly = homeLocation && !showAll
  const [visible, setVisible] = useState(PAGE_SIZE) // how many cards to show ("load more")
  const [hoveredId, setHoveredId] = useState(null) // card <-> pin highlight
  // useMemo = only redo this when the filters or location change (not on every hover),
  // so the map isn't handed new pin data each time the mouse moves.
  const filtered = useMemo(() => filterDecisions([...allItems], filters, homeLocation), [filters, homeLocation])
  // Near mode keeps only mapped decisions inside the radius (items with no address can't be "near").
  const shown = useMemo(
    () => (nearOnly ? filtered.filter((d) => d.lat != null && distanceKm(homeLocation, d) <= radius) : filtered),
    [filtered, nearOnly, homeLocation, radius],
  )
  const pins = useMemo(() => shown.filter((d) => d.lat != null), [shown]) // pins only for decisions in the list

  // The decision whose pin was clicked. If a filter then removes it from the list, it is deselected.
  const [selectedId, setSelectedId] = useState(focusId)
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
  const [showMap, setShowMap] = useState(Boolean(focusId)) // only matters on phones
  // Home stays mounted while a decision page is open, so a new "Show on map" link arrives as a changed ?focus=.
  useEffect(() => {
    if (!focusId) return
    setShowAll(true)
    setSelectedId(focusId)
    setScrolledTo(null)
    setShowMap(true)
  }, [focusId])

  return (
    <main className={`home ${showMap ? 'home--map' : ''}`}>
      <section className="home__list">
        <h1 className="home__title">
          {!homeLocation
            ? `${shown.length} ${shown.length === 1 ? 'decision' : 'decisions'} in Toronto`
            : showAll
              ? `${shown.length} decisions in Toronto`
              : shown.length === 0
                ? `Nothing within ${radius} km right now`
                : `${shown.length} ${shown.length === 1 ? 'decision' : 'decisions'} near you`}
        </h1>
        <FindWard onFound={(found) => {
          setFound(found)
          setRadius(NEAR_KM)
          setVisible(PAGE_SIZE)
        }} />
        {nearOnly && shown.length === 0 && radius < WIDE_KM && (
          <button className="home__more" type="button" onClick={() => setRadius(WIDE_KM)}>
            Look within {WIDE_KM} km
          </button>
        )}
        <div className="home__toolbar">
          <button className="home__filters" type="button" aria-expanded={filtersOpen} onClick={() => setFiltersOpen(!filtersOpen)}>
            Filters
          </button>
          {/* All · In progress · Decided. "Status unclear" items only show under All. */}
          <div className="home__status" role="group" aria-label="Status">
            {STATUS_TOGGLE.map((option) => (
              <button
                key={option}
                type="button"
                className={`home__status-btn${filters.status === option ? ' home__status-btn--on' : ''}`}
                aria-pressed={filters.status === option}
                onClick={() => {
                  setFilters({ ...filters, status: option })
                  setVisible(PAGE_SIZE)
                }}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
        {filtersOpen && (
          <FilterBar
            filters={filters}
            onChange={(next) => {
              setFilters(next)
              setVisible(PAGE_SIZE) // new filter -> start from the top again
            }}
            count={shown.length}
          />
        )}
        <ul className="home__cards">
          {shown.slice(0, visible).map((decision) => (
            <li key={decision.id}>
              <DecisionCard decision={decision} distanceKm={homeLocation && decision.lat != null ? distanceKm(homeLocation, decision) : null} active={hoveredId === decision.id || selected?.id === decision.id} onHover={setHoveredId} onShowOnMap={(id) => {
                setSelectedId(id)
                setScrolledTo(id) // the card is already in view, so don't scroll the list
                setShowMap(true) // on phones, switch to the map
              }} />
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
        {/* One neat stack in the top-left corner, so these buttons can never overlap. */}
        <div className="map-stack">
          {homeLocation && (
            <label className="map-stack__item map-stack__check">
              <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
              Show all of Toronto
            </label>
          )}
        </div>
        <MapPanel decision={selected} />
      </section>

      <button className="home__toggle" type="button" onClick={() => setShowMap(!showMap)}>
        {showMap ? 'List' : 'Map'}
      </button>
    </main>
  )
}
