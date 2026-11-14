// One plain word for a decision: the full 4-step tracker lives on the decision page.
import { getStageSteps, isStale } from './stageSteps.js'

export function statusWord(decision) {
  if (isStale(decision)) return 'Status unclear'
  const lastStep = getStageSteps(decision).steps[3]
  if (lastStep.state === 'reached') return 'Approved'
  if (lastStep.state === 'rejected') return 'Rejected'
  return 'In progress'
}
