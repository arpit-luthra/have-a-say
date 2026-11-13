// "Find my ward": type an address or postal code, and we work out which ward it's in.
//
// Steps when you press Find:
// 1. Ask OpenStreetMap's search (Nominatim) where that address is.
// 2. Check which of the 25 ward shapes contains that spot.
// 3. Tell the parent (App), which drops the pin and zooms to the ward.
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
  offline: "Address search isn't working right now. Please try again in a moment.",
}

export default function FindWard({ onFound }) {
  const [query, setQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [error, setError] = useState(null)

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
      onFound({ location: place, ward: wardSummary(ward.properties) })
    } catch {
      setError(MESSAGES.offline)
    } finally {
      setIsSearching(false) // runs whether the search worked or not
    }
  }

  return (
    <form className="find-ward" role="search" onSubmit={handleSubmit}>
      <label className="find-ward__label" htmlFor="find-ward-input">
        Don't know your ward?
      </label>
      <div className="find-ward__row">
        <input
          id="find-ward-input"
          className="find-ward__input"
          type="text"
          inputMode="search"
          autoComplete="street-address"
          placeholder="Address or postal code"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button className="find-ward__button" type="submit" disabled={isSearching}>
          {isSearching ? 'Finding…' : 'Find'}
        </button>
      </div>

      {/* aria-live: screen readers announce this message when it appears. */}
      <p className="find-ward__error" aria-live="polite">
        {error}
      </p>

      <p className="find-ward__note">
        Looked up with{' '}
        <a href="https://nominatim.openstreetmap.org/" target="_blank" rel="noreferrer">
          OpenStreetMap
        </a>
        . We never save your address.
      </p>
    </form>
  )
}
