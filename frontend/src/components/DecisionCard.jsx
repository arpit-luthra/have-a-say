// One decision in the list. The whole card is a link to its own page.
import { Link } from 'react-router-dom'
import './DecisionCard.css'

export default function DecisionCard({ decision }) {
  return (
    <Link className="card" to={`/decision/${decision.id}`}>
      <div className="card__top">
        <span className="card__topic">{decision.topic}</span>
        <span className="card__stage">{decision.stage}</span>
      </div>
      <h2 className="card__title">{decision.title}</h2>
      <p className="card__meta">
        {decision.ward} · {decision.neighbourhood}
      </p>
      <p className="card__meta">{decision.date}</p>
      <p className="card__say">{decision.say}</p>
    </Link>
  )
}
