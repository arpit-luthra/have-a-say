// One decision, laid out like a public notice: question on the left, answer on the right,
// thin lines between sections, and numbered footnotes with a Sources list at the bottom.
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import decisions from '../data/decisions.json'
import { allItems } from '../lib/allItems.js'
import { topicBlurb } from '../lib/topicBlurbs.js'
import details from '../data/decision-details.json'
import CouncillorVote from '../components/CouncillorVote.jsx'
import SayBox from '../components/SayBox.jsx'
import YourCouncillor from '../components/YourCouncillor.jsx'
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

// Small grey link that reveals the official title. Renders nothing if we have no different one.
function OfficialTitle({ title, plain }) {
  const [show, setShow] = useState(false)
  if (!title || title === plain) return null
  return (
    <>
      <button className="dcard__toggle" type="button" onClick={() => setShow(!show)}>
        {show ? 'Hide official title' : 'Show official title'}
      </button>
      {show && <p className="dcard__official">{title}</p>}
    </>
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
        {isSay && <SayBox item={decision} />}
        {note && <p className="row__note">{note}</p>}
      </div>
    </section>
  )
}

// Page for items we only know from open data. Every section uses only data we already have.
function BasicDecision({ item }) {
  return (
    <main className="decision decision--basic">
      <Link className="decision__back" to="/">
        ← Back to decisions
      </Link>

      <article className="dcard">
        <h2 className="dcard__title">What is this?</h2>
        <p className="dcard__big">{item.title}</p>
        <p>{topicBlurb(item.topic)}</p>
        <OfficialTitle title={item.officialTitle} plain={item.title} />
      </article>

      <article className="dcard">
        <h2 className="dcard__title">Where is it in the process?</h2>
        <StageTracker item={item} />
      </article>

      <article className="dcard dcard--accent">
        <h2 className="dcard__title">Can I still have a say?</h2>
        <SayBox item={item} />
      </article>

      <article className="dcard">
        <h2 className="dcard__title">Your councillor</h2>
        <YourCouncillor item={item} />
      </article>

      <p className="decision__official-link">
        <a href={item.sourceUrl} target="_blank" rel="noreferrer">
          Official page ↗
        </a>
        <span className="mono"> {item.id}</span>
      </p>
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
        <OfficialTitle title={decision.officialTitle} plain={decision.title} />
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
        <h2 className="row__q">Your councillor</h2>
        <div className="row__a">
          <YourCouncillor item={{ ...decision, committee: 'City Council' }} />
        </div>
      </section>

      <section className="row">
        <h2 className="row__q">How your councillor voted</h2>
        <div className="row__a">
          <CouncillorVote item={{ ...decision, committee: 'City Council' }} full />
        </div>
      </section>

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
