// "Can I still have a say?" box: one bold line, one sentence of what to do, and a button when needed.
// We never guess a deadline: open items always point to the official page for it.
// `headlineOnly`: just the bold line (used when the report's own sentences already explain the rest).
import { getStageSteps, isStale } from '../lib/stageSteps.js'
import { formatDate } from '../lib/formatDate.js'

export default function SayBox({ item, headlineOnly = false }) {
  // An upcoming item: the meeting has not happened, so people can still comment or ask to speak.
  // Both buttons open the official item page, which has the real deadline and the forms. We never guess a deadline.
  if (item.upcoming) {
    const { body, date, time } = item.meeting
    return (
      <div className="say">
        <p className="say__main">Yes, you can still have a say.</p>
        <p>
          Send a written comment or ask to speak at the {body} meeting on {formatDate(date)} at {time} (City Hall or video).
        </p>
        <div className="say__buttons">
          <a className="say__link" href={item.sourceUrl} target="_blank" rel="noreferrer">
            Submit a comment
          </a>
          <a className="say__link" href={item.sourceUrl} target="_blank" rel="noreferrer">
            Ask to speak
          </a>
        </div>
        <p>Check the official page for the exact deadline.</p>
      </div>
    )
  }

  const decided = getStageSteps(item).steps[3].state !== 'upcoming'

  if (isStale(item)) {
    return (
      <div className="say">
        <p className="say__main">Status unclear.</p>
        {!headlineOnly && (
          <>
            <p>It may already be decided. Check the official page for its current status.</p>
            <a className="say__link" href={item.sourceUrl} target="_blank" rel="noreferrer">
              Open the official page
            </a>
          </>
        )}
      </div>
    )
  }

  if (decided) {
    return (
      <div className="say say--closed">
        <p className="say__main">This decision is final.</p>
        {!headlineOnly && <p>You can still tell your councillor what you think.</p>}
      </div>
    )
  }

  return (
    <div className="say">
      <p className="say__main">You can still have a say.</p>
      {!headlineOnly && (
        <>
          <p>Send a written comment or ask to speak at the meeting. The deadline is on the official page.</p>
          <a className="say__link" href={item.sourceUrl} target="_blank" rel="noreferrer">
            See the deadline and how to comment
          </a>
        </>
      )}
    </div>
  )
}
