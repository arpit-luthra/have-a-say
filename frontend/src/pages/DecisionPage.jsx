// One decision, laid out like a public notice: question on the left, answer on the right,
// thin lines between sections. EVERY decision gets the same sections in the same order:
//   What's happening? > Why? > Where, and who's affected? > Conditions (only if any)
//   > Where is it in the process? > Can I still have a say? > Your councillor > Sources
//
// Where the words come from (best first):
//   1. explanations.json   made by scripts/explain_decisions.py from the official PDFs; every sentence has a page link
//   2. decision-details.json   our 2 hand-checked decisions
//   3. nothing yet: we show the plain title/address and say we don't have the report
// The process tracker, say box, councillor and sources come from open data, so they are always filled.
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { allItems } from '../lib/allItems.js'
import { formatDate } from '../lib/formatDate.js'
import { bodyName, outcomeWord } from '../lib/voteWords.js'
import details from '../data/decision-details.json'
import explanations from '../data/explanations.json'
import CouncillorVote from '../components/CouncillorVote.jsx'
import SayBox from '../components/SayBox.jsx'
import YourCouncillor from '../components/YourCouncillor.jsx'
import StageTracker from '../components/StageTracker.jsx'
import './DecisionPage.css'

const NOT_CLEAR = 'Not clear from the report'
const NO_REPORT = "We don't have the report for this decision yet."
const STEP_NAMES = {
  staff: 'Staff recommendation',
  committee: 'Committee decision',
  council: 'City Council decision',
}

// ---------- turning the data into "sentences" ----------
// A sentence is { text, links: [{ label, url }] }. Both data sources are converted to this shape,
// so the page below only has to know one thing.

// "Report, p. 4" linking to the PDF opened at page 4. (#page=4 is a standard PDF link parameter.)
function pageLinks(sentence, documents) {
  return sentence.cites.map((c) => {
    const doc = documents.find((d) => d.n === c.doc)
    const name = documents.length === 1 ? 'Report' : `Doc ${c.doc}`
    return { label: `${name}, p. ${c.page}`, url: `${doc.url}#page=${c.page}` }
  })
}

function fromExplanation(ex, key) {
  return ex.sections[key].map((s) => ({ ...s, links: pageLinks(s, ex.documents) }))
}

// Our hand-written sections keep their own source links (an official page or PDF, not a page number).
function fromHandChecked(info, ...keys) {
  return info.sections
    .filter((sec) => keys.includes(sec.key))
    .map((sec) => ({ text: sec.text, links: sec.sources.map((s) => ({ label: 'Source', url: s.url })), certainty: sec.certainty }))
}

// ---------- small pieces ----------

