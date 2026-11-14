// App decides which page to show, based on the web address.
// The top bar is shown on every page; the page fills the space under it.
import { useEffect, useRef } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import TopBar from './components/TopBar.jsx'
import Landing from './pages/Landing.jsx'
import Home from './pages/Home.jsx'
import DecisionPage from './pages/DecisionPage.jsx'
import HaveYourSay from './pages/HaveYourSay.jsx'
import Placeholder from './pages/Placeholder.jsx'
import { ResidentProvider } from './lib/ResidentContext.jsx'
import { navTrail } from './lib/navTrail.js'

// The Explore page stays mounted (just hidden) once it has been opened. That way, coming back from a
// decision page finds the same address, filters, map position and scroll position, with nothing to save or restore.
const HIDDEN = { position: 'absolute', inset: 0, visibility: 'hidden', pointerEvents: 'none' }

export default function App() {
  const { pathname } = useLocation()
  const everOpenedExplore = useRef(false)
  if (pathname === '/explore') everOpenedExplore.current = true

  // Remember the previous page (used by the Back button on the decision page).
  const lastPath = useRef(pathname)
  useEffect(() => {
    if (lastPath.current !== pathname) {
      navTrail.previousPath = lastPath.current
      lastPath.current = pathname
    }
  }, [pathname])

  return (
    <ResidentProvider>
    <div className="app">
      <TopBar />
      <div className="app__page">
        {everOpenedExplore.current && (
          <div style={pathname === '/explore' ? { height: '100%' } : HIDDEN} aria-hidden={pathname !== '/explore'}>
            <Home />
          </div>
        )}
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/explore" element={null} />
          <Route path="/decision/:id" element={<DecisionPage />} />
          <Route path="/have-your-say" element={<HaveYourSay />} />
          <Route path="/how-it-works" element={<Placeholder title="How council works" />} />
          <Route path="/about" element={<Placeholder title="About & sources" />} />
        </Routes>
      </div>
    </div>
    </ResidentProvider>
  )
}
