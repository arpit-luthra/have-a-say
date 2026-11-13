// One item in the list. The whole card links to its own page.
// Items without a written explanation say so; their page shows what the open data knows.
import { Link } from 'react-router-dom'
import { formatDate } from '../lib/formatDate.js'
import StageTracker from './StageTracker.jsx'
import './DecisionCard.css'

export default function DecisionCard({ decision }) {
  const { detailed } = decision
  return (
    <Link className="card" to={`/decision/${decision.id}`}>
      <div className="card__top">
        <span className="card__topic">{decision.topic}</span>
        <StageTracker item={decision} compact />
      </div>
      <h2 className="card__title">{decision.title}</h2>
      {decision.officialTitle && <p className="card__official">Official title: {decision.officialTitle}</p>}
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
          <p className="card__meta">{decision.committee}</p>
          <p className="card__meta card__meta--date">
            Last vote {formatDate(decision.dateISO)} · {decision.result}
          </p>
          <p className="card__say">Full explanation not ready yet.</p>
        </>
      )}
    </Link>
  )
}
