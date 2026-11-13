// Filtering and sorting for the Explore list. Pure functions: easy to read and test.

export const TOPICS = [
  'Housing', 'Bike lanes', 'Roads & traffic', 'Transit', 'Parking', 'Parks & trees', 'Public spaces',
  'Taxes & budget', 'Environment', 'Community services', 'Safety', 'Heritage',
  'Business & licences', 'Neighbourhood rules', 'Other',
]
export const STAGES = ['Proposed', 'At committee', 'At council', 'Decided']
export const SAY_OPTIONS = ['Open now', 'Closing this week', 'Closed']
export const SORTS = ['Closest to me', 'Deadline soonest', 'Newest']

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

export function filterDecisions(decisions, { topics, stages, says, sort }, home) {
  const shown = decisions.filter(
    (d) =>
      (topics.length === 0 || topics.includes(d.topic)) &&
      (stages.length === 0 || stages.includes(d.stage)) &&
      (says.length === 0 || sayGroups(d).some((g) => says.includes(g))),
  )

  const byNewest = (a, b) => b.dateISO.localeCompare(a.dateISO)
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
