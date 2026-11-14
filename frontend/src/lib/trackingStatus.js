// Turns the "Tracking Status" text copied from each official City page (official-tracking.json)
// into a clear status. Plain rules, one per kind of sentence the City uses:
//
//   "City Council adopted ..."                     -> Approved by City Council (steps: community council, then City Council)
//   "... delegated authority ... decision is final" -> final at that body: Approved, or Rejected if denied / not adopted / not granted
//   TTC "was adopted"                              -> Approved by the TTC board
//   "received for information only"                -> Noted, no action
//   "postponed"                                    -> In progress (Postponed)
//   "referred ... without making a decision"       -> In progress (Sent back for more work)
//   another committee "was adopted"                -> In progress (Adopted by committee; City Council is next)
//
// Anything we don't recognise returns null, and the item keeps its voting-record status.
import { formatDate } from './formatDate.js'

const MONTHS = 'January|February|March|April|May|June|July|August|September|October|November|December'
const DATE = `(?:${MONTHS}) \\d{1,2}(?: and \\d{1,2})?, \\d{4}`
const BODY =
  '((?:Toronto and East York|North York|Scarborough|Etobicoke York) Community Council|Infrastructure and Environment Committee|Toronto Transit Commission|TO Live)'

/** "July 29 and 30, 2026" -> "2026-07-30" (the LAST day, when it is a range). */
function lastDay(text) {
  const m = text.match(new RegExp(`(${MONTHS}) (\\d{1,2})(?: and (\\d{1,2}))?, (\\d{4})`))
  if (!m) return null
  const month = MONTHS.split('|').indexOf(m[1]) + 1
  const day = m[3] ?? m[2]
  return `${m[4]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

const the = (body) => (body === 'TO Live' ? body : `The ${body}`) // "The North York Community Council", but just "TO Live"
const withChanges = (sentence) => (/with amendments/.test(sentence) ? ' with changes' : '')
const POWER = ' City Council gave it the power to decide, so this is final.'

const plainBody = (body) => (body === 'Toronto Transit Commission' ? 'TTC board' : body)

export function parseTracking(tracking) {
  const text = tracking.trim()
  const date = lastDay(text)

  // 1. City Council adopted it (after a community council or committee).
  const council = text.match(new RegExp(`City Council adopted this item on (${DATE})[^.]*\\.`))
  if (council) {
    const before = text.match(new RegExp(`${BODY} considered it on (${DATE}) and adopted it (?:with amendments|without amendment)\\.`))
    const steps = []
    if (before) steps.push({ body: before[1], date: lastDay(before[2]), text: before[0] })
    steps.push({ body: 'City Council', date: lastDay(council[1]), text: council[0] })
    const first = before ? ` ${the(before[1])} ${/with amendments/.test(before[0]) ? 'agreed to it with changes' : 'agreed to it'} first, on ${formatDate(lastDay(before[2]))}.` : ''
    const outcome = `City Council approved this${withChanges(council[0])} on ${formatDate(lastDay(council[1]))}.${first}`
    return { status: 'Approved', word: 'Approved', finalBody: 'City Council', date: lastDay(council[1]), label: null, text, steps, final: true, outcome }
  }

  const body = text.match(new RegExp(BODY))?.[1]
  if (!body) return null

  // 2. A body that City Council gave the power to decide: its decision is final.
  if (/delegated authority/.test(text) && /decision is final/.test(text)) {
    let status = 'Approved'
    let label = null
    if (/was not adopted|not granted|lost/.test(text)) {
      status = 'Rejected'
      label = /fence exemption/i.test(text) ? 'Fence exemption not granted' : 'Not adopted'
    } else if (/denied/.test(text)) {
      status = 'Rejected'
      label = /tree/i.test(text) ? 'Tree permit denied' : 'Request denied'
    } else if (/granted the fence exemption/.test(text)) {
      label = 'Fence exemption granted'
    }
    const on = formatDate(date)
    let outcome = `${the(body)} approved this${withChanges(text)} on ${on}.${POWER}`
    if (label === 'Fence exemption not granted') outcome = `${the(body)} did not grant the fence exemption on ${on}.${POWER}`
    else if (label === 'Fence exemption granted') outcome = `${the(body)} granted the fence exemption on ${on}.${POWER}`
    else if (label === 'Tree permit denied') outcome = `${the(body)} denied the permit to remove the tree on ${on}${/as staff recommended/.test(text) ? ', as City staff recommended' : ''}.${POWER}`
    else if (status === 'Rejected') outcome = `${the(body)} did not approve this on ${on}.${POWER}`
    return { status, word: status, finalBody: body, date, label, text, steps: [{ body, date, text }], final: true, outcome }
  }

  // 3. Received for information only: nothing further happens.
  if (/received for information only/.test(text)) {
    return { status: 'Noted', word: 'Noted, no action', finalBody: plainBody(body), date, label: null, text, steps: [{ body, date, text }], final: true, outcome: `The TTC board looked at this on ${formatDate(date)} and took no action.` }
  }

  // 4. Not decided yet.
  if (/postponed/.test(text)) {
    return { status: 'In progress', word: 'In progress', finalBody: null, date, label: 'Postponed', text, steps: [{ body, date, text }], final: false, outcome: `${the(body)} put off deciding on this on ${formatDate(date)}.` }
  }
  if (/referred this item to an official or other body without making a decision/.test(text)) {
    return { status: 'In progress', word: 'In progress', finalBody: null, date, label: 'Sent back for more work', text, steps: [{ body, date, text }], final: false, outcome: `${the(body)} sent this back for more work on ${formatDate(date)}, without deciding.` }
  }

  // 5. Adopted. The TTC board decides for itself; a committee only recommends to City Council.
  if (/and was adopted/.test(text)) {
    if (body === 'Toronto Transit Commission') {
      return { status: 'Approved', word: 'Approved', finalBody: 'TTC board', date, label: null, text, steps: [{ body, date, text }], final: true, outcome: `The TTC board approved this${withChanges(text)} on ${formatDate(date)}.` }
    }
    return { status: 'In progress', word: 'In progress', finalBody: null, date, label: 'Adopted by committee', text, steps: [{ body, date, text }], final: false, outcome: `${the(body)} agreed to this${withChanges(text)} on ${formatDate(date)}. No City Council vote is recorded yet.` }
  }
  return null
}
