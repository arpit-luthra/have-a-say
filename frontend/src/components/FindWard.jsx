// Address search: type an address or postal code and we find it on the map.
// (We also check it is inside Toronto, using the ward file behind the scenes.)
// While you type, up to 5 matching addresses appear (autocomplete). We wait 300 ms
// after you stop typing before asking, so we don't send a request for every letter.
// Steps when you pick a suggestion (or press Find):
// 1. Get the spot: the suggestion already has it, or ask OpenStreetMap's search (Nominatim).
// 2. Check the spot is inside Toronto (using the ward shapes, which are not drawn).
// 3. Tell the parent (Home / Landing), which drops the pin and zooms there.
//
// The address only lives in this component's memory while the page is open.
// It is never saved in the browser or sent anywhere except the address search.

import { useEffect, useRef, useState } from 'react'
import { geocodeAddress, suggestAddresses } from '../lib/geocode.js'
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
// `hasLocation` + `onClear`: after a search, a small "×" inside the box clears the address again.
export default function FindWard({ onFound, hero = false, hasLocation = false, onClear = null }) {
  const [query, setQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [error, setError] = useState(null)
  const [isOpen, setIsOpen] = useState(false) // is the little dropdown showing?
  const [found, setFound] = useState([]) // up to 5 matching addresses from the last lookup
  const [highlighted, setHighlighted] = useState(-1) // which suggestion the arrow keys are on
  // Too-short text shows no suggestions (worked out here, not stored).
  const suggestions = query.trim().length >= 3 ? found : []
  const justPicked = useRef(false) // so filling the box after a pick doesn't trigger a new lookup

  // Autocomplete: 300 ms after the person stops typing, ask for matching addresses.
  // The cleanup function cancels the timer (and any request still running) when they type again.
  useEffect(() => {
    if (justPicked.current) {
      justPicked.current = false
      return
    }
    const text = query.trim()
    if (text.length < 3) return
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        setFound(await suggestAddresses(text, controller.signal))
        setHighlighted(-1)
      } catch {
        // Cancelled or offline: just show no suggestions. Pressing Find still works.
      }
    }, 300)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query])

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

  // Check the spot is inside Toronto, then tell the page. Used by both typing + Find and picking.
  async function finish(place) {
    const wards = await loadWards()
    const ward = findWardAt(place.lng, place.lat, wards.features)
    if (!ward) {
      setError(MESSAGES.outside)
      return
    }
    onFound({ location: { lng: place.lng, lat: place.lat, label: 'You are here' }, ward: wardSummary(ward.properties) })
  }

  // Picking a suggestion: we already know where it is, so no second lookup is needed.
  async function pickSuggestion(suggestion) {
    justPicked.current = true
    setQuery(suggestion.label)
    setFound([])
    setIsOpen(false)
    setIsSearching(true)
    setError(null)
    try {
      await finish(suggestion)
    } catch {
      setError(MESSAGES.offline)
    } finally {
      setIsSearching(false)
    }
  }

  async function handleSubmit(event) {
    event.preventDefault() // stop the browser from reloading the page
    // If the arrow keys are on a suggestion, Enter picks it.
    if (suggestions[highlighted]) return pickSuggestion(suggestions[highlighted])
    const text = query.trim()
    if (!text || isSearching) return

    setFound([])
    setIsSearching(true)
    setError(null)
    try {
      const place = await geocodeAddress(text)
      if (!place) {
        setError(MESSAGES.notFound)
        return
      }
      await finish(place)
    } catch {
      setError(MESSAGES.offline)
    } finally {
      setIsSearching(false) // runs whether the search worked or not
    }
  }

  // Arrow keys move through the suggestions, Escape closes them.
  function handleKeyDown(event) {
    if (event.key === 'Escape') return setIsOpen(false)
    if (!suggestions.length) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setIsOpen(true)
      setHighlighted((highlighted + 1) % suggestions.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setHighlighted((highlighted - 1 + suggestions.length) % suggestions.length)
    }
  }

  function clearAddress() {
    justPicked.current = true // emptying the box must not start a new lookup
    setQuery('')
    setFound([])
    setError(null)
    setIsOpen(false)
    onClear?.()
  }

  const showMenu = isOpen && (suggestions.length > 0 || !hero)

  return (
    <form className={`find-ward${hero ? ' find-ward--hero' : ''}`} role="search" onSubmit={handleSubmit}>
      <div className="find-ward__pill">
        <div className="find-ward__row">
          <input
            className="find-ward__input"
            type="text"
            inputMode="search"
            autoComplete="off"
            aria-label="Search an address or postal code"
            placeholder={hero ? 'Enter your address or postal code' : 'Search an address or postal code'}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setIsOpen(true)
            }}
            onFocus={() => setIsOpen(true)}
            onBlur={() => setIsOpen(false)}
            onKeyDown={handleKeyDown}
            role="combobox"
            aria-expanded={showMenu}
            aria-controls="address-suggestions"
            aria-autocomplete="list"
          />
          {hasLocation && onClear && (
            <button className="find-ward__clear" type="button" aria-label="Clear address and show all of Toronto" onClick={clearAddress}>
              ×
            </button>
          )}
          <button className="find-ward__button" type="submit" disabled={isSearching} aria-label="Search">
            {/* A simple magnifying glass drawn with SVG, like Google's. */}
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <circle cx="10.5" cy="10.5" r="6" fill="none" stroke="currentColor" strokeWidth="2" />
              <path d="M15 15l5.5 5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        {showMenu && (
          <ul className="find-ward__menu" id="address-suggestions" role="listbox">
            {/* onMouseDown + preventDefault: keeps the input focused so the menu doesn't
                close before the click registers. */}
            {suggestions.map((suggestion, i) => (
              <li key={suggestion.label} role="option" aria-selected={i === highlighted}>
                <button
                  type="button"
                  className={`find-ward__option${i === highlighted ? ' find-ward__option--on' : ''}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pickSuggestion(suggestion)}
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                    <path d="M12 2.5a6.5 6.5 0 0 0-6.5 6.5c0 4.8 5.7 11 6.2 11.5a.4.4 0 0 0 .6 0c.5-.5 6.2-6.7 6.2-11.5A6.5 6.5 0 0 0 12 2.5z" fill="none" stroke="currentColor" strokeWidth="2" />
                    <circle cx="12" cy="9" r="2.3" fill="currentColor" />
                  </svg>
                  {suggestion.label}
                </button>
              </li>
            ))}
            {!hero && (
              <li role="presentation">
                <button type="button" className="find-ward__option" onMouseDown={(e) => e.preventDefault()} onClick={useCurrentLocation}>
                  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                    <circle cx="12" cy="12" r="3.5" fill="currentColor" />
                    <circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" strokeWidth="2" />
                    <path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  Current location
                </button>
              </li>
            )}
          </ul>
        )}
      </div>

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
