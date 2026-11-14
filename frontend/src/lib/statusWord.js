// One plain word for a decision: the full 4-step tracker lives on the decision page.
import { getStageSteps, isStale } from './stageSteps.js'

export function statusWord(decision) {
  if (isStale(decision)) return 'Status unclear'
  const { steps, unclear, word } = getStageSteps(decision)
  if (unclear) return 'Status unclear'
  if (word) return word // from the official page: Approved, Rejected, In progress or "Noted, no action"
  const lastStep = steps[3]
  if (lastStep.state === 'reached') return 'Approved'
  if (lastStep.state === 'rejected') return 'Rejected'
  return 'In progress'
}

/** The status plus any detail from the official page: "In progress · Postponed", "Rejected · Fence exemption not granted". */
export function statusText(decision) {
  const word = statusWord(decision)
  const detail = decision.official?.label
  return detail && !(word === 'Approved' && detail === 'Approved') ? `${word} · ${detail}` : word
}
