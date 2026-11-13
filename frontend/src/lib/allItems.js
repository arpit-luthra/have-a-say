// Combines our 2 hand-checked decisions with the open-data items into ONE list.
// Every entry has `detailed`: true if we wrote a full explanation page for it.
import decisions from '../data/decisions.json'
import { guessTopic } from './guessTopic.js'
import openData from '../data/open-data-items.json'
import plainTitles from '../data/plain-titles.json'
// Made by scripts/geocode_addresses.py: only titles with a confidently found street address.
import locations from '../data/item-locations.json'

const detailed = decisions.map((d) => ({ ...d, detailed: true }))
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
      ...(spot && { lat: spot.lat, lng: spot.lng }),
      title: plain || item.title,
      officialTitle: plain ? item.title : null,
      topic: guessTopic(item.title), // guess from the OFFICIAL title: it has more keywords
      detailed: false,
    }
  })

export const allItems = [...detailed, ...fromOpenData]
export const openDataUpdated = openData.generatedAt
