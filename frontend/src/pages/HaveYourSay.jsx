// "Have your say": upcoming council and committee meetings, from the City's open schedule data.
// (Per-decision comment deadlines will be added once we can read them from official item pages.)
import meetingData from '../data/upcoming-meetings.json'
import { formatDate } from '../lib/formatDate.js'
import './HaveYourSay.css'

const OFFICIAL_CALENDAR = 'https://www.toronto.ca/city-government/council/council-committee-meetings/'

export default function HaveYourSay() {
  const { meetings, lastScheduledDate, generatedAt } = meetingData

  return (
    <main className="say">
      <h1 className="say__title">Have your say</h1>
      <p className="say__intro">
        Residents can email a committee or ask to speak at a meeting. Meetings are the moments
        when decisions get made, so this is where to start.
      </p>

      <h2 className="say__heading">Upcoming meetings</h2>

      {meetings.length === 0 ? (
        <p className="say__empty">
          The City's open schedule data has no meetings after{' '}
          <span className="mono">{formatDate(lastScheduledDate)}</span>. The 2022–2026 council term
          has ended and the next schedule isn't published there yet. Check the{' '}
          <a href={OFFICIAL_CALENDAR} target="_blank" rel="noreferrer">
            official meeting calendar
          </a>
          .
        </p>
      ) : (
        <ul className="say__list">
          {meetings.map((m) => (
            <li className="say__meeting" key={m.dateISO + m.committee + m.meetingNumber}>
              <span className="say__date mono">{formatDate(m.dateISO)}</span>
              <span>
                <strong>{m.committee}</strong>
                <span className="say__detail">
                  {m.startTime} · {m.location}
                </span>
              </span>
              <a href={m.url} target="_blank" rel="noreferrer">
                Meeting calendar
              </a>
            </li>
          ))}
        </ul>
      )}

      <p className="say__source">
        Source: Toronto Open Data, City Council and Committees Meeting Schedule Reports. Updated{' '}
        <span className="mono">{generatedAt.slice(0, 10)}</span>.
      </p>
    </main>
  )
}
