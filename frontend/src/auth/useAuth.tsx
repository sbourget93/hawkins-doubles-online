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
 * Role is still hardcoded to `admin` for everyone — login is currently
 * COSMETIC and does not gate anything, so existing `isAdmin` consumers are
 * unchanged. On top of that, this provider tracks the signed-in Google identity
 * (`user`) via a backend session cookie and exposes the drawer's sign-in button
 * + sign-out. When real role-gating lands, derive `role`/`isAdmin` from
 * `user?.is_admin` here — the one place consumers read from.
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
  /** Convenience flag so components can branch without repeating the comparison. */
  isAdmin: boolean
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

// Latest credential handler; the singleton GIS callback always calls through
// this so it stays bound to the current provider's state setters.
let onCredential: ((credential: string) => void) | null = null

// Runs the whole GIS bootstrap exactly once. Resolves to whether login is
// configured (client id present + script loaded).
let gisSetup: Promise<boolean> | null = null
function ensureGis(): Promise<boolean> {
  if (gisSetup) return gisSetup
  gisSetup = (async () => {
    const cfg = await (await fetch('/api/auth/config')).json()
    if (!cfg.google_client_id) return false // login not configured (no .env)
    await new Promise<void>((resolve, reject) => {
      const s = document.createElement('script')
      s.src = GIS_SRC
      s.async = true
      s.defer = true
      s.onload = () => resolve()
      s.onerror = () => reject(new Error('Failed to load Google Identity Services'))
      document.head.appendChild(s)
    })
    if (!window.google) return false
    window.google.accounts.id.initialize({
      client_id: cfg.google_client_id,
      callback: (resp: { credential: string }) => onCredential?.(resp.credential),
    })
    return true
  })().catch(() => false)
  return gisSetup
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<GoogleUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [gisReady, setGisReady] = useState(false)

  const refreshMe = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me')
      const data = await res.json()
      setUser(data.user ?? null)
    } catch {
      setUser(null)
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
    ensureGis().then((ok) => {
      if (alive) setGisReady(ok)
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
    }
  }, [])

  const value: AuthState = {
    role: 'admin',
    isAdmin: true,
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
