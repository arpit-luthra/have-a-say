// "Can I still have a say?" box. The wording depends on the stage.
// We never guess a deadline: open items always point to the official page for it.
import { getStageSteps } from '../lib/stageSteps.js'

export default function SayBox({ item }) {
  const decided = getStageSteps(item).steps[3].state !== 'upcoming'

  if (decided) {
    return (
      <div className="say say--closed">
        <p className="say__main">This decision is final.</p>
        <p>You can still tell your councillor what you think.</p>
      </div>
    )
  }

  return (
    <div className="say">
      <p className="say__main">Yes, you may still be able to speak up.</p>
      <p>
        You can send a written comment, or ask to speak at the meeting. The exact deadline is on the official page,
        so please check it there.
      </p>
      <a className="say__link" href={item.sourceUrl} target="_blank" rel="noreferrer">
        See the deadline and how to comment
      </a>
    </div>
  )
}
