// Start page: a photo, one big search bar, recently decided items, and 3 steps.
// Searching saves the spot in memory (ResidentContext) and goes to the Explore page.
import { useNavigate } from 'react-router-dom'
import FindWard from '../components/FindWard.jsx'
import DecisionCard from '../components/DecisionCard.jsx'
import { allItems } from '../lib/allItems.js'
import explanations from '../data/explanations.json'
import { useResident } from '../lib/ResidentContext.jsx'
import './Landing.css'

// Four relatable decisions that have a full explanation (picked by hand, not the newest ones).
const RECENT_IDS = ['2026.MM43.128', '2026.TE28.12', '2026.IE27.17', '2026.NY34.12']
const recentlyDecided = RECENT_IDS.map((id) => allItems.find((d) => d.id === id)).filter(Boolean)

// Three real numbers from our own data (never typed in by hand).
const STATS = [
  { value: allItems.length.toLocaleString('en-CA'), label: 'decisions tracked' },
  { value: Object.keys(explanations).length.toLocaleString('en-CA'), label: 'explained in plain words, with sources' },
  { value: allItems.filter((d) => d.upcoming).length.toLocaleString('en-CA'), label: 'open for comment now' },
]

const STEPS = [
  {
    title: 'Enter your address',
    text: 'We use it once to find what is close to you. We never save it.',
    icon: <path d="M12 2.5a6.5 6.5 0 0 0-6.5 6.5c0 4.8 5.7 11 6.2 11.5a.4.4 0 0 0 .6 0c.5-.5 6.2-6.7 6.2-11.5A6.5 6.5 0 0 0 12 2.5zM12 9m-2.3 0a2.3 2.3 0 1 0 4.6 0a2.3 2.3 0 1 0-4.6 0" />,
  },
  {
    title: "See what's happening near you",
    text: 'Short, plain answers about each decision.',
    icon: <path d="M3 12s3.5-6.5 9-6.5S21 12 21 12s-3.5 6.5-9 6.5S3 12 3 12zM12 12m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0" />,
  },
  {
    title: 'Have your say',
    text: 'Find out if you can still speak up, and how.',
    icon: <path d="M4 5h16v11H11l-4.5 3.5V16H4z" />,
  },
]

export default function Landing() {
  const { setFound } = useResident()
  const navigate = useNavigate()

  return (
    <main>
      <section className="hero">
        <div className="hero__inner">
          {/* Each part fades up in turn (--i = its turn). The first one waits for the intro splash if it is playing. */}
          <h1 className="hero__title fade-up" style={{ '--i': 0 }}>
            Your city is making decisions about your street.
          </h1>
          <p className="hero__sub fade-up" style={{ '--i': 1 }}>
            See what's happening near you, and how to have a say.
          </p>
          <div className="hero__search fade-up" style={{ '--i': 2 }}>
            <FindWard
              hero
              onFound={(found) => {
                setFound(found)
                navigate('/explore')
              }}
            />
          </div>
          <ul className="hero__stats fade-up" style={{ '--i': 3 }}>
            {STATS.map((stat) => (
              <li key={stat.label}>
                <strong>{stat.value}</strong>
                <span>{stat.label}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="section">
        <h2 className="section__title">Recently decided in Toronto</h2>
        <ul className="recent">
          {recentlyDecided.map((d) => (
            <li key={d.id}>
              <DecisionCard decision={d} />
            </li>
          ))}
        </ul>
      </section>

      <section className="section section--steps">
        <h2 className="section__title">How it works</h2>
        <ol className="steps">
          {STEPS.map((step, i) => (
            <li key={step.title} className="steps__item">
              <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
                {step.icon}
              </svg>
              <h3>
                {i + 1}. {step.title}
              </h3>
              <p>{step.text}</p>
            </li>
          ))}
        </ol>
      </section>
    </main>
  )
}
