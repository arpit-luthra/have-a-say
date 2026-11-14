// "About & sources": where the information comes from, how the explanations are made, and what it can't do.
import './Info.css'

const link = (url, label) => (
  <a href={url} target="_blank" rel="noreferrer">
    {label}
  </a>
)

export default function About() {
  return (
    <main className="info">
      <div className="info__wrap">
        <h1 className="info__title">About & sources</h1>
        <p className="info__intro">Heads Up helps you understand what Toronto is deciding near you, and how to have a say.</p>

        <section className="info__block">
          <h2 className="info__heading">Where the information comes from</h2>
          <ul className="info__list">
            <li>{link('https://open.toronto.ca/dataset/members-of-toronto-city-council-voting-record/', 'Toronto Open Data: Members of Toronto City Council voting record')}. Which items were voted on, by whom, and when.</li>
            <li>{link('https://secure.toronto.ca/council/', 'City of Toronto agenda pages')} and the official reports (PDFs) linked from them. Every explanation links back to these.</li>
            <li>{link('https://open.toronto.ca/dataset/city-wards/', 'Toronto Open Data: City Wards')}. To find which ward and councillor an address belongs to.</li>
            <li>{link('https://www.openstreetmap.org/copyright', 'OpenStreetMap')} for the map data and address search (© OpenStreetMap contributors).</li>
            <li>{link('https://openfreemap.org/', 'OpenFreeMap')} for the map tiles, made from {link('https://openmaptiles.org/', 'OpenMapTiles')} data.</li>
            <li>{link('https://maplibre.org/', 'MapLibre GL JS')} to draw the map.</li>
          </ul>
        </section>

        <section className="info__block">
          <h2 className="info__heading">How the explanations are made</h2>
          <p>
            An AI drafts each explanation from the official report. Every sentence points to the page it came from, so you can
            check it. We then check the drafts ourselves. Where something isn't clear, we say so instead of guessing.
          </p>
          <p>
            Where a decision is in the process comes from the City's own records, not from the AI.
          </p>
        </section>

        <section className="info__block">
          <h2 className="info__heading">What it can't do</h2>
          <ul className="info__list">
            <li>The voting record is incomplete. It only shows the latest vote on an item.</li>
            <li>Some statuses are unclear. When we are not sure, we say "Status unclear" and link to the official page.</li>
            <li>Not every decision has a full explanation yet. Those say "Coming soon".</li>
            <li>Deadlines are never guessed. The official page has the real one.</li>
          </ul>
        </section>

        <section className="info__block">
          <h2 className="info__heading">Privacy</h2>
          <p>
            Your address is never saved. It is used once to find what is near you and which ward you live in, and it only
            stays in your browser while the page is open. We have no accounts and no sign-up.
          </p>
        </section>

        <section className="info__block">
          <h2 className="info__heading">Photo credit</h2>
          <p>
            Start page photo: {link('https://commons.wikimedia.org/wiki/File:Quiet_residential_street,_Toronto_(44892326332).jpg', '"Quiet residential street, Toronto"')} by Enoch
            Leung from Canada, licensed {link('https://creativecommons.org/licenses/by-sa/2.0/', 'CC BY-SA 2.0')}, via Wikimedia Commons. Cropped and resized.
          </p>
        </section>
      </div>
    </main>
  )
}
