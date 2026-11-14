// The words for the printable flyer, built from data we already have. Nothing here is guessed:
// no deadline is ever made up, and the flyer never shows a source link number or a name.
import { statusWord } from './statusWord.js'
import { getStageSteps, isStale } from './stageSteps.js'
import { bodyName } from './voteWords.js'
import { formatDate } from './formatDate.js'

const countSentences = (text) => (text.match(/[.!?](\s|$)/g) ?? []).length || 1

/** "What's happening?" in 2 to 3 sentences: the real outcome first (if we have it), then the explanation. */
export function flyerHappening(item, ex) {
  const lines = []
  if (item.official?.outcome) lines.push(item.official.outcome)
  for (const s of ex.sections.happening) {
    if (/^The report (doesn't|does not) mention/.test(s.text)) continue // useful on the page, too much for a flyer
    lines.push(s.text)
  }
  const kept = []
  let sentences = 0
  for (const line of lines) {
    const n = countSentences(line)
    if (kept.length && sentences + n > 3) break
    kept.push(line)
    sentences += n
  }
  return kept
}

/** Where the decision stands, in plain words, with the date. */
export function flyerStatus(item) {
  if (item.upcoming) return 'In progress. Nobody has voted on this yet.' // the meeting date has its own line on the flyer
  const o = item.official
  if (o) {
    const date = formatDate(o.date)
    if (o.final) {
      if (o.status === 'Noted') return `Noted, no action, by the ${o.finalBody} on ${date}.`
      const detail = o.label && o.label !== o.status ? ` (${o.label.toLowerCase()})` : ''
      return `${o.status} by ${o.finalBody} on ${date}${detail}.`
    }
    if (o.label === 'Adopted by committee') return `In progress. A committee agreed to this on ${date}. City Council hasn't voted on it yet.`
    return `In progress${o.label ? ` (${o.label.toLowerCase()})` : ''}. Latest step: ${o.steps[0].body}, ${date}.`
  }
  const voteItem = item.detailed ? { ...item, committee: 'City Council', result: 'Carried' } : item
  const word = statusWord(voteItem)
  const date = formatDate(item.dateISO)
  if (word === 'Status unclear') return 'Status unclear. Check the official page.'
  if (word === 'In progress') return `In progress at ${bodyName(voteItem.committee)}. Latest step: ${date}.`
  return `${word} by ${bodyName(voteItem.committee)} on ${date}.`
}

/** "How to have a say": only what we really know. The deadline is always "on the official page". */
export function flyerSay(item) {
  if (item.upcoming) {
    const { body, date, time } = item.meeting
    return {
      headline: 'You can still have a say.',
      text: `Send a written comment or ask to speak at the ${body} meeting on ${formatDate(date)} at ${time} (City Hall or video). Use the buttons on the official page. Check it for the exact deadline.`,
    }
  }
  if (isStale(item)) return { headline: 'Status unclear.', text: 'It may already be decided. Check the official page for its current status.' }
  if (getStageSteps(item).steps[3].state !== 'upcoming') {
    return { headline: 'This decision is final.', text: 'You can still tell your councillor what you think.' }
  }
  return {
    headline: 'You can still have a say.',
    text: 'Send a written comment or ask to speak at the meeting. The deadline is on the official page.',
  }
}

/** The date for the footer: the official status date, the meeting date, or the latest vote. */
export function flyerSourceDate(item) {
  return formatDate(item.official?.date ?? (item.upcoming ? item.meeting.date : item.dateISO))
}
