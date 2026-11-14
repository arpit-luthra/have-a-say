// "Your councillor": their vote on this item and an "Email your councillor" button.
// The email opens in the resident's own mail app (a mailto link), so we never see or send it.
import { summariseVote, useVoteData } from '../lib/voteData.js'
import { useResident } from '../lib/ResidentContext.jsx'

const VOTE_WORDS = { Y: 'Voted Yes', N: 'Voted No', A: 'Absent', I: 'Absent' }

function emailLink(councillor, item, ward) {
  const subject = item.title
  const body =
    `Hello Councillor ${councillor.name},\n\n` +
    `I live in Ward ${ward.number}. I am writing about "${item.title}".\n\n` +
    `[Tell your councillor what you think here.]\n\n` +
    `Thank you for your time.`
  return `mailto:${councillor.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

// `ward`: use this ward instead of the resident's own (for "Councillor for this area", the ward of the decision).
export default function YourCouncillor({ item, showVote = true, ward: wardOverride = null }) {
  const resident = useResident()
  const ward = wardOverride ?? resident.ward
  const data = useVoteData()

  if (!ward) return <p>Enter your address to see your councillor.</p>

  const summary = summariseVote(data, item.id, ward.number)
  // No per-person votes for this item: still find the councillor from the full list.
  const councillor = summary?.wardCouncillor ?? data?.councillors.find((p) => p.ward === ward.number)
  if (!councillor) return <p>{data ? `We couldn't match a councillor to Ward ${ward.number}.` : 'Loading…'}</p>

  const vote = summary?.wardVote
  return (
    <div className="councillor">
      <p className="councillor__name">{councillor.name}</p>
      <p className="councillor__ward">Ward {ward.number}</p>
      {showVote && <p>
        {item.upcoming
          ? 'Not voted yet.'
          : vote
          ? VOTE_WORDS[vote.code]
          : summary
            ? 'Not listed in the vote on this item.'
            : "We don't have individual votes for this item."}
      </p>}
      {councillor.email && (
        <a className="councillor__btn" href={emailLink(councillor, item, ward)}>
          Email your councillor
        </a>
      )}
    </div>
  )
}
