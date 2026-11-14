// The bar at the top of every page: the icon logo and "Heads Up" on the left, the menu on the right.
// It floats over the page; once the page has scrolled, it turns slightly see-through with a soft blur.
import { NavLink } from 'react-router-dom'
import './TopBar.css'

const MENU = [
  { to: '/explore', label: 'Explore' },
  { to: '/have-your-say', label: 'Have Your Say' },
  { to: '/how-it-works', label: 'How Council Works' },
  { to: '/about', label: 'About & Sources' },
]

export default function TopBar({ scrolled = false }) {
  return (
    <header className={`topbar${scrolled ? ' topbar--scrolled' : ''}`}>
      <NavLink className="topbar__logo" to="/" aria-label="Heads Up, home">
        <img src="/logo-icon-256.png" width="40" height="40" alt="" />
        <span className="topbar__name">
          <span className="topbar__heads">Heads</span> <span className="topbar__up">Up</span>
        </span>
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
