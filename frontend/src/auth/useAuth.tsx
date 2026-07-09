import { createContext, useContext, type ReactNode } from 'react'

/**
 * Placeholder authentication layer.
 *
 * There is NO login or backend auth yet. Every visitor is currently treated as
 * an anonymous normal user. This module exists so the rest of the app can be
 * written against a stable `useAuth()` contract now, and gain real roles later
 * without touching consumers.
 *
 * When real auth is added, this is the ONE place to change: replace the
 * hardcoded role in AuthProvider with state derived from a login/session, and
 * everything already calling `useAuth()` (e.g. the Players page) reacts
 * automatically.
 */

export type Role = 'user' | 'admin'

export interface AuthState {
  role: Role
  /** Convenience flag so components can branch without repeating the comparison. */
  isAdmin: boolean
}

const AuthContext = createContext<AuthState | undefined>(undefined)

// TODO(auth): derive from a real authenticated session once logins exist. To
// locally preview the admin experience in the meantime, return 'admin' here.
function currentRole(): Role {
  return 'admin'
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const role = currentRole()
  const value: AuthState = { role, isAdmin: role === 'admin' }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (ctx === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return ctx
}
