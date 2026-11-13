// Address search: type an address or postal code and we find it on the map.
// (We also check it is inside Toronto, using the ward file behind the scenes.)
// Steps when you press Find:
// 1. Ask OpenStreetMap's search (Nominatim) where that address is.
// 2. Check the spot is inside Toronto (using the ward shapes, which are not drawn).
// 3. Tell the parent (App), which drops the pin and zooms there.
//
// The address only lives in this component's memory while the page is open.
// It is never saved in the browser or sent anywhere except the address search.

import { useState } from 'react'
import { geocodeAddress } from '../lib/geocode.js'
import { findWardAt } from '../lib/geo.js'
import { loadWards, wardSummary } from '../lib/wardData.js'
import './FindWard.css'

const MESSAGES = {
  notFound: "We couldn't find that address in Toronto. Try a street address, or a full postal code like M5S 1A1.",
  outside: "That address seems to be outside Toronto's 25 wards.",
  noLocation: "Couldn't get your location. Type an address instead.",
  offline: "Address search isn't working right now. Please try again in a moment.",
}

// `hero` = the big version on the start page (link under the bar instead of a dropdown).
export default function FindWard({ onFound, hero = false }) {
  const [query, setQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [error, setError] = useState(null)
  const [isOpen, setIsOpen] = useState(false) // is the little dropdown showing?

  // Ask the browser for the device location. The browser shows its own Allow / Block popup.
  // The result is only passed to the page; it is never saved.
  function useCurrentLocation() {
    setIsOpen(false)
    setError(null)
    if (!navigator.geolocation) {
      setError(MESSAGES.noLocation)
      return
    }
    setIsSearching(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setIsSearching(false)
        const { latitude, longitude } = position.coords
        onFound({ location: { lng: longitude, lat: latitude, label: 'You are here' } })
      },
      () => {
        setIsSearching(false)
        setError(MESSAGES.noLocation)
      },
      { timeout: 10000 },
    )
  }

  async function handleSubmit(event) {
    event.preventDefault() // stop the browser from reloading the page
    const text = query.trim()
    if (!text || isSearching) return

    setIsSearching(true)
    setError(null)
    try {
      const place = await geocodeAddress(text)
      if (!place) {
        setError(MESSAGES.notFound)
        return
      }
      const wards = await loadWards()
      const ward = findWardAt(place.lng, place.lat, wards.features)
      if (!ward) {
        setError(MESSAGES.outside)
        return
      }
      onFound({ location: { ...place, label: 'You are here' }, ward: wardSummary(ward.properties) })
    } catch {
      setError(MESSAGES.offline)
    } finally {
      setIsSearching(false) // runs whether the search worked or not
    }
  }

  return (
    <form className={`find-ward${hero ? ' find-ward--hero' : ''}`} role="search" onSubmit={handleSubmit}>
      <div className="find-ward__pill">
        <div className="find-ward__row">
          <input
            className="find-ward__input"
            type="text"
            inputMode="search"
            autoComplete="street-address"
            aria-label="Search an address or postal code"
            placeholder={hero ? 'Enter your address or postal code' : 'Search an address or postal code'}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onFocus={() => setIsOpen(true)}
            onBlur={() => setIsOpen(false)}
          />
          <button className="find-ward__button" type="submit" disabled={isSearching} aria-label="Search">
            {/* A simple magnifying glass drawn with SVG, like Google's. */}
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <circle cx="10.5" cy="10.5" r="6" fill="none" stroke="currentColor" strokeWidth="2" />
              <path d="M15 15l5.5 5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {isOpen && !hero && (
        <ul className="find-ward__menu">
          <li>
            {/* onMouseDown + preventDefault: keeps the input focused so the menu doesn't
                close before the click registers. */}
            <button type="button" className="find-ward__option" onMouseDown={(e) => e.preventDefault()} onClick={useCurrentLocation}>
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path d="M12 2.5a6.5 6.5 0 0 0-6.5 6.5c0 4.8 5.7 11 6.2 11.5a.4.4 0 0 0 .6 0c.5-.5 6.2-6.7 6.2-11.5A6.5 6.5 0 0 0 12 2.5z" fill="none" stroke="currentColor" strokeWidth="2" />
                <circle cx="12" cy="9" r="2.3" fill="currentColor" />
              </svg>
              Current location
            </button>
          </li>
        </ul>
      )}

      {hero && (
        <button type="button" className="find-ward__link" onClick={useCurrentLocation}>
          Use my current location
        </button>
      )}

      {/* aria-live: screen readers announce this message when it appears. */}
      <p className="find-ward__error" aria-live="polite">
        {isSearching ? 'Finding…' : error}
      </p>
    </form>
  )
}
