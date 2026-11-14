// A clean one-page flyer (US Letter, black and white friendly) for a decision that has a full explanation.
// It opens in its own tab. "Print" uses the browser's own print dialog, so no PDF library is needed.
// The QR code points at THIS site's page for the decision, using the address the site is running on right now,
// so it works as soon as the site is live.
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import QRCode from 'qrcode'
import { allItems } from '../lib/allItems.js'
import explanations from '../data/explanations.json'
import { formatDate } from '../lib/formatDate.js'
import { flyerHappening, flyerSay, flyerSourceDate, flyerStatus } from '../lib/flyerText.js'
import './FlyerPage.css'

export default function FlyerPage() {
  const { id } = useParams()
  const item = allItems.find((d) => d.id === id)
  const ex = explanations[id]
  const [qr, setQr] = useState(null)

  const pageUrl = `${window.location.origin}/decision/${id}` // the site's own address, so it works once we are live
  useEffect(() => {
    // Plain black on white, with a quiet zone, so it scans well even from a photocopy.
    QRCode.toDataURL(pageUrl, { margin: 2, width: 400, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } })
      .then(setQr)
      .catch(() => setQr(null))
  }, [pageUrl])

  if (!item || !ex) {
    return (
      <main className="flyer-screen">
        <p>A flyer is only available for decisions that have a full explanation.</p>
        <Link to={`/decision/${id}`}>← Back to the decision</Link>
      </main>
    )
  }

  const happening = flyerHappening(item, ex)
  const say = flyerSay(item)

  return (
    <main className="flyer-screen">
      <div className="flyer__bar">
        <Link to={`/decision/${id}`}>← Back to the decision</Link>
        <button type="button" className="flyer__print" onClick={() => window.print()}>
          Print this flyer
        </button>
      </div>

      <article className="flyer">
        <p className="flyer__brand">Heads Up · What Toronto is deciding near you</p>
        <h1 className="flyer__title">{item.title}</h1>
        {item.place && (
          <p className="flyer__address">
            {item.place}
            {item.approximate ? ' (approximate spot)' : ''}
          </p>
        )}

        <section>
          <h2>What's happening?</h2>
          {happening.map((text) => (
            <p key={text}>{text}</p>
          ))}
        </section>

        <section>
          <h2>Where it stands</h2>
          <p>{flyerStatus(item)}</p>
          {item.upcoming && (
            <p>
              <strong>Meeting:</strong> {item.meeting.body}, {formatDate(item.meeting.date)}, {item.meeting.time}. {item.meeting.location}.
            </p>
          )}
        </section>

        <section>
          <h2>How to have a say</h2>
          <p>
            <strong>{say.headline}</strong> {say.text}
          </p>
          <p className="flyer__small">Official page: {item.sourceUrl.replace('https://', '')}</p>
        </section>

        <section className="flyer__qr">
          {qr && <img src={qr} alt="QR code linking to this decision on Heads Up" width="150" height="150" />}
          <p>
            <strong>Scan to read the full explanation</strong>
            <br />
            <span className="flyer__small">{pageUrl.replace(/^https?:\/\//, '')}</span>
          </p>
        </section>

        <footer className="flyer__footer">
          Source: City of Toronto, {flyerSourceDate(item)}. Check the official page for the final word.
        </footer>
      </article>
    </main>
  )
}
