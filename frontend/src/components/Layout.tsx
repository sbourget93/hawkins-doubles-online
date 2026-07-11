import { useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'

/**
 * App shell: a top bar showing the current page's name plus a hamburger button
 * that opens a slide-in navigation drawer. The active page renders into
 * <Outlet />. Add new destinations by adding a <Link> in the drawer, a matching
 * <Route> in App.tsx, and a title case in `pageTitle` below.
 */
export default function Layout() {
  const [menuOpen, setMenuOpen] = useState(false)
  const closeMenu = () => setMenuOpen(false)

  // The app bar doubles as the "you are here" cue, so it reflects the current
  // route: the roster, the list of events, or a single event's detail page.
  const { pathname } = useLocation()
  const pageTitle = pathname.startsWith('/players')
    ? 'Players'
    : pathname.startsWith('/league-events/')
      ? 'League Details'
      : 'League Events'

  return (
    <div className="app-shell">
      <header className="app-bar">
        <button
          type="button"
          className="menu-button"
          aria-label="Open menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(true)}
        >
          {/* Three-bar hamburger icon */}
          <span className="menu-icon" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </button>
        <h1 className="app-title">{pageTitle}</h1>
      </header>

      {/* Slide-in navigation drawer */}
      <nav className={`drawer ${menuOpen ? 'drawer--open' : ''}`}>
        <Link to="/players" className="drawer-link" onClick={closeMenu}>
          Players
        </Link>
        <Link to="/" className="drawer-link" onClick={closeMenu}>
          League Events
        </Link>
      </nav>

      {/* Tapping the backdrop closes the drawer */}
      {menuOpen && <div className="backdrop" onClick={closeMenu} />}

      <main className="app-content">
        <Outlet />
      </main>
    </div>
  )
}
