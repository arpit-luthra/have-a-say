// One decision, laid out like a public notice: question on the left, answer on the right,
// thin lines between sections, and numbered footnotes with a Sources list at the bottom.
import { Link, useParams } from 'react-router-dom'
import decisions from '../data/decisions.json'
import { allItems } from '../lib/allItems.js'
import { formatDate } from '../lib/formatDate.js'
import details from '../data/decision-details.json'
import StageTracker from '../components/StageTracker.jsx'
import './DecisionPage.css'

// Give every distinct source one number for the whole page (same link + label = same number).
function buildSourceList(sections) {
  const list = []
  const numberFor = (src) => {
    const i = list.findIndex((s) => s.url === src.url && s.label === src.label)
    if (i >= 0) return i + 1
    list.push(src)
    return list.length
  }
  const numbered = sections.map((sec) => ({
    ...sec,
    refs: sec.sources.map(numberFor),
  }))
  return { numbered, list }
}

// Small italic note when we are not fully sure. Confirmed answers get no note.
function certaintyNote(certainty) {
  if (certainty === 'unclear') return 'Not confirmed yet.'
  if (certainty === 'partly-unclear') return 'Partly unclear.'
  if (certainty === 'inferred') return 'Our estimate, not stated in the official record.'
  return null
}

// Superscript footnote markers like [1] [2], each linking down to the Sources list.
function Footnotes({ refs }) {
  return (
    <sup className="fn">
      {refs.map((n) => (
        <a key={n} href={`#source-${n}`}>
          [{n}]
        </a>
      ))}
    </sup>
  )
}

// Simple vertical timeline: date (mono) on the left, step and note on the right.
function Timeline({ stages }) {
  return (
    <ol className="timeline">
      {stages.map((s) => {
        const state = s.skipped ? 'skipped' : s.done ? 'done' : 'todo'
        return (
          <li className={`timeline__item timeline__item--${state}`} key={s.label}>
            <span className="timeline__date">{s.skipped ? '—' : s.date}</span>
            <span className="timeline__dot" aria-hidden="true" />
            <span className="timeline__body">
              <strong>{s.label}</strong>
              {s.skipped && <em> Skipped</em>}
              {s.note && <span className="timeline__note">{s.note}</span>}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

function Section({ section, decision }) {
  const isSay = section.key === 'say'
  const note = certaintyNote(section.certainty)
  return (
    <section className="row">
      <h2 className={`row__q${isSay ? ' row__q--say' : ''}`}>{section.title}</h2>
      <div className="row__a">
        {section.stages ? (
          <>
            <StageTracker item={{ ...decision, detailed: true }} />
            <Timeline stages={section.stages} />
          </>
        ) : (
          <p>{section.text}</p>
        )}
        <Footnotes refs={section.refs} />
        {note && <p className="row__note">{note}</p>}
      </div>
    </section>
  )
}

// Simpler page for items we only know from open data.
function BasicDecision({ item }) {
  return (
    <main className="decision">
      <div className="decision__band">
        <Link className="decision__back" to="/">
          ← Back to decisions
        </Link>
        <header className="decision__header">
          <p className="decision__ref">
            Item <span className="mono">{item.id}</span> · {item.topic} · {item.committee}
          </p>
          <h1 className="decision__title">{item.title}</h1>
          {item.officialTitle && <p className="decision__official">Official title: {item.officialTitle}</p>}
          <p className="decision__where">
            Last vote <span className="mono">{formatDate(item.dateISO)}</span>
          </p>
        </header>
      </div>

      <section className="row">
        <h2 className="row__q">Not explained yet</h2>
        <div className="row__a">
          <p className="notice">We haven't written a plain-language explanation for this decision yet.</p>
          <p className="notice__link">
            <a href={item.sourceUrl} target="_blank" rel="noreferrer">
              Read it on the official City page
            </a>
          </p>
          <button className="explain-btn" type="button" disabled>
            Explain this decision
          </button>
          <p className="row__note">Coming soon.</p>
        </div>
      </section>

      <section className="row">
        <h2 className="row__q">Last vote</h2>
        <div className="row__a">
          <p>
            <span className="mono">{item.result}</span> at {item.committee} on{' '}
            <span className="mono">{formatDate(item.dateISO)}</span>.
          </p>
          <p className="row__note">
            This is the most recent recorded vote we have. It may not be the final decision.
          </p>
        </div>
      </section>

      <section className="row">
        <h2 className="row__q">Where is it in the process?</h2>
        <div className="row__a">
          <StageTracker item={item} />
        </div>
      </section>

      <section className="row">
        <h2 className="row__q">Sources</h2>
        <ul className="row__a plain-list">
          <li>
            <a href={item.sourceUrl} target="_blank" rel="noreferrer">
              Official City page for item {item.id}
            </a>
          </li>
          <li>Toronto Open Data: Members of Toronto City Council, Voting Record</li>
          <li>The topic "{item.topic}" is our keyword guess from the title.</li>
        </ul>
      </section>
    </main>
  )
}

export default function DecisionPage() {
  const { id } = useParams() // the part of the address after /decision/
  const decision = decisions.find((d) => d.id === id)
  const info = details[id]

  // No hand-written explanation: show the simpler page built from open data.
  const basic = !info && allItems.find((d) => d.id === id)
  if (basic) return <BasicDecision item={basic} />

  if (!decision || !info) {
    return (
      <main className="decision">
        <Link className="decision__back" to="/">
          ← Back to decisions
        </Link>
        <h1 className="decision__title">We couldn't find that decision.</h1>
      </main>
    )
  }

  const { numbered, list } = buildSourceList(info.sections)

  return (
    <main className="decision">
      <div className="decision__band">
      <Link className="decision__back" to="/">
        ← Back to decisions
      </Link>

      <header className="decision__header">
        <p className="decision__ref">
          Item <span className="mono">{decision.id}</span> · {decision.topic} · {decision.stage}
        </p>
        <h1 className="decision__title">{decision.title}</h1>
        <p className="decision__where">
          {decision.ward} · {decision.neighbourhood} · <span className="mono">{decision.date}</span>
        </p>
        <p className="decision__summary">{info.summary}</p>
      </header>
      </div>

      {numbered.map((s) => (
        <Section section={s} decision={decision} key={s.key} />
      ))}

      <section className="row">
        <h2 className="row__q">Documents</h2>
        <ul className="row__a plain-list">
          {info.documents.map((doc) => (
            <li key={doc.url}>
              <a href={doc.url} target="_blank" rel="noreferrer">
                {doc.label}
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section className="row">
        <h2 className="row__q">Sources</h2>
        <ol className="row__a sources">
          {list.map((src, i) => (
            <li id={`source-${i + 1}`} key={src.url + src.label}>
              <span className="mono">[{i + 1}]</span>{' '}
              <a href={src.url} target="_blank" rel="noreferrer">
                {src.label}
              </a>
            </li>
          ))}
        </ol>
      </section>
    </main>
  )
}
