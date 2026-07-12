import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'

/**
 * Authentication layer.
 *
 * `isAdmin` (and `role`) is derived from the signed-in Google identity: a
 * visitor is an admin iff their session user carries `is_admin` (set by the
 * backend `ADMIN_EMAILS` allowlist). Every mutation control in the app hides
 * behind `isAdmin`, and the backend independently gates `POST /commands` on it —
 * this hook is the single place consumers read the role from.
 *
 * Dev bypass: when login is not configured (`/auth/config` returns no client id,
 * i.e. local dev with no Google set up) there is no way to sign in, so everyone
 * is treated as admin. This mirrors the backend's `require_admin` bypass.
 *
 * The provider also tracks the signed-in identity (`user`) via a backend session
 * cookie and exposes the drawer's sign-in button + sign-out.
 *
 * Offline: the last-known identity is cached in localStorage so the PWA still
 * treats the visitor as admin in Airplane mode / spotty course wifi. A reachable
 * server is always authoritative (a signed-out response clears the cache); only a
 * network failure falls back to the cache. This is UX only — the backend re-gates
 * `POST /commands`, so a stale cache at worst enqueues commands that get rejected
 * on sync and land in the dead-letter list.
 *
 * Google Identity Services (GIS) is bootstrapped ONCE via a module-level
 * singleton so React StrictMode's double-invoked effects can't register the
 * callback twice or render duplicate buttons.
 */

export type Role = 'user' | 'admin'

export interface GoogleUser {
  email: string
  name: string
  picture?: string | null
  is_admin: boolean
}

export interface AuthState {
  role: Role
  /**
   * Effective admin flag every mutation control branches on. True only when the
   * visitor is really an admin AND is not previewing the non-admin view.
   */
  isAdmin: boolean
  /**
   * Whether the visitor is genuinely an admin, ignoring the preview toggle. Used
   * only to decide whether to show the admin-only header controls (the sync
   * envelope + the view-as toggle itself); everything else keys off `isAdmin`.
   */
  isRealAdmin: boolean
  /** True while a real admin is previewing the app as a non-admin would see it. */
  viewAsNonAdmin: boolean
  /** Toggle the non-admin preview (no-op for non-admins). */
  setViewAsNonAdmin: (value: boolean) => void
  /** The signed-in Google identity, or null when logged out. */
  user: GoogleUser | null
  /** True until the initial `/auth/me` check resolves. */
  loading: boolean
  /** True once GIS is initialized and a sign-in button can be rendered. */
  gisReady: boolean
  /** Renders Google's official button into `el` (no-op until `gisReady`). */
  renderSignInButton: (el: HTMLElement | null) => void
  signOut: () => Promise<void>
}

// Google Identity Services attaches itself to window.google at runtime.
declare global {
  interface Window {
    google?: any
  }
}

const GIS_SRC = 'https://accounts.google.com/gsi/client'

const AuthContext = createContext<AuthState | undefined>(undefined)

// Last-known signed-in identity, cached so the PWA still knows the visitor is an
// admin when offline (Airplane mode / spotty course wifi). This is UX only — the
// backend re-gates `POST /commands`, so a stale cache at worst shows enabled
// controls whose commands get rejected on sync (dead-letter path handles that).
const AUTH_CACHE_KEY = 'auth.user'

function readCachedUser(): GoogleUser | null {
  try {
    const raw = localStorage.getItem(AUTH_CACHE_KEY)
    return raw ? (JSON.parse(raw) as GoogleUser) : null
  } catch {
    return null
  }
}

function writeCachedUser(user: GoogleUser | null) {
  try {
    if (user) localStorage.setItem(AUTH_CACHE_KEY, JSON.stringify(user))
    else localStorage.removeItem(AUTH_CACHE_KEY)
  } catch {
    // localStorage unavailable (private mode / quota) — offline admin just won't persist.
  }
}

// Latest credential handler; the singleton GIS callback always calls through
// this so it stays bound to the current provider's state setters.
let onCredential: ((credential: string) => void) | null = null

/**
 * Result of the one-time GIS bootstrap:
 * - `configured`: a Google client id is set, so login is enabled (no client id
 *   means local dev — the frontend/backend both bypass role-gating).
 * - `ready`: GIS also loaded and initialized, so a sign-in button can render.
 * On an unexpected error we fail closed (`configured: true`) so a transient
 * hiccup never silently grants admin.
 */
