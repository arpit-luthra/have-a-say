// Simple stand-in page for menu items we haven't built yet.
import './DecisionPage.css'

export default function Placeholder({ title }) {
  return (
    <main className="decision">
      <h1 className="decision__title">{title}</h1>
      <p className="decision__empty">Coming soon.</p>
    </main>
  )
}
