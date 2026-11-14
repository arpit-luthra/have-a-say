// One decision, laid out like a public notice: question on the left, answer on the right,
// thin lines between sections. EVERY decision gets the same sections in the same order:
//   What's happening? > Why? > Where, and who's affected? > Conditions (only if any)
//   > Where is it in the process? > Can I still have a say? > Your councillor > Sources
// Each is its own bordered block. Without a report, the story blocks say "Coming soon" (said once per block).
//
// Where the words come from (best first):
//   1. explanations.json   made by scripts/explain_decisions.py from the official PDFs; every sentence has a page link
//   2. decision-details.json   our 2 hand-checked decisions
//   3. nothing yet: we show the plain title/address and say we don't have the report
// The process tracker, say box, councillor and sources come from open data, so they are always filled.
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { navTrail } from '../lib/navTrail.js'
import { allItems } from '../lib/allItems.js'
import { formatDate } from '../lib/formatDate.js'
import { bodyName } from '../lib/voteWords.js'
import { statusWord } from '../lib/statusWord.js'
import { getStageSteps } from '../lib/stageSteps.js'
import { useResident } from '../lib/ResidentContext.jsx'
import { loadWards, wardSummary } from '../lib/wardData.js'
import { findWardAt } from '../lib/geo.js'
import details from '../data/decision-details.json'
import explanations from '../data/explanations.json'
import CouncillorVote from '../components/CouncillorVote.jsx'
import SayBox from '../components/SayBox.jsx'
import YourCouncillor from '../components/YourCouncillor.jsx'
import StageTracker from '../components/StageTracker.jsx'
import './DecisionPage.css'

const NOT_CLEAR = 'Not clear from the report'
const NOT_MENTIONED = ["The report doesn't mention", 'The report does not mention'] // e.g. "The report doesn't mention any plan to replace this building."
const STEP_NAMES = {
  staff: 'Staff recommendation',
  committee: 'Committee decision',
  council: 'City Council decision',
}

// ---------- turning the data into "sentences" ----------
// A sentence is { text, links: [{ label, url }] }. Both data sources are converted to this shape,
// so the page below only has to know one thing.

