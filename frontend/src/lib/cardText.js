// The short text shown on cards, the map tooltip and the map panel.
// Long titles are NOT used here: they only appear on the decision page.
import { statusWord } from './statusWord.js'

const SHORT = { Avenue: 'Ave', Street: 'St', Road: 'Rd', Crescent: 'Cres', Boulevard: 'Blvd', Drive: 'Dr', Court: 'Ct', Place: 'Pl', Lane: 'Ln', Square: 'Sq', Terrace: 'Terr', East: 'E', West: 'W', North: 'N', South: 'S' }

/** "245 Eglinton Avenue East" -> "245 Eglinton Ave E". Short, so it fits on one line. */
export function shortAddress(address) {
  return address.split(' ').map((word) => SHORT[word] ?? word).join(' ')
}

/** The place for a decision, or "All of Toronto" when we have no address or place name. */
export function placeOf(decision) {
  return decision.place ? shortAddress(decision.place) : 'All of Toronto'
}

/** "214–230 Sherbourne St · In progress · 0.8 km away" (distance only when known). */
export function subline(decision, km = null) {
  const parts = [placeOf(decision), statusWord(decision)]
  if (km != null) parts.push(`${km.toFixed(1)} km away`)
  return parts.join(' · ')
}

/** Map hover tooltip: just the topic word, e.g. "Housing". */
export function tooltipText(decision) {
  return decision.topic
}
