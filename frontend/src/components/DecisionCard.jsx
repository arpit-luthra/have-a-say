// One item in a list: topic, plain title, then status · distance.
// The whole card links to the decision's own page.
import { Link } from 'react-router-dom'
import { statusWord } from '../lib/statusWord.js'
import './DecisionCard.css'

// `onHover(id | null)` lets the page highlight this card's map pin; `active` = its pin is hovered.
// `distanceKm` is optional (no distance until the person has searched an address).
export default function DecisionCard({ decision, distanceKm = null, active = false, onHover = () => {} }) {
  return (
    <Link
      id={`card-${decision.id}`} // so the map can scroll this card into view
      className={`card${active ? ' card--active' : ''}`}
      to={`/decision/${decision.id}`}
      onMouseEnter={() => onHover(decision.id)}
      onMouseLeave={() => onHover(null)}
    >
      <p className="card__topic">{decision.topic}</p>
      <h2 className="card__title">{decision.title}</h2>
      <p className="card__meta">{statusWord(decision)}{distanceKm != null && ` · ${distanceKm.toFixed(1)} km away`}</p>
    </Link>
  )
}
