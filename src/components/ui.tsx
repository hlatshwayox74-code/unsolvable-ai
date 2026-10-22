import { useId, type ReactNode } from "react"

export function Segmented<T extends string>({
  value, options, onChange, label,
}: { value: T; options: { value: T; label: string; disabled?: boolean; title?: string }[]; onChange(v: T): void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-[var(--radius-ctl)] border border-line bg-coal-2 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          disabled={o.disabled}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={`rounded-[7px] px-3 py-1.5 text-sm font-semibold transition-colors ${
            value === o.value ? "bg-paper text-ink" : "text-mist hover:text-paper disabled:opacity-35"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function ChipGroup<T extends string | number>({
  label, value, options, onChange, format = String, hint,
}: { label: string; value: T | undefined; options: T[]; onChange(v: T): void; format?(v: T): string; hint?: ReactNode }) {
  const id = useId()
  return (
    <div>
      <span id={id} className="label">{label}</span>
      <div role="radiogroup" aria-labelledby={id} className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button key={String(o)} type="button" role="radio" aria-checked={value === o} className="chip" onClick={() => onChange(o)}>
            {format(o)}
          </button>
        ))}
      </div>
      {hint && <p className="hint mt-1.5">{hint}</p>}
    </div>
  )
}

export function Notice({ tone = "info", children, action }: { tone?: "info" | "warn" | "error" | "ok"; children: ReactNode; action?: ReactNode }) {
  const tones = {
    info: "border-line bg-coal text-mist",
    warn: "border-signal/40 bg-signal/[0.06] text-signal-soft",
    error: "border-alert/50 bg-alert/[0.07] text-[#ffc2bd]",
    ok: "border-go/40 bg-go/[0.07] text-[#c4f5d6]",
  }
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`flex flex-wrap items-start justify-between gap-3 rounded-[var(--radius-ctl)] border px-4 py-3 text-sm leading-relaxed ${tones[tone]}`}>
      <div className="min-w-0 flex-1">{children}</div>
      {action}
    </div>
  )
}

export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

export function Icon({ name, className = "h-4 w-4" }: { name: keyof typeof PATHS; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {PATHS[name]}
    </svg>
  )
}

const PATHS = {
  image: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="m21 16-5-5-9 9" /></>,
  video: <><rect x="3" y="5" width="13" height="14" rx="2" /><path d="m16 10 5-3v10l-5-3" /></>,
  voice: <><path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></>,
  ads: <><path d="M4 9v6h3l6 4V5L7 9H4Z" /><path d="M17 8.5a4 4 0 0 1 0 7M19.5 6a7.5 7.5 0 0 1 0 12" /></>,
  library: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  home: <><path d="m3 11 9-7 9 7" /><path d="M5 10v10h14V10" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></>,
  help: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5h.01" /></>,
  upload: <><path d="M12 15V3M7 8l5-5 5 5" /><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" /></>,
  download: <><path d="M12 3v12M7 10l5 5 5-5" /><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></>,
  sparkle: <><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8Z" /><path d="M19 15l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7Z" /></>,
  x: <><path d="M6 6l12 12M18 6 6 18" /></>,
  retry: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></>,
  trash: <><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></>,
  stop: <><rect x="6" y="6" width="12" height="12" rx="2" /></>,
  play: <><path d="M7 4v16l13-8Z" /></>,
  arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
  check: <><path d="m5 12 5 5L20 7" /></>,
  menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
} as const
