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
// Real items from agendas for meetings that have NOT happened yet (so no vote, and not in open data). Made by hand.
import upcomingData from '../data/upcoming-items.json'
// Final status checked by hand on each item's official City page. It overrides the guess from the voting record.
import officialStatus from '../data/official-status.json'

const locations = { ...geocoded, ...manual }

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
      official: officialStatus.items[item.id] ?? null,
      ...(spot && { lat: spot.lat, lng: spot.lng, place: spot.address, approximate: Boolean(spot.approximate) }),
      // A hand-checked plain title (official-status.json) beats the generated one.
      title: officialStatus.items[item.id]?.plainTitle || plain || item.title,
      officialTitle: officialStatus.items[item.id]?.plainTitle || plain ? item.title : null,
      topic: guessTopic(item.title), // guess from the OFFICIAL title: it has more keywords
      detailed: false,
    }
  })

// Upcoming items: no vote yet, so they are always "In progress". Their pins come from manual-locations.json.
const { meeting } = upcomingData
const upcoming = upcomingData.items.map((item) => {
  const spot = locations[item.id]
  return {
    id: item.id,
    title: item.plainTitle,
    officialTitle: item.officialTitle,
    topic: item.topic,
    ward: item.ward, // e.g. "13 - Toronto Centre"
    committee: meeting.body, // the body that meets next
    dateISO: meeting.date, // used only for sorting
    sourceUrl: item.sourceUrl,
    staffReportDate: item.staffReportDate ?? null,
    meeting,
    upcoming: true,
    detailed: false,
    sayStatus: 'open', // the person can still comment, so "Open now" in the filters
    deadline: null, // never guessed: the official page has the exact deadline
    ...(spot && { lat: spot.lat, lng: spot.lng, place: spot.address }),
  }
})

// A plain title may only say "approved" / "rejected" when the LATEST vote is the final one (City Council, or a
// board that makes its own final call). Otherwise it must say "proposed". These are the wordings that claim an outcome.
const NOT_FINAL_WORDING = [
  [/^New building (?:approved|rejected) at /, 'New building proposed at '],
  [/^Old building at (.+) can't be torn down$/, 'Old building at $1 proposed for protection'],
  [/^Approval for /, 'Proposal for '],
  [/^Refusal of (.+)$/, 'Proposal to refuse $1'],
  [/^New homes approval$/, 'New homes proposed'],
  [/^Approval of (.+)$/, 'Proposal to approve $1'],
]
const CLAIMS_OUTCOME = /\b(approved|rejected|approval|refusal)\b|can't be torn down/i

function isFinal(item) {
  return getStageSteps(item).steps[3].state !== 'upcoming'
}

function matchTitleToStatus(item) {
  if (item.detailed || item.upcoming || isFinal(item)) return item
  let title = item.title
  for (const [pattern, replacement] of NOT_FINAL_WORDING) title = title.replace(pattern, replacement)
  return { ...item, title }
}

export const allItems = [...detailed, ...fromOpenData, ...upcoming].map(matchTitleToStatus)

/** Automatic re-check of EVERY title in the app: returns the ones that claim an outcome the vote doesn't support. */
export function titleProblems() {
  return allItems
    .filter((item) => !item.detailed && !item.upcoming)
    .filter((item) => !isFinal(item) && CLAIMS_OUTCOME.test(item.title))
    .map((item) => `${item.id}: "${item.title}" (${item.committee}, ${item.result})`)
}

if (import.meta.env.DEV) {
  const problems = titleProblems()
  if (problems.length) console.warn('Titles that claim a result the latest vote does not support:', problems)
}
export const openDataUpdated = openData.generatedAt
