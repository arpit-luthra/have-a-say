// "Have your say": the decisions that are still open for comments, and three simple ways to be heard.
// The open items come from upcoming-items.json (read by allItems.js). We never guess a deadline:
// every button goes to the City's own page or form.
import { allItems } from '../lib/allItems.js'
import { formatDate } from '../lib/formatDate.js'
import DecisionCard from '../components/DecisionCard.jsx'
import upcomingData from '../data/upcoming-items.json'
import './Info.css'

const open = allItems.filter((d) => d.upcoming)
const { meeting } = upcomingData

export default function HaveYourSay() {
  return (
    <main className="info">
      <div className="info__wrap">
        <h1 className="info__title">Have your say</h1>
        <p className="info__intro">
          These decisions have not been voted on yet, so you can still tell the City what you think.
        </p>

        <section className="info__block">
          <h2 className="info__heading">Open for comments</h2>
          <p>
            The {meeting.body} meets on {formatDate(meeting.date)} at {meeting.time} ({meeting.location.includes('Video') ? 'City Hall or video' : meeting.location}).
            Check each official page for the exact deadline.
          </p>
          <ul className="info__cards">
            {open.map((d) => (
              <li key={d.id}>
                <DecisionCard decision={d} />
              </li>
            ))}
          </ul>
          <p className="info__small">
            Meeting agenda:{' '}
            <a href={meeting.agendaUrl} target="_blank" rel="noreferrer">
              City of Toronto
            </a>
          </p>
        </section>

        <section className="info__block">
          <h2 className="info__heading">3 ways to have a say</h2>
          <ol className="ways">
            <li>
              <p className="ways__title">1. Send a comment</p>
              <p>Write to the committee before the meeting. Your comment becomes part of the public record.</p>
            </li>
            <li>
              <p className="ways__title">2. Ask to speak</p>
              <p>You can ask to speak at the meeting, in person or by video.</p>
            </li>
            <li>
              <p className="ways__title">3. Email your councillor</p>
              <p>Open any decision, and under "Councillor for this area" you will find an email button that starts a message for you.</p>
            </li>
          </ol>
          <p className="info__small">Each decision above has its own “Submit a comment” and “Ask to speak” buttons on its page.</p>
        </section>
      </div>
    </main>
  )
}
