// Small info panel on the map (bottom left) for the selected decision:
// the plain title, the tracker dots and a link. The "back" button lives in Home's map stack.
import { Link } from 'react-router-dom'
import StageTracker from './StageTracker.jsx'
import './MapPanel.css'

export default function MapPanel({ decision }) {
  if (!decision) return null
  return (
    <aside className="map-panel" aria-label="Selected decision">
      <h2 className="map-panel__title">{decision.title}</h2>
      <StageTracker item={decision} compact />
      <Link className="map-panel__link" to={`/decision/${decision.id}`}>
        View decision
      </Link>
    </aside>
  )
}
