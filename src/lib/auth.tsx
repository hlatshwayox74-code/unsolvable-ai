import {
  acceptInvite as idAcceptInvite, getUser, handleAuthCallback, login as idLogin, logout as idLogout, onAuthChange,
  requestPasswordRecovery, signup as idSignup, type User,
} from "@netlify/identity"
import { createContext, useContext, useEffect, useState, type ReactNode } from "react"

interface AuthState {
  user: User | null
  ready: boolean
  notice: string | null
  login(email: string, password: string): Promise<void>
  signup(email: string, password: string, name: string): Promise<"signed-in" | "confirm-email">
  logout(): Promise<void>
  recover(email: string): Promise<void>
  /** Set when the visitor arrived from an invite email and still needs to choose a password. */
  inviteToken: string | null
  acceptInvite(password: string): Promise<void>
}

const Ctx = createContext<AuthState | null>(null)

function friendly(e: unknown): Error {
  const msg = (e as Error)?.message ?? ""
  if (/identity/i.test(msg) && /(not|disabled|missing|enable)/i.test(msg)) {
    return new Error("Sign-in isn't switched on for this site yet. Enable Identity in Netlify → Project → Identity.")
  }
  if (/invalid_grant|password/i.test(msg)) return new Error("That email and password don't match.")
  if (/confirm/i.test(msg)) return new Error("Confirm your email first — check your inbox for the link.")
  if (/already/i.test(msg)) return new Error("An account with this email already exists. Sign in instead.")
  if (/fetch|network/i.test(msg)) return new Error("Sign-in only works on the deployed site, not on a local dev server.")
  return new Error(msg || "Something went wrong. Try again.")
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [inviteToken, setInviteToken] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const cb = await handleAuthCallback()
        if (cb?.type === "invite" && cb.token && alive) setInviteToken(cb.token)
        if (cb && alive) {
          setNotice(
            cb.type === "confirmation" ? "Email confirmed. You're signed in."
              : cb.type === "recovery" ? "You're signed in. Set a new password in Settings."
              : cb.type === "invite" ? "Choose a password to finish joining." : null,
          )
        }
      } catch { /* no token in the URL */ }
      try {
        const u = await getUser()
        if (alive) setUser(u)
      } catch { /* Identity not enabled or offline */ }
      if (alive) setReady(true)
    })()
    let off = () => {}
    try { off = onAuthChange((_e, u) => setUser(u ?? null)) } catch { /* ignore */ }
    return () => { alive = false; off() }
  }, [])

  const value: AuthState = {
    user, ready, notice,
    async login(email, password) {
      try { setUser(await idLogin(email, password)) } catch (e) { throw friendly(e) }
    },
    async signup(email, password, name) {
      try {
        const u = await idSignup(email, password, { full_name: name })
        if (u.confirmedAt) { setUser(await getUser()); return "signed-in" }
        return "confirm-email"
      } catch (e) { throw friendly(e) }
    },
    async logout() {
      try { await idLogout() } finally { setUser(null) }
    },
    inviteToken,
    async acceptInvite(password) {
      if (!inviteToken) throw new Error("This invite link has already been used.")
      try {
        setUser(await idAcceptInvite(inviteToken, password))
        setInviteToken(null)
      } catch (e) { throw friendly(e) }
    },
    async recover(email) {
      try { await requestPasswordRecovery(email) } catch (e) { throw friendly(e) }
    },
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth(): AuthState {
  const v = useContext(Ctx)
  if (!v) throw new Error("useAuth outside AuthProvider")
  return v
}
