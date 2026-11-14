// Combines our 2 hand-checked decisions with the open-data items into ONE list.
// Every entry has `detailed`: true if we wrote a full explanation page for it.
import decisions from '../data/decisions.json'
import { getStageSteps } from './stageSteps.js'
import { guessTopic } from './guessTopic.js'
import openData from '../data/open-data-items.json'
import plainTitles from '../data/plain-titles.json'
// Made by scripts/geocode_addresses.py: only titles with a confidently found street address.
import geocoded from '../data/item-locations.json'
// Pins we placed BY HAND (e.g. a ferry terminal, which is not in the title). Kept in their own file
// so re-running the geocoding script never wipes them. "approximate": true = the place is a landmark, not the exact spot.
import manual from '../data/manual-locations.json'
import explanations from '../data/explanations.json'

const locations = { ...geocoded, ...manual }

const detailed = decisions.map((d) => ({ ...d, detailed: true, fullExplanation: Boolean(explanations[d.id]) }))
const detailedIds = new Set(detailed.map((d) => d.id))

// Open-data items only know: number, title, committee, date, last vote result.
// No ward or location, so we leave those out rather than guess.
// The topic IS a keyword guess from the title (see guessTopic.js).
const fromOpenData = openData.items
  .filter((item) => !detailedIds.has(item.id))
  .map((item) => {
    // plain-titles.json is made by scripts/simplify_titles.py. If an item has no plain
    // title yet, we just keep showing its official one (and no "Official title" line).
    const plain = plainTitles[item.id]?.plain
    const spot = locations[item.id] // undefined = no pin for this one
    return {
      ...item,
      ...(spot && { lat: spot.lat, lng: spot.lng, place: spot.address, approximate: Boolean(spot.approximate) }),
      fullExplanation: Boolean(explanations[item.id]), // gets the small "Full explanation" badge on its card
      title: plain || item.title,
      officialTitle: plain ? item.title : null,
      topic: guessTopic(item.title), // guess from the OFFICIAL title: it has more keywords
      detailed: false,
    }
  })

// "approved"/"rejected"/"can't be torn down" only when the body that makes the final call has
// voted. Otherwise the title says "proposed". (Stale items are not decided either.)
function matchTitleToStatus(item) {
  if (item.detailed || getStageSteps(item).steps[3].state !== 'upcoming') return item
  const title = item.title
    .replace(/^New building (approved|rejected) at /, 'New building proposed at ')
    .replace(/^Old building at (.+) can't be torn down$/, 'Old building at $1 proposed for protection')
  return { ...item, title }
}

export const allItems = [...detailed, ...fromOpenData].map(matchTitleToStatus)
export const openDataUpdated = openData.generatedAt
