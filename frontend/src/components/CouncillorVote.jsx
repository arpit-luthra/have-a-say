// "How your councillor voted". Two sizes: one short line (list cards) or a full section.
// Plain text only: no colours for Yes / No, no judgment.
import { summariseVote, useVoteData } from '../lib/voteData.js'
import { bodyName } from '../lib/voteWords.js'
import { useResident } from '../lib/ResidentContext.jsx'
import './CouncillorVote.css'

export const TERM_NOTE =
  'A new council term starts Nov 15, 2026. Votes were cast by the councillors in office at the time.'

/** The sentence about the resident's own councillor. `null` if there is nothing to say. */
function wardSentence(ward, summary) {
  if (!ward) return 'Search your address to see how your councillor voted.'
  if (!summary.wardCouncillor) return `We couldn't match a councillor to Ward ${ward.number}.`
  const { name } = summary.wardCouncillor
  if (!summary.wardVote) return `Ward ${ward.number}'s councillor, ${name}, isn't listed in this vote.`
  const { code, label } = summary.wardVote
  const action = code === 'Y' || code === 'N' ? `voted ${label}.` : `was ${label.toLowerCase()}.`
  return `Ward ${ward.number}'s councillor at the time, ${name}, ${action}`
}

export default function CouncillorVote({ item, full = false, hideWard = false }) {
  const { ward } = useResident()
  const data = useVoteData()
  const summary = summariseVote(data, item.id, ward?.number)

  if (!full) {
    // List card: one short line. Nothing at all if this item has no per-person votes.
    if (!summary) return null
    return <p className="votes__line">{wardSentence(ward, summary)}</p>
  }

  const body = bodyName(item.committee)
  return (
    <>
      {!summary ? (
        hideWard ? null : <p>
          {data
            ? "Individual votes for this item aren't in the open data."
            : 'Loading votes…'}
        </p>
      ) : (
        <>
          {!hideWard && <p>{wardSentence(ward, summary)}</p>}
          <details className="votes__all">
            <summary>See how all councillors voted</summary>
            <p>
              {body} overall: {summary.yes} Yes, {summary.no} No, {summary.absent} Absent.
            </p>
            <ul>
              {summary.voters.map((p) => (
                <li key={p.name}>
                  <span>
                    {p.role === 'Mayor' ? 'Mayor' : p.ward ? `Ward ${p.ward}` : 'Ward not matched'} · {p.name}
                  </span>
                  <span>{p.label}</span>
                </li>
              ))}
            </ul>
          </details>
        </>
      )}
      <p className="row__note">{TERM_NOTE}</p>
    </>
  )
}
