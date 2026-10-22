import { useState } from "react"
import { Link, NavLink } from "react-router-dom"
import { useAuth } from "../lib/auth.tsx"
import { Logo, XMark } from "./brand.tsx"
import { Icon } from "./ui.tsx"

const LINKS = [
  { to: "/studio/image", label: "Image" },
  { to: "/studio/video", label: "Video" },
  { to: "/studio/voice", label: "Voice" },
  { to: "/studio/ads", label: "Ad Studio" },
  { to: "/models", label: "Models" },
  { to: "/pricing", label: "Pricing" },
]

export function SiteHeader() {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-ink/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1320px] items-center justify-between gap-6 px-5 py-3.5 md:px-8">
        <Logo />
        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <NavLink key={l.to} to={l.to} className={({ isActive }) => `rounded-md px-3 py-2 text-[15px] font-medium transition-colors ${isActive ? "text-paper" : "text-mist hover:text-paper"}`}>
              {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          {!user && <Link to="/login" className="btn btn-quiet hidden sm:inline-flex">Sign in</Link>}
          <Link to="/studio" className="btn btn-signal">{user ? "Open studio" : "Start creating"}</Link>
          <button className="btn btn-quiet md:hidden" aria-expanded={open} aria-controls="m-nav" aria-label="Menu" onClick={() => setOpen((o) => !o)}>
            <Icon name={open ? "x" : "menu"} className="h-5 w-5" />
          </button>
        </div>
      </div>
      {open && (
        <nav id="m-nav" aria-label="Main" className="border-t border-line px-5 pb-5 md:hidden">
          {[...LINKS, ...(user ? [] : [{ to: "/login", label: "Sign in" }])].map((l) => (
            <Link key={l.to} to={l.to} onClick={() => setOpen(false)} className="display block border-b border-line py-3 text-3xl">{l.label}</Link>
          ))}
        </nav>
      )}
    </header>
  )
}

export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto grid max-w-[1320px] gap-10 px-5 py-14 md:grid-cols-[1.4fr_1fr_1fr_1fr] md:px-8">
        <div className="space-y-3">
          <Logo />
          <p className="max-w-xs text-sm text-smoke">An AI studio by UNSOLVABLE. Images, video, voice and ads from one place, with the cost shown up front.</p>
        </div>
        <FooterCol title="Create" links={[["/studio/image", "Image"], ["/studio/video", "Video"], ["/studio/voice", "Voice"], ["/studio/ads", "Ad Studio"]]} />
        <FooterCol title="Product" links={[["/models", "Models"], ["/pricing", "Pricing"], ["/studio/help", "Help"]]} />
        <FooterCol title="Account" links={[["/login", "Sign in"], ["/signup", "Create account"], ["/studio/settings", "Settings"]]} />
      </div>
      <div className="mx-auto flex max-w-[1320px] items-center justify-between gap-4 border-t border-line px-5 py-5 text-[13px] text-smoke md:px-8">
        <span>© {new Date().getFullYear()} UNSOLVABLE. Beyond limits.</span>
        <XMark className="h-5 w-5 text-coal-3" />
      </div>
    </footer>
  )
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      <ul className="space-y-2">
        {links.map(([to, l]) => <li key={to}><Link to={to} className="text-sm text-smoke hover:text-paper">{l}</Link></li>)}
      </ul>
    </div>
  )
}