// Small italic note when we are not fully sure. Confirmed answers get no note.
function certaintyNote(certainty) {
  if (certainty === 'unclear') return 'Not confirmed yet.'
  if (certainty === 'partly-unclear') return 'Partly unclear.'
  if (certainty === 'inferred') return 'Our estimate, not stated in the official record.'
  return null
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

// Sentences, each followed by its small source links. "Not clear from the report" is shown in italics.
function Sentences({ sentences }) {
  return (
    <>
      {sentences.map((s, i) => {
        const note = certaintyNote(s.certainty)
        return (
          <p className="answer" key={i}>
            <span className={s.text.startsWith(NOT_CLEAR) ? 'answer__unclear' : undefined}>{s.text}</span>{' '}
            {s.links.map((l) => (
              <a className="src" key={l.url} href={l.url} target="_blank" rel="noreferrer">
                {l.label}
              </a>
            ))}
            {note && <em className="answer__note"> {note}</em>}
          </p>
        )
      })}
    </>
  )
}

// Shown when we have no report for this decision: what open data tells us, plus an honest note.
function NoReport({ lines }) {
  return (
    <>
      {lines.map((line) => (
        <p className="answer" key={line}>{line}</p>
      ))}
      <p className="answer answer__unclear">{NO_REPORT}</p>
    </>
  )
}

// Simple vertical timeline for our 2 hand-checked decisions: date on the left, step and note on the right.
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

// Staff recommendation, committee decision and council decision are kept as three separate items.
function ProcessSteps({ sentences }) {
  const seen = Object.keys(STEP_NAMES).filter((step) => sentences.some((s) => s.step === step))
  if (seen.length === 0) return null
  return (
    <div className="steps">
      {Object.entries(STEP_NAMES).map(([step, name]) => {
        const mine = sentences.filter((s) => s.step === step)
        if (mine.length === 0) return null
        const date = mine.find((s) => s.date)?.date
        return (
          <div className="steps__item" key={step}>
            <h3 className="steps__name">
              {name}
              {date && <span className="mono steps__date"> · {date}</span>}
            </h3>
            <Sentences sentences={mine} />
          </div>
        )
      })}
    </div>
  )
}

function Row({ title, say = false, children }) {
  return (
    <section className="row">
      <h2 className={`row__q${say ? ' row__q--say' : ''}`}>{title}</h2>
      <div className="row__a">{children}</div>
    </section>
  )
}

// Every document we used, with its date. The official page is always first.
function buildSources(item, ex, info) {
  const official = {
    label: `Official City page for item ${item.id}`,
    url: item.sourceUrl,
    date: item.dateISO ? `latest vote ${formatDate(item.dateISO)}` : '',
  }
  if (ex) return [official, ...ex.documents.map((d) => ({ label: d.title, url: d.url, date: d.date }))]
  if (info) return [official, ...info.documents.map((d) => ({ label: d.label, url: d.url, date: '' }))]
  return [official]
}

export default function DecisionPage() {
  const { id } = useParams() // the part of the address after /decision/
  const item = allItems.find((d) => d.id === id)

  if (!item) {
    return (
      <main className="decision">
        <Link className="decision__back" to="/">
          ← Back to decisions
        </Link>
        <h1 className="decision__title">We couldn't find that decision.</h1>
      </main>
    )
  }

  const ex = explanations[id]
  const info = !ex ? details[id] : null // hand-checked text is only used when there is no generated explanation

  // The three "story" sections.
  const happening = ex ? fromExplanation(ex, 'happening') : info ? fromHandChecked(info, 'changing') : []
  const why = ex ? fromExplanation(ex, 'why') : info ? fromHandChecked(info, 'why') : []
  const whereWho = ex ? fromExplanation(ex, 'where') : info ? fromHandChecked(info, 'where', 'who') : []
  const conditions = ex ? fromExplanation(ex, 'conditions') : []
  const processSentences = ex ? fromExplanation(ex, 'process') : []
  const saySentences = ex ? fromExplanation(ex, 'say') : info ? fromHandChecked(info, 'say') : []
  const timeline = info?.sections.find((sec) => sec.stages)?.stages

  const placeLine = item.place ? `Where: ${item.place}${item.approximate ? ' (approximate spot on the map)' : ''}` : null
  const sources = buildSources(item, ex, info)
  const fallbackLines = [item.title]
  // Our 2 hand-checked decisions have no vote record of their own; both were adopted by City Council.
  const voteItem = item.detailed ? { ...item, committee: 'City Council', result: 'Carried' } : item

  return (
    <main className="decision">
      <div className="decision__band">
        <Link className="decision__back" to="/">
          ← Back to decisions
        </Link>

        <header className="decision__header">
          <p className="decision__ref">
            Item <span className="mono">{item.id}</span> · {item.topic}
            {ex && <span className="decision__full"> · Full explanation</span>}
          </p>
          <h1 className="decision__title">{item.title}</h1>
          <OfficialTitle title={item.officialTitle} plain={item.title} />
          <p className="decision__where">
            {item.ward && <>{item.ward} · </>}
            {item.place && <>{item.place} · </>}
            <span className="mono">{formatDate(item.dateISO)}</span>
          </p>
          {info && <p className="decision__summary">{info.summary}</p>}
        </header>
      </div>

      <Row title="What's happening?">
        {happening.length ? <Sentences sentences={happening} /> : <NoReport lines={fallbackLines} />}
      </Row>

      <Row title="Why?">
        {why.length ? <Sentences sentences={why} /> : <NoReport lines={[]} />}
      </Row>

      <Row title="Where, and who's affected?">
        {whereWho.length ? (
          <Sentences sentences={whereWho} />
        ) : (
          <NoReport lines={placeLine ? [placeLine] : []} />
        )}
      </Row>

      {conditions.length > 0 && (
        <Row title="Conditions">
          <Sentences sentences={conditions} />
        </Row>
      )}

      <Row title="Where is it in the process?">
        <StageTracker item={item} />
        <p className="answer answer__latest">
          Latest recorded vote: {bodyName(voteItem.committee)} · {outcomeWord(voteItem.result)} ·{' '}
          <span className="mono">{formatDate(item.dateISO)}</span>
        </p>
        {timeline && <Timeline stages={timeline} />}
        <ProcessSteps sentences={processSentences} />
      </Row>

      <Row title="Can I still have a say?" say>
        {saySentences.length > 0 && <Sentences sentences={saySentences} />}
        <SayBox item={item} />
      </Row>

      <Row title="Your councillor">
        <YourCouncillor item={voteItem} />
        <CouncillorVote item={voteItem} full />
      </Row>

      <Row title="Sources">
        <ol className="sources">
          {sources.map((src, i) => (
            <li key={src.url}>
              <span className="mono">[{i + 1}]</span>{' '}
              <a href={src.url} target="_blank" rel="noreferrer">
                {src.label}
              </a>
              {src.date && <span className="sources__date"> · {src.date}</span>}
            </li>
          ))}
        </ol>
      </Row>
    </main>
  )
}
