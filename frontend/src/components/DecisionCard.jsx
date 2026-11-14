// One item in a list: topic, plain title, status · distance, and two buttons.
// The card itself is not a link: "Show on map" and "Read more" do the two jobs.
import { Link } from 'react-router-dom'
import { statusWord } from '../lib/statusWord.js'
import './DecisionCard.css'

// `onHover(id | null)` lets the page highlight this card's map pin; `active` = its pin is hovered.
// `onShowOnMap(id)` flies the map to this decision. Only shown if the decision has a map spot.
// `distanceKm` is optional (no distance until the person has searched an address).
export default function DecisionCard({ decision, distanceKm = null, active = false, onHover = () => {}, onShowOnMap = null }) {
  return (
    <article
      id={`card-${decision.id}`} // so the map can scroll this card into view
      className={`card${active ? ' card--active' : ''}`}
      onMouseEnter={() => onHover(decision.id)}
      onMouseLeave={() => onHover(null)}
    >
      {decision.topic !== 'Other' && <p className="card__topic">{decision.topic}</p>}
      {decision.fullExplanation && <span className="card__badge">Full explanation</span>}
      <h2 className="card__title">{decision.title}</h2>
      <p className="card__meta">
        {decision.upcoming ? <span className="card__open">Open for comments</span> : statusWord(decision)}
        {distanceKm != null && ` · ${distanceKm.toFixed(1)} km away`}
      </p>
      <div className="card__actions">
        {onShowOnMap && decision.lat != null && (
          <button className="card__btn" type="button" onClick={() => onShowOnMap(decision.id)}>
            Show on map
          </button>
        )}
        <Link className="card__btn card__btn--primary" to={`/decision/${decision.id}`}>
          Read more
        </Link>
      </div>
    </article>
  )
}
