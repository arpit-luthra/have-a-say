// Overlays on the map for the selected decision: a "back to all of Toronto" button (top left)
// and a small info panel (bottom left) with the plain title, the tracker dots and a link.
import { Link } from 'react-router-dom'
import StageTracker from './StageTracker.jsx'
import './MapPanel.css'

export default function MapPanel({ decision, onBack }) {
  if (!decision) return null
  return (
    <>
      <button className="map-back" type="button" onClick={onBack}>
        ← Back to all of Toronto
      </button>
      <aside className="map-panel" aria-label="Selected decision">
        <h2 className="map-panel__title">{decision.title}</h2>
        <StageTracker item={decision} compact />
        <Link className="map-panel__link" to={`/decision/${decision.id}`}>
          View decision
        </Link>
      </aside>
    </>
  )
}
