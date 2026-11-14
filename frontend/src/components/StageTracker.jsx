// The 4-step tracker. `compact` = 4 small dots + current step (list cards);
// otherwise a full version with step names under the dots (decision page).
import { getStageSteps } from '../lib/stageSteps.js'
import './StageTracker.css'

// `dates`: optional list of 4 strings (or empty) shown under each step. `quiet`: hide the small notes under the tracker.
export default function StageTracker({ item, compact = false, dates = null, quiet = false }) {
  const { steps, label, next, uncertain } = getStageSteps(item)

  if (compact) {
    return (
      <span className="tracker tracker--compact" aria-label={`Stage: ${label}`}>
        <span className="tracker__dots" aria-hidden="true">
          {steps.map((s) => (
            <span key={s.name} className={`tracker__dot tracker__dot--${s.state}`} />
          ))}
        </span>
        <span className="tracker__label">{label}</span>
      </span>
    )
  }

  return (
    <div className="tracker">
      <ol className="tracker__steps">
        {steps.map((s, i) => (
          <li key={s.name} className={`tracker__step tracker__step--${s.state}`}>
            <span className="tracker__dot-row">
              <span className={`tracker__dot tracker__dot--${s.state}`} aria-hidden="true" />
              {i < steps.length - 1 && <span className="tracker__line" aria-hidden="true" />}
            </span>
            <span className="tracker__name">{s.name}</span>
            {dates?.[i] && <span className="tracker__date">{dates[i]}</span>}
            {s.note && <em className="tracker__note">{s.note}</em>}
          </li>
        ))}
      </ol>
      {!quiet && next && <p className="tracker__next">{next}</p>}
      {!quiet && uncertain && <p className="tracker__uncertain">Based on the latest recorded vote.</p>}
    </div>
  )
}
