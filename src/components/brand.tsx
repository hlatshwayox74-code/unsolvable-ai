import { Link } from "react-router-dom"

/** The UX mark: a solid X built from two bars. */
export function XMark({ className = "", title }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} role={title ? "img" : undefined} aria-hidden={title ? undefined : true}>
      {title && <title>{title}</title>}
      <path d="M8 6h14l10 18L42 6h14L39.5 32 56 58H42L32 40 22 58H8l16.5-26z" fill="currentColor" />
    </svg>
  )
}

export function Logo({ to = "/", compact = false }: { to?: string; compact?: boolean }) {
  return (
    <Link to={to} className="group inline-flex items-center gap-2.5" aria-label="Unsolvable.ai home">
      <XMark className="h-7 w-7 text-signal transition-transform duration-300 group-hover:rotate-90" />
      {!compact && (
        <span className="display text-[1.55rem] leading-none tracking-wide">
          Unsolvable<span className="text-signal">.ai</span>
        </span>
      )}
    </Link>
  )
}
