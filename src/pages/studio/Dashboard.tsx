import { Link } from "react-router-dom"
import { PROVIDERS, type ProviderId } from "../../../shared/catalog.ts"
import { JobCard } from "../../components/studio-parts.tsx"
import { Icon, Notice } from "../../components/ui.tsx"
import { useConfig, useJobs } from "../../lib/api.ts"
import { useAuth } from "../../lib/auth.tsx"

const TOOLS = [
  { to: "/studio/image", icon: "image", title: "Image", line: "Product shots, campaign stills, edits from your photos" },
  { to: "/studio/video", icon: "video", title: "Video", line: "Write a shot, animate a photo, restyle a clip" },
  { to: "/studio/voice", icon: "voice", title: "Voice", line: "Voiceovers and dialogue from a script" },
  { to: "/studio/ads", icon: "ads", title: "Ad Studio", line: "Product photo in, finished ads out" },
] as const

export default function Dashboard() {
  const { user } = useAuth()
  const { config } = useConfig(user?.id)
  const { jobs } = useJobs(!!user)
  const firstName = (user?.name || user?.email || "").split(/[ @]/)[0]

  const setup = [
    { done: !!user, label: "Sign in", to: "/login" },
    { done: !!config?.storageReady, label: "Add MEDIA_SIGNING_SECRET in Netlify", to: "/studio/settings" },
    { done: !!config && Object.values(config.providers).some(Boolean), label: "Add at least one provider key", to: "/studio/settings" },
    { done: !!config?.user?.canGenerate, label: "Get generation access (admin or creator role)", to: "/studio/help" },
  ]
  const ready = setup.every((s) => s.done)

  return (
    <div className="space-y-10">
      <div>
        <h1 className="display text-6xl md:text-7xl">{firstName ? `Let's make it, ${firstName}.` : "Studio"}</h1>
        <p className="mt-2 text-smoke">Pick a tool, or continue where you left off.</p>
      </div>

      {!ready && (
        <section className="panel p-5">
          <h2 className="font-semibold">Finish setting up</h2>
          <ol className="mt-3 grid gap-2 sm:grid-cols-2">
            {setup.map((s, i) => (
              <li key={s.label} className="flex items-center gap-3">
                <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[12px] font-bold ${s.done ? "bg-go text-ink" : "border border-line text-smoke"}`}>
                  {s.done ? <Icon name="check" className="h-3.5 w-3.5" /> : i + 1}
                </span>
                {s.done ? <span className="text-smoke line-through">{s.label}</span> : <Link to={s.to} className="font-semibold hover:text-signal">{s.label}</Link>}
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="grid gap-px overflow-hidden rounded-[var(--radius-panel)] border border-line bg-line sm:grid-cols-2 xl:grid-cols-4">
        {TOOLS.map((t) => (
          <Link key={t.to} to={t.to} className="group bg-coal p-5 transition-colors hover:bg-coal-2">
            <Icon name={t.icon} className="h-6 w-6 text-signal" />
            <h3 className="display mt-4 text-4xl group-hover:text-signal">{t.title}</h3>
            <p className="mt-1 text-sm text-smoke">{t.line}</p>
          </Link>
        ))}
      </section>

      {config && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-mist">Connected providers</h2>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(PROVIDERS) as ProviderId[]).map((p) => (
              <span key={p} className={`rounded-full border px-3 py-1 text-[13px] font-semibold ${config.providers[p] ? "border-go/50 text-go" : "border-line text-smoke"}`}>
                {PROVIDERS[p].label}{config.providers[p] ? "" : " — not set"}
              </span>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-mist">Recent work</h2>
          <Link to="/studio/library" className="text-sm text-smoke hover:text-paper">Library</Link>
        </div>
        {!user ? <Notice>Sign in to see your work.</Notice> : jobs.length === 0 ? (
          <p className="text-sm text-smoke">Nothing yet. Your generations will show up here.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{jobs.slice(0, 8).map((j) => <JobCard key={j.id} job={j} />)}</div>
        )}
      </section>
    </div>
  )
}
