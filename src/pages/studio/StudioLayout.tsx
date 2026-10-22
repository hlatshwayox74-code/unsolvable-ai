import { useState } from "react"
import { Link, NavLink, Outlet, useLocation } from "react-router-dom"
import { Logo } from "../../components/brand.tsx"
import { Icon } from "../../components/ui.tsx"
import { useConfig } from "../../lib/api.ts"
import { useAuth } from "../../lib/auth.tsx"

const NAV = [
  { to: "/studio", label: "Home", icon: "home", end: true },
  { to: "/studio/image", label: "Image", icon: "image" },
  { to: "/studio/video", label: "Video", icon: "video" },
  { to: "/studio/voice", label: "Voice", icon: "voice" },
  { to: "/studio/ads", label: "Ad Studio", icon: "ads" },
  { to: "/studio/library", label: "Library", icon: "library" },
] as const

const FOOT = [
  { to: "/studio/settings", label: "Settings", icon: "settings" },
  { to: "/studio/help", label: "Help", icon: "help" },
] as const

export default function StudioLayout() {
  const { user, logout, notice } = useAuth()
  const { config } = useConfig(user?.id)
  const [open, setOpen] = useState(false)
  const loc = useLocation()

  const link = (n: { to: string; label: string; icon: string; end?: boolean }) => (
    <NavLink
      key={n.to}
      to={n.to}
      end={"end" in n ? n.end : false}
      onClick={() => setOpen(false)}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-[var(--radius-ctl)] px-3 py-2.5 text-[15px] font-semibold transition-colors ${
          isActive ? "bg-paper text-ink" : "text-mist hover:bg-coal-2 hover:text-paper"
        }`
      }
    >
      <Icon name={n.icon as never} className="h-[18px] w-[18px]" />
      {n.label}
    </NavLink>
  )

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[232px_minmax(0,1fr)]">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-signal focus:px-3 focus:py-2 focus:text-ink">Skip to content</a>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-ink/90 px-4 py-3 backdrop-blur lg:hidden">
        <Logo to="/studio" />
        <button className="btn btn-quiet" aria-expanded={open} aria-controls="studio-nav" onClick={() => setOpen((o) => !o)} aria-label="Menu">
          <Icon name={open ? "x" : "menu"} className="h-5 w-5" />
        </button>
      </header>

      <aside
        id="studio-nav"
        className={`${open ? "block" : "hidden"} border-b border-line bg-ink px-3 py-4 lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:border-b-0 lg:border-r`}
      >
        <div className="hidden px-2 pb-6 pt-1 lg:block"><Logo to="/studio" /></div>
        <nav aria-label="Studio" className="space-y-1">{NAV.map(link)}</nav>
        <div className="mt-6 space-y-1 border-t border-line pt-4 lg:mt-auto">
          {FOOT.map(link)}
          <div className="mt-3 rounded-[var(--radius-ctl)] border border-line p-3 text-[13px]">
            {user ? (
              <>
                <p className="truncate font-semibold" title={user.email}>{user.name || user.email}</p>
                <p className="mt-0.5 text-smoke">
                  {config?.credits.enabled
                    ? `${config.credits.balance ?? "—"} credits`
                    : config?.user?.canGenerate ? "Can generate" : "View only"}
                </p>
                <button className="mt-2 text-mist underline-offset-2 hover:text-paper hover:underline" onClick={logout}>Sign out</button>
              </>
            ) : (
              <>
                <p className="text-smoke">Not signed in</p>
                <Link to="/login" state={{ from: loc.pathname }} className="mt-1 inline-block font-semibold text-signal">Sign in</Link>
              </>
            )}
          </div>
        </div>
      </aside>

      <main id="main" className="min-w-0 px-4 py-6 md:px-8 lg:py-8">
        {notice && <p role="status" className="mb-4 rounded-[var(--radius-ctl)] border border-go/40 bg-go/[0.07] px-4 py-2.5 text-sm text-[#c4f5d6]">{notice}</p>}
        <Outlet />
      </main>
    </div>
  )
}
