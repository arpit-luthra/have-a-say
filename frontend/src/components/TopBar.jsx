// Thin white bar at the top of every page: name on the left, menu on the right.
import { NavLink } from 'react-router-dom'
import './TopBar.css'

const MENU = [
  { to: '/explore', label: 'Explore' },
  { to: '/have-your-say', label: 'Have your say' },
  { to: '/how-it-works', label: 'How council works' },
  { to: '/about', label: 'About & sources' },
]

export default function TopBar() {
  return (
    <header className="topbar">
      <NavLink className="topbar__logo" to="/" aria-label="Heads Up, home">
        {/* Logo: a map pin with a small speech-bubble dot inside, in brand teal. */}
        <svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true">
          <path
            d="M16 2C9.9 2 5 6.7 5 12.7c0 7.6 9.2 16.2 10.1 17a1.3 1.3 0 0 0 1.8 0C17.8 28.9 27 20.3 27 12.7 27 6.7 22.1 2 16 2z"
            fill="currentColor"
          />
          <path d="M10.5 8.5h11a1.5 1.5 0 0 1 1.5 1.5v5a1.5 1.5 0 0 1-1.5 1.5H17l-3 2.5V16.5h-3.5A1.5 1.5 0 0 1 9 15v-5a1.5 1.5 0 0 1 1.5-1.5z" fill="#fff" />
        </svg>
        <span>Heads Up</span>
      </NavLink>
      <nav className="topbar__menu" aria-label="Main">
        {MENU.map((item) => (
          <NavLink key={item.to} to={item.to} className="topbar__link">
            {item.label}
          </NavLink>
        ))}
      </nav>
    </header>
  )
}
