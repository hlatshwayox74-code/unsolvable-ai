import { useState, type FormEvent } from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"
import { XMark } from "../components/brand.tsx"
import { Notice, Spinner } from "../components/ui.tsx"
import { useAuth } from "../lib/auth.tsx"

type Mode = "login" | "signup" | "recover"

export default function Auth({ mode: initial }: { mode: Mode }) {
  const auth = useAuth()
  const nav = useNavigate()
  const loc = useLocation() as { state?: { from?: string } }
  const [mode, setMode] = useState<Mode>(initial)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [name, setName] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const inviting = !!auth.inviteToken

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      if (inviting) {
        await auth.acceptInvite(password)
        nav("/studio")
      } else if (mode === "login") {
        await auth.login(email, password)
        nav(loc.state?.from ?? "/studio")
      } else if (mode === "signup") {
        const r = await auth.signup(email, password, name)
        if (r === "signed-in") nav("/studio")
        else setDone(`We sent a confirmation link to ${email}. Open it to finish signing up.`)
      } else {
        await auth.recover(email)
        setDone(`If ${email} has an account, a reset link is on its way.`)
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const title = inviting ? "Choose a password" : mode === "login" ? "Sign in" : mode === "signup" ? "Create your account" : "Reset your password"
  const action = inviting ? "Join" : mode === "login" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link"

  return (
    <div className="mx-auto grid min-h-[calc(100dvh-64px)] max-w-md content-center px-5 py-16">
      <XMark className="h-10 w-10 text-signal" />
      <h1 className="display mt-6 text-6xl">{title}</h1>
      {done ? (
        <div className="mt-8"><Notice tone="ok">{done}</Notice></div>
      ) : (
        <form onSubmit={submit} className="mt-8 space-y-4">
          {mode === "signup" && !inviting && (
            <div>
              <label htmlFor="name" className="label">Name</label>
              <input id="name" className="field" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          )}
          {!inviting && (
            <div>
              <label htmlFor="email" className="label">Email</label>
              <input id="email" type="email" required className="field" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          )}
          {mode !== "recover" && (
            <div>
              <label htmlFor="password" className="label">Password</label>
              <input id="password" type="password" required minLength={8} className="field" autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} />
              {mode !== "login" && <p className="hint mt-1">At least 8 characters.</p>}
            </div>
          )}
          {error && <Notice tone="error">{error}</Notice>}
          <button className="btn btn-signal w-full py-3" disabled={busy}>{busy ? <Spinner /> : action}</button>
          {!inviting && (
            <div className="flex flex-wrap justify-between gap-2 text-sm text-smoke">
              {mode !== "login" && <button type="button" className="hover:text-paper" onClick={() => setMode("login")}>Have an account? Sign in</button>}
              {mode === "login" && <button type="button" className="hover:text-paper" onClick={() => setMode("signup")}>Create an account</button>}
              {mode === "login" && <button type="button" className="hover:text-paper" onClick={() => setMode("recover")}>Forgot password?</button>}
            </div>
          )}
          {mode === "signup" && !inviting && (
            <p className="hint">New accounts can browse the studio. Generating spends real provider credit, so the workspace owner turns it on for each person.</p>
          )}
        </form>
      )}
      <Link to="/" className="mt-10 text-sm text-smoke hover:text-paper">Back to home</Link>
    </div>
  )
}
