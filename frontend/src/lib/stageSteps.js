// Works out where a decision is, as the same 4 steps for EVERY decision:
//   1 Proposed -> 2 At committee -> 3 At City Council -> 4 Decided
// We only have the LATEST recorded vote (body + result), so the step is an informed
// reading of that vote, and pages say so ("Based on the latest recorded vote").

export const STEP_NAMES = ['Proposed', 'At committee', 'At City Council', 'Decided']

// Boards that make their own final decisions, so their vote is the end of the road.
// (Community councils are NOT listed: on most items they only recommend to City Council.)
const FINAL_DECISION_BODIES = new Set([
  'Toronto Transit Commission',
  'Toronto Parking Authority',
  'Board of Health',
  'TO Live',
  'Toronto Atmospheric Fund',
  'Toronto Zoo',
  'Exhibition Place',
])

/**
 * Returns { steps, label, next, uncertain }.
 *  - steps: 4 objects { name, state, note }. state is 'reached' (teal), 'upcoming' (grey),
 *    'skipped' / 'not-needed' (hollow dot, italic note) or 'rejected' (dark).
 *  - label: short name of where it is now (used on list cards).
 *  - next: "Next: City Council" when more is still to come, otherwise null.
 *  - uncertain: true when we're guessing from the latest vote alone.
 */
export function getStageSteps(item) {
  // Our 2 hand-checked decisions: both were adopted by City Council, and we know the path.
  const known = item.detailed
  const body = known ? 'City Council' : item.committee
  const lost = !known && item.result.startsWith('Lost')
  const isMemberMotion = item.id.includes('.MM')

  const steps = STEP_NAMES.map((name) => ({ name, state: 'upcoming', note: null }))
  steps[0].state = 'reached'

  if (body === 'City Council') {
    steps[1] = isMemberMotion
      ? { name: steps[1].name, state: 'skipped', note: 'Skipped' } // went straight to Council
      : { ...steps[1], state: 'reached' }
    steps[2].state = 'reached'
    steps[3] = lost
      ? { name: 'Decided', state: 'rejected', note: 'Rejected' }
      : { name: 'Decided', state: 'reached', note: 'Approved' }
    return { steps, label: lost ? 'Rejected' : 'Approved', next: null, uncertain: !known }
  }

  if (FINAL_DECISION_BODIES.has(body)) {
    steps[1].state = 'reached'
    steps[2] = { ...steps[2], state: 'not-needed', note: 'Not needed' }
    steps[3] = lost
      ? { name: 'Decided', state: 'rejected', note: `Rejected by ${body}` }
      : { name: 'Decided', state: 'reached', note: `Decided by ${body}` }
    return { steps, label: lost ? 'Rejected' : `Decided by ${body}`, next: null, uncertain: true }
  }

  // Any other committee or community council: the next stop is City Council.
  steps[1].state = 'reached'
  return { steps, label: 'At committee', next: 'Next: City Council', uncertain: true }
}
