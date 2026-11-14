// One item in a list. EVERY card has the same structure and spacing:
//   tag, title, status line, then a row of buttons with the flyer icon on the right of that same row.
// The card itself is not a link: "Show on map" and "Read more" do the two jobs.
import { Link } from 'react-router-dom'
import { statusText } from '../lib/statusWord.js'
import explanations from '../data/explanations.json'
import FlyerIcon from './FlyerIcon.jsx'
import './DecisionCard.css'

// The tag at the top. "Other" says nothing useful, so those cards get "Citywide" (no address) or "Local" (has an address).
function cardTag(decision) {
  if (decision.topic !== 'Other') return decision.topic
  return decision.lat != null || decision.place ? 'Local' : 'Citywide'
}

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
      <p className="card__topic">{cardTag(decision)}</p>
      <h2 className="card__title">{decision.title}</h2>
      <p className="card__meta">
        {decision.upcoming ? <span className="card__open">Open for comments</span> : statusText(decision)}
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
        {explanations[decision.id] && (
          <span className="card__flyer">
            <FlyerIcon id={decision.id} />
          </span>
        )}
      </div>
    </article>
  )
}
