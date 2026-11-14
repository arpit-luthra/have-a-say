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
 *  - steps: 4 objects { name, state, note }. state is 'reached' (blue), 'upcoming' (grey),
 *    'skipped' / 'not-needed' (hollow dot, italic note) or 'rejected' (dark).
 *  - label: short name of where it is now (used on list cards).
 *  - next: "Next: City Council" when more is still to come, otherwise null.
 *  - uncertain: true when we're guessing from the latest vote alone.
 */
// A vote on a committee or community council older than this, on an item we can't confirm, is too old to say where it stands.
const STALE_AFTER_DAYS = 60

/** True when the latest recorded vote is a committee's, over 60 days old, and we can't confirm the status. */
export function isStale(item) {
  if (item.detailed || item.upcoming || item.official || !item.dateISO) return false
  const body = item.committee
  if (body === 'City Council' || FINAL_DECISION_BODIES.has(body)) return false
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - STALE_AFTER_DAYS)
  return new Date(item.dateISO) < cutoff
}

export function getStageSteps(item) {
  // Upcoming item: staff report is done, the committee meeting is NEXT ("current"), then Council, then decided.
  if (item.upcoming) {
    return {
      steps: [
        { name: 'Staff report', state: 'reached', note: null },
        { name: item.meeting.body, state: 'current', note: null },
        { name: 'City Council', state: 'upcoming', note: null },
        { name: 'Decided', state: 'upcoming', note: null },
      ],
      label: 'Open for comments',
      next: null,
      uncertain: false,
    }
  }

  // Status taken from the official City page (hand-checked, or parsed from its Tracking Status text). It overrides
  // any guess from the voting record.
  if (item.official) {
    const { status, word, label, final, finalBody } = item.official
    const steps = STEP_NAMES.map((name) => ({ name, state: 'upcoming', note: null }))
    steps[0].state = 'reached'
    steps[1].state = 'reached'
    if (!final) {
      // Not decided yet. Postponed / sent back: still waiting at the committee. Adopted by a committee: City Council is next.
      if (label === 'Adopted by committee') steps[1].note = label
      else steps[1] = { ...steps[1], state: 'current', note: label }
      return { steps, label: label ?? 'In progress', word: 'In progress', next: null, uncertain: false }
    }
    if (finalBody === 'City Council') {
      steps[2].state = 'reached'
    } else {
      steps[2] = { ...steps[2], state: 'not-needed', note: 'Not needed' } // this body decides for itself
    }
    const note = status === 'Noted' ? 'Noted, no action' : (label ?? (status === 'Rejected' ? 'Rejected' : 'Approved'))
    steps[3] = { name: 'Decided', state: status === 'Rejected' ? 'rejected' : 'reached', note }
    return { steps, label: word, word, next: null, uncertain: false }
  }

  // Our 2 hand-checked decisions: both were adopted by City Council, and we know the path.
  const known = item.detailed
  const body = known ? 'City Council' : item.committee
  const isMemberMotion = item.id.includes('.MM')

  const steps = STEP_NAMES.map((name) => ({ name, state: 'upcoming', note: null }))
  steps[0].state = 'reached'

  // A "Lost" vote can be on a motion about the item (an amendment, say), not on the item itself.
  // So a lost vote never makes an item "Rejected": we only say the status is unclear.
  if (!known && item.result.startsWith('Lost')) {
    steps[1].state = 'reached'
    return { steps, label: 'Status unclear', next: null, uncertain: true, unclear: true }
  }

  if (body === 'City Council') {
    steps[1] = isMemberMotion
      ? { name: steps[1].name, state: 'skipped', note: 'Skipped' } // went straight to Council
      : { ...steps[1], state: 'reached' }
    steps[2].state = 'reached'
    steps[3] = { name: 'Decided', state: 'reached', note: 'Approved' }
    return { steps, label: 'Approved', next: null, uncertain: !known }
  }

  if (FINAL_DECISION_BODIES.has(body)) {
    steps[1].state = 'reached'
    steps[2] = { ...steps[2], state: 'not-needed', note: 'Not needed' }
    steps[3] = { name: 'Decided', state: 'reached', note: `Decided by ${body}` }
    return { steps, label: `Decided by ${body}`, next: null, uncertain: true }
  }

  // Any other committee or community council: the next stop is City Council.
  steps[1].state = 'reached'
  if (isStale(item)) return { steps, label: 'Status unclear', next: null, uncertain: true }
  return { steps, label: 'At committee', next: 'Next: City Council', uncertain: true }
}