let gisSetup: Promise<{ configured: boolean; ready: boolean }> | null = null
function ensureGis(): Promise<{ configured: boolean; ready: boolean }> {
  if (gisSetup) return gisSetup
  gisSetup = (async () => {
    const cfg = await (await fetch('/api/auth/config')).json()
    if (!cfg.google_client_id) return { configured: false, ready: false } // no .env
    await new Promise<void>((resolve, reject) => {
      const s = document.createElement('script')
      s.src = GIS_SRC
      s.async = true
      s.defer = true
      s.onload = () => resolve()
      s.onerror = () => reject(new Error('Failed to load Google Identity Services'))
      document.head.appendChild(s)
    })
    if (!window.google) return { configured: true, ready: false }
    window.google.accounts.id.initialize({
      client_id: cfg.google_client_id,
      callback: (resp: { credential: string }) => onCredential?.(resp.credential),
    })
    return { configured: true, ready: true }
  })().catch(() => ({ configured: true, ready: false }))
  return gisSetup
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // Seed from the cached identity so an offline cold start (PWA relaunch in
  // Airplane mode) renders admin UI immediately instead of flashing read-only.
  const [user, setUser] = useState<GoogleUser | null>(readCachedUser)
  const [loading, setLoading] = useState(true)
  const [gisReady, setGisReady] = useState(false)
  // Whether Google login is configured. `null` until `/auth/config` resolves;
  // `false` means local dev (no client id) → dev-admin bypass.
  const [loginConfigured, setLoginConfigured] = useState<boolean | null>(null)
  // A real admin can preview the app as a non-admin sees it. In-memory only, so
  // it resets to the admin view on reload — a preview, never a persisted role.
  const [viewAsNonAdmin, setViewAsNonAdmin] = useState(false)

  const refreshMe = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me')
      // Reached the server → authoritative. A successful response with no user
      // means the session genuinely ended (sign-out / expiry), so drop the cache.
      const data = await res.json()
      const next = (data.user ?? null) as GoogleUser | null
      setUser(next)
      writeCachedUser(next)
    } catch {
      // Network failure (offline) — trust the last-known identity rather than
      // dropping to read-only. Don't clear the cache; we never reached the server.
      setUser(readCachedUser())
    }
  }, [])

  // Keep the singleton GIS callback pointed at the current refreshMe.
  useEffect(() => {
    onCredential = async (credential: string) => {
      await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential }),
      })
      await refreshMe()
    }
    return () => {
      onCredential = null
    }
  }, [refreshMe])

  useEffect(() => {
    let alive = true
    refreshMe().finally(() => {
      if (alive) setLoading(false)
    })
    ensureGis().then(({ configured, ready }) => {
      if (!alive) return
      setLoginConfigured(configured)
      setGisReady(ready)
    })
    return () => {
      alive = false
    }
  }, [refreshMe])

  // Ref callback: React re-invokes it when `gisReady` flips (the callback's
  // identity changes), so the button renders as soon as GIS is up.
  const renderSignInButton = useCallback(
    (el: HTMLElement | null) => {
      if (!el || !gisReady || !window.google) return
      el.innerHTML = ''
      window.google.accounts.id.renderButton(el, {
        theme: 'outline',
        size: 'large',
        text: 'signin_with',
        shape: 'pill',
        width: 220,
      })
    },
    [gisReady],
  )

  const signOut = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } finally {
      window.google?.accounts?.id?.disableAutoSelect?.()
      setUser(null)
      writeCachedUser(null)
    }
  }, [])

  // Real admin iff login is unconfigured (dev bypass) or the signed-in user is on
  // the backend allowlist. `null` (config still loading) is treated as not-admin,
  // so controls stay hidden until we know — never flashing then hiding.
  const isRealAdmin = loginConfigured === false || !!user?.is_admin
  // Effective admin: what mutation controls key off. A real admin previewing the
  // non-admin view is treated as a non-admin for gating purposes.
  const isAdmin = isRealAdmin && !viewAsNonAdmin

  // If the visitor stops being a real admin (sign-out / session change) while a
  // preview is active, drop back to the plain view so the flag can't get stuck.
  useEffect(() => {
    if (!isRealAdmin && viewAsNonAdmin) setViewAsNonAdmin(false)
  }, [isRealAdmin, viewAsNonAdmin])

  const value: AuthState = {
    role: isAdmin ? 'admin' : 'user',
    isAdmin,
    isRealAdmin,
    viewAsNonAdmin,
    setViewAsNonAdmin,
    user,
    loading,
    gisReady,
    renderSignInButton,
    signOut,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (ctx === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return ctx
}
