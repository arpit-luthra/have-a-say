// Loads votes.json (made by scripts/import_open_data.py) once, and answers questions about it.
// Format: { councillors: [...], votes: { itemId: "YYNA-..." } }
// Each letter is one person, in the same order as `councillors`.

import { useEffect, useState } from 'react'

let votesPromise = null

function loadVotes() {
  if (!votesPromise) {
    votesPromise = fetch('/data/votes.json').then((response) => {
      if (!response.ok) throw new Error(`Could not load votes (${response.status})`)
      return response.json()
    })
  }
  return votesPromise
}

/** Returns the vote data, or null while it loads (or if it can't load). */
export function useVoteData() {
  const [data, setData] = useState(null)
  useEffect(() => {
    loadVotes().then(setData).catch(() => setData(null))
  }, [])
  return data
}

const LABELS = { Y: 'Yes', N: 'No', A: 'Absent', I: 'Absent (declared an interest)' }

/**
 * Everything the page needs to say about one item's vote, or null when we have no
 * per-person votes for it. `wardNumber` is the resident's ward (or undefined).
 */
export function summariseVote(data, itemId, wardNumber) {
  const letters = data?.votes[itemId]
  if (!letters) return null

  const people = data.councillors.map((person, i) => ({ ...person, code: letters[i], label: LABELS[letters[i]] }))
  const voters = people.filter((p) => p.code !== '-') // only people recorded in THIS vote
  const count = (...codes) => voters.filter((p) => codes.includes(p.code)).length

  // Ward lines come from the ward -> councillor match. If nobody is matched to the
  // ward, or that person has no row in this vote, we say so rather than guess.
  const wardCouncillor = wardNumber ? people.find((p) => p.ward === wardNumber) : null
  voters.sort((a, b) => (a.role === 'Mayor' ? -1 : b.role === 'Mayor' ? 1 : (a.ward ?? 99) - (b.ward ?? 99)))

  return {
    yes: count('Y'),
    no: count('N'),
    absent: count('A', 'I'),
    voters,
    wardCouncillor,
    wardVote: wardCouncillor && wardCouncillor.code !== '-' ? wardCouncillor : null,
  }
}
