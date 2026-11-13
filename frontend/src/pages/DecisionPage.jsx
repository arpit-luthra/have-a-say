// One decision, as a clean article-style page (no map).
// The answer sections are empty placeholders for now.
import { Link, useParams } from 'react-router-dom'
import decisions from '../data/decisions.json'
import './DecisionPage.css'

const SECTIONS = [
  "What's changing?",
  'Why?',
  'Where?',
  "Who's affected?",
  'Where is it in the process?',
  'Can I still have a say?',
  'Public input',
]

export default function DecisionPage() {
  const { id } = useParams() // the part of the address after /decision/
  const decision = decisions.find((d) => d.id === id)

  return (
    <main className="decision">
      <Link className="decision__back" to="/">
        ← Back to decisions
      </Link>

      {decision ? (
        <>
          <h1 className="decision__title">{decision.title}</h1>
          {SECTIONS.map((name) => (
            <section className="decision__section" key={name}>
              <h2>{name}</h2>
              <p className="decision__empty">Coming soon.</p>
            </section>
          ))}
        </>
      ) : (
        <h1 className="decision__title">We couldn't find that decision.</h1>
      )}
    </main>
  )
}
