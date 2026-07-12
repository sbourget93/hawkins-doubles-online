import { useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'

/**
 * App shell: a top bar showing the current page's name plus a hamburger button
 * that opens a slide-in navigation drawer. The active page renders into
 * <Outlet />. Add new destinations by adding a <Link> in the drawer, a matching
 * <Route> in App.tsx, and a title case in `pageTitle` below.
 */
export default function Layout() {
  const [menuOpen, setMenuOpen] = useState(false)
  const closeMenu = () => setMenuOpen(false)
  const { user, loading, gisReady, renderSignInButton, signOut } = useAuth()

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

        {/* Login / logout pinned to the bottom of the drawer. */}
        <div className="drawer-auth">
          {/* The keys are load-bearing: GIS injects button DOM React doesn't
              track into .drawer-signin, and without keys React reuses that
              same <div> for .drawer-user when the branches swap, leaving the
              Google button behind. Distinct keys force a fresh node. */}
          {loading ? null : user ? (
            <>
              <div key="user" className="drawer-user">
                {user.picture && (
                  <img className="drawer-avatar" src={user.picture} alt="" />
                )}
                <span className="drawer-user-lines">
                  <span className="drawer-user-label">Signed in as</span>
                  <span className="drawer-user-name">{user.name}</span>
                </span>
              </div>
              <button type="button" className="drawer-logout" onClick={signOut}>
                Log out
              </button>
            </>
          ) : gisReady ? (
            // Google renders its official button into this container.
            <div key="signin" className="drawer-signin" ref={renderSignInButton} />
          ) : null}
        </div>
      </nav>

      {/* Tapping the backdrop closes the drawer */}
      {menuOpen && <div className="backdrop" onClick={closeMenu} />}

      <main className="app-content">
        <Outlet />
      </main>
    </div>
  )
}
