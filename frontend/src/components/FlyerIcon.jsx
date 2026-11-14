// The small grey "Print a flyer" icon (outline download tray, 20px, no border, no background).
// It turns Toronto blue on hover and shows a small tooltip. Clicking opens the flyer in a new tab.
import './FlyerIcon.css'

export default function FlyerIcon({ id, tooltip = 'above' }) {
  return (
    <a
      className={`flyer-icon flyer-icon--${tooltip}`}
      href={`/decision/${id}/flyer`}
      target="_blank"
      rel="noreferrer"
      aria-label="Print a flyer"
      data-tip="Print a flyer"
    >
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 4v10" />
        <path d="M8 10.5l4 4 4-4" />
        <path d="M5 19h14" />
      </svg>
    </a>
  )
}
