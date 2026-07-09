import { useState } from 'react'
import { Link, Outlet } from 'react-router-dom'

/**
 * App shell: a top bar with a hamburger button that opens a slide-in navigation
 * drawer. The active page renders into <Outlet />. Add new destinations by
 * adding a <Link> in the drawer and a matching <Route> in App.tsx.
 */
export default function Layout() {
  const [menuOpen, setMenuOpen] = useState(false)
  const closeMenu = () => setMenuOpen(false)

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
        <Link to="/" className="app-title">
          Hawkins Doubles
        </Link>
      </header>

      {/* Slide-in navigation drawer */}
      <nav className={`drawer ${menuOpen ? 'drawer--open' : ''}`}>
        <Link to="/" className="drawer-link" onClick={closeMenu}>
          League Events
        </Link>
        <Link to="/players" className="drawer-link" onClick={closeMenu}>
          Players
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
