// "How council works": the path a decision takes, in plain words.
import './Info.css'

const STEPS = [
  { name: 'Staff report', text: 'City staff study an idea and write a report. It says what they recommend.' },
  {
    name: 'Committee or community council',
    text: 'A smaller group of councillors reads the report, hears from the public, and votes. A community council covers one part of the city.',
  },
  { name: 'City Council', text: 'All the councillors vote. Some items skip the committee step and go straight here.' },
  { name: 'Decided', text: 'The vote is the decision. Some groups, like a community council, are given the power to decide certain things themselves.' },
]

export default function HowItWorks() {
  return (
    <main className="info">
      <div className="info__wrap">
        <h1 className="info__title">How council works</h1>
        <p className="info__intro">Most decisions follow the same path. Here it is in four steps.</p>

        <section className="info__block">
          <h2 className="info__heading">The path of a decision</h2>
          <ol className="flow">
            {STEPS.map((step, i) => (
              <li className="flow__step" key={step.name}>
                <span className="flow__num" aria-hidden="true">
                  {i + 1}
                </span>
                <p className="flow__name">{step.name}</p>
                <p className="flow__text">{step.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="info__block">
          <h2 className="info__heading">When can you speak up?</h2>
          <p>
            The best time is before the vote, at the committee or community council. You can send a written comment, or ask to
            speak at the meeting. You can also email your councillor at any time.
          </p>
          <p>
            Each decision's official page has the forms and the exact deadline. We never guess a deadline, because it is not
            the same as the meeting date.
          </p>
        </section>
      </div>
    </main>
  )
}