// "Report, p. 4" linking to the PDF opened at page 4. (#page=4 is a standard PDF link parameter.)
// The voting record is cited like a document but has no pages: it just links to the record.
function pageLinks(sentence, documents) {
  const reports = documents.filter((d) => !d.record)
  return sentence.cites.map((c) => {
    const doc = documents.find((d) => d.n === c.doc)
    if (doc.record) return { label: doc.title, url: doc.url }
    const name = reports.length === 1 ? 'Report' : `Doc ${c.doc}`
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
function Sentences({ sentences, bullets = false }) {
  if (bullets) {
    return (
      <ul className="bullets">
        {sentences.map((s, i) => (
          <li key={i}>
            {s.text}{' '}
            {s.links.map((l) => (
              <a className="src" key={l.url} href={l.url} target="_blank" rel="noreferrer">
                {l.label}
              </a>
            ))}
          </li>
        ))}
      </ul>
    )
  }
  return (
    <>
      {sentences.map((s, i) => {
        const note = certaintyNote(s.certainty)
        return (
          <p className="answer" key={i}>
            <span className={s.text.startsWith(NOT_CLEAR) || NOT_MENTIONED.some((start) => s.text.startsWith(start)) ? 'answer__unclear' : undefined}>{s.text}</span>{' '}
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
    <div className="process">
      {Object.entries(STEP_NAMES).map(([step, name]) => {
        const mine = sentences.filter((s) => s.step === step)
        if (mine.length === 0) return null
        const date = mine.find((s) => s.date)?.date
        return (
          <div className="process__item" key={step}>
            <h3 className="process__name">
              {name}
              {date && <span className="mono process__date"> · {date}</span>}
            </h3>
            <Sentences sentences={mine} />
          </div>
        )
      })}
    </div>
  )
}

// One bordered block: heading, then content.
function Block({ title, children }) {
  return (
    <section className="dp__block">
      <h2 className="dp__heading">{title}</h2>
      {children}
    </section>
  )
}

const COMING_SOON = "Coming soon. We're adding the full report for this decision."

// "Approved by City Council", "In progress at City committee"... the only place the status is written in words.
function statusLine(status, body) {
  if (status === 'Approved' || status === 'Rejected') return `${status} by ${body}`
  if (status === 'In progress') return `In progress at ${body}`
  return status // "Status unclear"
}

// The same line for an item whose status comes from the official City page (it can carry a detail like "Postponed").
function officialStatusLine(o, word) {
  const detail = o.label && o.label !== word ? ` · ${o.label}` : ''
  if (word === 'Approved' || word === 'Rejected') return `${word} by ${o.finalBody}${detail}`
  if (word === 'In progress') return `In progress${detail} · ${o.steps[0].body}`
  return `${word} · ${o.finalBody}` // "Noted, no action"
}

// The date shown under each of the 4 tracker steps.
// Our hand-checked decisions know all their dates. For the others we only know the LATEST vote,
// so only the step that vote belongs to gets a date (we never invent the others).
function trackerDates(item, info) {
  if (item.upcoming) {
    // The board meeting date is on the agenda. The Council date is not set yet, and we don't guess it.
    return [item.staffReportDate ? formatDate(item.staffReportDate) : '', `${formatDate(item.meeting.date)}, ${item.meeting.time}`, 'Date not set yet', '']
  }
  if (item.official) {
    // From the official City page. A body that was given the power to decide has one date: the decision.
    const { date, steps, final } = item.official
    const dates = ['', '', '', final ? formatDate(date) : '']
    for (const st of steps ?? []) dates[st.body.includes('City Council') ? 2 : 1] = formatDate(st.date)
    if (!steps) dates[1] = formatDate(date)
    return dates
  }
  const stages = info?.sections.find((sec) => sec.stages)?.stages
  if (stages) return stages.map((st) => (st.skipped ? '' : st.date))
  const dates = ['', '', '', '']
  const date = formatDate(item.dateISO)
  const steps = getStageSteps(item).steps
  if (item.committee === 'City Council') {
    dates[2] = date
    if (steps[3].state !== 'upcoming') dates[3] = date
  } else if (steps[2].state === 'not-needed') {
    dates[3] = date // a board that decides for itself
  } else {
    dates[1] = date
  }
  return dates
}

// Every document we used, with its date. The official page is always first.
function buildSources(item, ex, info) {
  const official = {
    label: 'Official City of Toronto page',
    url: item.sourceUrl,
    date: item.upcoming
      ? `meeting ${formatDate(item.meeting.date)}`
      : item.official
        ? `${item.official.final ? 'final status' : 'latest step'} ${formatDate(item.official.date)}`
        : `latest vote ${formatDate(item.dateISO)}`,
    itemNumber: item.id,
  }
  if (ex) return [official, ...ex.documents.map((d) => ({ label: d.title, url: d.url, date: d.date }))]
  if (info) return [official, ...info.documents.map((d) => ({ label: d.label, url: d.url, date: '' }))]
  return [official]
}

export default function DecisionPage() {
  const { id } = useParams() // the part of the address after /decision/
  const navigate = useNavigate()
  const { ward } = useResident() // the ward of the address the person searched (if any)
  const item = allItems.find((d) => d.id === id)

  // The ward this decision is in, worked out from its pin. Used when no address was searched.
  const [areaWard, setAreaWard] = useState(null)
  useEffect(() => {
    setAreaWard(null)
    if (item?.lat == null) return
    loadWards()
      .then((wards) => {
        const match = findWardAt(item.lng, item.lat, wards.features)
        setAreaWard(match ? wardSummary(match.properties) : null)
      })
      .catch(() => setAreaWard(null))
  }, [item?.id]) // eslint-disable-line react-hooks/exhaustive-deps

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

  const officialLink = [{ label: 'Official City page', url: item.sourceUrl }]
  // A hand-checked outcome (official-status.json) is the first sentence of "What's happening?".
  // Hand-checked (official-status.json) or written from the official page's Tracking Status text (trackingStatus.js).
  const outcomeText = item.official?.outcome
  const outcome = outcomeText ? [{ text: outcomeText, links: officialLink }] : []
  const happening = [...outcome, ...(ex ? fromExplanation(ex, 'happening') : info ? fromHandChecked(info, 'changing') : [])]
  const why = ex ? fromExplanation(ex, 'why') : info ? fromHandChecked(info, 'why') : []
  const whereWho = ex ? fromExplanation(ex, 'where') : info ? fromHandChecked(info, 'where', 'who') : []
  const conditions = ex ? fromExplanation(ex, 'conditions') : []
  // Process: the staff report step comes from the PDF. For items checked on the official City page, the
  // other steps come from that page (cited "Official City page") and replace the voting-record guess.
  const officialSteps = item.official
    ? (item.official.steps ?? [{ body: item.official.finalBody, date: item.official.date, text: item.official.text }]).map((st) => ({
        step: st.body.includes('City Council') ? 'council' : 'committee',
        date: formatDate(st.date),
        text: st.text,
        links: officialLink,
      }))
    : []
  const processSentences = ex
    ? [...fromExplanation(ex, 'process').filter((st) => !item.official || st.step === 'staff'), ...officialSteps]
    : officialSteps
  // With a full explanation, the say box (our stage logic) answers this. Only the older hand-written text has its own.
  const saySentences = info ? fromHandChecked(info, 'say') : []

  // Our 2 hand-checked decisions have no vote record of their own; both were adopted by City Council.
  const voteItem = item.detailed ? { ...item, committee: 'City Council', result: 'Carried' } : item
  const body = bodyName(voteItem.committee)
  const headerLine = (
    item.upcoming
      ? [`In progress · ${item.meeting.body} meets ${formatDate(item.meeting.date)}`, item.place]
      : [
          item.official ? officialStatusLine(item.official, statusWord(voteItem)) : statusLine(statusWord(voteItem), body),
          formatDate(item.official?.date ?? item.dateISO),
          item.ward?.match(/^Ward \d+/)?.[0], // only when we really know the ward (our 2 hand-checked decisions)
          item.place && `${item.place}${item.approximate ? ' (approximate)' : ''}`,
        ]
  )
    .filter(Boolean)
    .join(' · ')
  const sources = buildSources(item, ex, info)

  return (
    <main className="dp">
      <div className="dp__wrap">
        {/* Came from Explore: go back in history (the Explore page is still there, exactly as it was).
            Otherwise open Explore, which still remembers the last searched address. */}
        <a
          className="decision__back"
          href="/explore"
          onClick={(event) => {
            event.preventDefault()
            if (navTrail.previousPath === '/explore') navigate(-1)
            else navigate('/explore')
          }}
        >
          ← Back to decisions
        </a>

        <header className="dp__header">
          <h1 className="dp__title">{item.title}</h1>
          <p className="dp__meta">{headerLine}</p>
          <OfficialTitle title={item.officialTitle} plain={item.title} />
        </header>

        <Block title="What's happening?">
          {happening.length ? <Sentences sentences={happening} /> : <p className="dp__soon">{COMING_SOON}</p>}
        </Block>

        <Block title="Why?">
          {why.length ? <Sentences sentences={why} /> : <p className="dp__soon">{COMING_SOON}</p>}
        </Block>

        <Block title="Where, and who's affected?">
          {whereWho.length > 0 ? (
            <Sentences sentences={whereWho} />
          ) : (
            <>
              {item.place && (
                <p className="answer">
                  {item.place}
                  {item.approximate && ' (approximate spot)'}
                </p>
              )}
              <p className="dp__soon">Who is affected: coming soon.</p>
            </>
          )}
          {item.lat != null && (
            <p className="answer">
              <Link to={`/explore?focus=${item.id}`}>Show on map</Link>
            </p>
          )}
        </Block>

        {conditions.length > 0 && (
          <Block title="Conditions">
            <Sentences sentences={conditions} bullets />
          </Block>
        )}

        <Block title="Where is it in the process?">
          <StageTracker item={item} dates={trackerDates(item, details[id])} quiet />
          <ProcessSteps sentences={processSentences} />
          {/* With a cited voting-record step above, this line would say the same thing twice. */}
          {processSentences.length === 0 && !item.upcoming && (
            <p className="dp__note">
              Latest recorded vote: {body}, {formatDate(item.dateISO)}
            </p>
          )}
        </Block>

        <Block title="Can I still have a say?">
          {saySentences.length > 0 && <Sentences sentences={saySentences} />}
          {/* Our hand-written answers already say it all; everything else gets the box. */}
          {!info && <SayBox item={item} />}
        </Block>

        {/* Searched an address: their own councillor. Otherwise the councillor for the decision's area.
            City-wide decisions (no location) only get the list of how everyone voted. */}
        <Block title={ward ? 'Your councillor' : areaWard ? 'Councillor for this area' : 'How councillors voted'}>
          {(ward || areaWard) && <YourCouncillor item={voteItem} ward={ward ?? areaWard} />}
          {/* No vote has happened for an upcoming item, so there is no list of votes to show. */}
          {!item.upcoming && <CouncillorVote item={voteItem} full hideWard={Boolean(ward || areaWard)} />}
        </Block>

        <Block title="Sources">
          <ol className="sources">
            {sources.map((src, i) => (
              <li key={src.url}>
                <span className="mono">[{i + 1}]</span>{' '}
                <a href={src.url} target="_blank" rel="noreferrer">
                  {src.label}
                </a>
                {src.itemNumber && (
                  <span className="sources__date">
                    {' '}
                    · Item <span className="mono">{src.itemNumber}</span>
                  </span>
                )}
                {src.date && <span className="sources__date"> · {src.date}</span>}
              </li>
            ))}
          </ol>
        </Block>
      </div>
    </main>
  )
}
