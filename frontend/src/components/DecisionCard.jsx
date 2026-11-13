// One item in the list. The whole card links to its own page.
// Items without a written explanation say so; their page shows what the open data knows.
import { Link } from 'react-router-dom'
import { formatDate } from '../lib/formatDate.js'
import CouncillorVote from './CouncillorVote.jsx'
import { bodyName } from '../lib/voteWords.js'
import { getStageSteps } from '../lib/stageSteps.js'
import './DecisionCard.css'

// One plain word for the list: the full 4-step tracker lives on the decision page.
function statusWord(decision) {
  const lastStep = getStageSteps(decision).steps[3]
  if (lastStep.state === 'reached') return 'Approved'
  if (lastStep.state === 'rejected') return 'Rejected'
  return 'In progress'
}

// `onHover(id | null)` lets the page highlight this card's map pin; `active` = its pin is hovered.
export default function DecisionCard({ decision, active = false, onHover = () => {} }) {
  const { detailed } = decision
  return (
    <Link
      id={`card-${decision.id}`} // so the map can scroll this card into view
      className={`card${active ? ' card--active' : ''}`}
      to={`/decision/${decision.id}`}
      onMouseEnter={() => onHover(decision.id)}
      onMouseLeave={() => onHover(null)}
    >
      <div className="card__top">
        <span className="card__topic">{decision.topic}</span>
        <span className="card__status">{statusWord(decision)}</span>
      </div>
      <h2 className="card__title">{decision.title}</h2>
      {detailed ? (
        <>
          <p className="card__meta">
            {decision.ward} · {decision.neighbourhood}
          </p>
          <p className="card__meta card__meta--date">{decision.date}</p>
          <p className="card__say">{decision.say}</p>
        </>
      ) : (
        <>
          <p className="card__meta">{bodyName(decision.committee)}</p>
          <p className="card__meta card__meta--date">
            Decided {formatDate(decision.dateISO)}
          </p>
          <p className="card__say">Full explanation not ready yet.</p>
          <CouncillorVote item={decision} />
        </>
      )}
    </Link>
  )
}
