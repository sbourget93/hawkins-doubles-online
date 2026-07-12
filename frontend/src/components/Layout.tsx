import { useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import SyncMenu from '../offline/SyncMenu'

/**
 * App shell: a top bar showing the current page's name plus a hamburger button
 * that opens a slide-in navigation drawer. The active page renders into
 * <Outlet />. Add new destinations by adding a <Link> in the drawer, a matching
 * <Route> in App.tsx, and a title case in `pageTitle` below.
 */
export default function Layout() {
  const [menuOpen, setMenuOpen] = useState(false)
  const closeMenu = () => setMenuOpen(false)
  const {
    user,
    loading,
    gisReady,
    renderSignInButton,
    signOut,
    isAdmin,
    isRealAdmin,
    viewAsNonAdmin,
    setViewAsNonAdmin,
  } = useAuth()

  // The app bar doubles as the "you are here" cue, so it reflects the current
  // route: the roster, the list of events, or a single event's detail page.
  const { pathname } = useLocation()
  const pageTitle = pathname.startsWith('/players')
    ? 'Players'
    : pathname.startsWith('/analytics/player-rankings')
      ? 'Player Rankings'
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
        {/* Admin-only header controls, pinned to the right. The view-as toggle
            shows for any real admin (so a preview can always be switched back);
            the sync/offline envelope hides while previewing the non-admin view,
            just as a real non-admin (who never writes) never sees it. */}
        {isRealAdmin && (
          <div className="app-bar-actions">
            {isAdmin && <SyncMenu />}
            <button
              type="button"
              className={`view-as-toggle ${viewAsNonAdmin ? 'view-as-toggle--active' : ''}`}
              aria-pressed={viewAsNonAdmin}
              aria-label={viewAsNonAdmin ? 'Return to admin view' : 'View as non-admin'}
              title={
                viewAsNonAdmin
                  ? 'Viewing as a non-admin — tap to return to admin view'
                  : 'View as a non-admin'
              }
              onClick={() => setViewAsNonAdmin(!viewAsNonAdmin)}
            >
              {/* Eye glyph: an open eye in admin view, a struck-through eye while
                  previewing (admin sight temporarily "off"). */}
              <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                <path
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"
                />
                <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="2" />
                {viewAsNonAdmin && (
                  <path stroke="currentColor" strokeWidth="2" strokeLinecap="round" d="M3 3l18 18" />
                )}
              </svg>
            </button>
          </div>
        )}
      </header>

      {/* Slide-in navigation drawer */}
      <nav className={`drawer ${menuOpen ? 'drawer--open' : ''}`}>
        <Link to="/players" className="drawer-link" onClick={closeMenu}>
          Players
        </Link>
        <Link to="/" className="drawer-link" onClick={closeMenu}>
          League Events
        </Link>

        <span className="drawer-section">Analytics</span>
        <Link
          to="/analytics/player-rankings"
          className="drawer-link"
          onClick={closeMenu}
        >
          Player Rankings
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
