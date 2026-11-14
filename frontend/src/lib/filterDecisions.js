// Filtering and sorting for the Explore list. Pure functions: easy to read and test.
import { statusWord } from './statusWord.js'

export const TOPICS = [
  'Housing', 'Bike lanes', 'Roads & traffic', 'Transit', 'Parking', 'Parks & trees', 'Public spaces',
  'Taxes & budget', 'Environment', 'Community services', 'Safety', 'Heritage',
  'Business & licences', 'Neighbourhood rules', 'Other',
]
export const STAGES = ['Proposed', 'At committee', 'At council', 'Decided']
export const SAY_OPTIONS = ['Open now', 'Closing this week', 'Closed']
export const STATUS_TOGGLE = ['All', 'In progress', 'Decided']
export const SORTS = ['Closest to me', 'Deadline soonest', 'Newest']

/** The status toggle: Decided = Approved or Rejected. "Status unclear" items only show under All. */
function matchesStatus(decision, status) {
  if (!status || status === 'All') return true
  const word = statusWord(decision)
  return status === 'Decided' ? word === 'Approved' || word === 'Rejected' : word === 'In progress'
}

const DAY = 24 * 60 * 60 * 1000

/** Which "Can I have a say?" group a decision belongs to. */
function sayGroups(decision) {
  if (decision.sayStatus !== 'open') return ['Closed']
  const groups = ['Open now']
  if (decision.deadline && new Date(decision.deadline) - Date.now() <= 7 * DAY) groups.push('Closing this week')
  return groups
}

/** Straight-line distance (in degrees, good enough for ranking within one city). */
function distance(decision, home) {
  if (decision.lat == null) return Infinity // open-data items have no location: put them last
  const shrink = Math.cos((home.lat * Math.PI) / 180)
  return Math.hypot((decision.lng - home.lng) * shrink, decision.lat - home.lat)
}

export function filterDecisions(decisions, { topics, stages, says, sort, status }, home) {
  const shown = decisions.filter(
    (d) =>
      matchesStatus(d, status) &&
      (topics.length === 0 || topics.includes(d.topic)) &&
      (stages.length === 0 || stages.includes(d.stage)) &&
      (says.length === 0 || sayGroups(d).some((g) => says.includes(g))),
  )

  const byNewest = (a, b) => b.dateISO.localeCompare(a.dateISO)
  const sorted = sortShown(shown, sort, home, byNewest)
  // Under "In progress", the items still open for comments come first (the sort order is kept inside each group).
  return status === 'In progress' ? [...sorted.filter((d) => d.upcoming), ...sorted.filter((d) => !d.upcoming)] : sorted
}

function sortShown(shown, sort, home, byNewest) {
  if (sort === 'Closest to me' && home) {
    return shown.sort((a, b) => distance(a, home) - distance(b, home) || byNewest(a, b))
  }
  if (sort === 'Deadline soonest') {
    // decisions with no deadline go last
    const when = (d) => (d.deadline ? new Date(d.deadline).getTime() : Infinity)
    return shown.sort((a, b) => when(a) - when(b) || byNewest(a, b))
  }
  return shown.sort(byNewest)
}
