// App decides which page to show, based on the web address.
// The top bar is shown on every page; the page fills the space under it.
import { Route, Routes } from 'react-router-dom'
import TopBar from './components/TopBar.jsx'
import Home from './pages/Home.jsx'
import DecisionPage from './pages/DecisionPage.jsx'
import Placeholder from './pages/Placeholder.jsx'

export default function App() {
  return (
    <div className="app">
      <TopBar />
      <div className="app__page">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/decision/:id" element={<DecisionPage />} />
          <Route path="/have-your-say" element={<Placeholder title="Have your say" />} />
          <Route path="/how-it-works" element={<Placeholder title="How council works" />} />
          <Route path="/about" element={<Placeholder title="About & sources" />} />
        </Routes>
      </div>
    </div>
  )
}
