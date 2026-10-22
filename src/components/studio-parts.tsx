import { useEffect, useRef, useState, type ReactNode } from "react"
import { Link } from "react-router-dom"
import { PROVIDERS, TERMINAL, type JobView, type ModelDef } from "../../shared/catalog.ts"
import { cancelJob, deleteJob, upload, visibleModels, type AppConfig, type UploadResult } from "../lib/api.ts"
import { useAuth } from "../lib/auth.tsx"
import { costLabel, elapsed, timeAgo, usd } from "../lib/format.ts"
import { Icon, Notice, Spinner } from "./ui.tsx"

/** Explains, in order, what stands between this user and generating. Renders nothing when ready. */
export function SetupGate({ config, models, configError }: { config: AppConfig | null; models: ModelDef[]; configError?: string | null }) {
  const { user, ready } = useAuth()
  if (!ready) return null
  if (configError) return <Notice tone="error">{configError}</Notice>
  if (!user) {
    return (
      <Notice tone="warn" action={<Link to="/login" className="btn btn-signal py-2">Sign in</Link>}>
        Sign in to generate. You can explore every control without an account.
      </Notice>
    )
  }
  if (!config) return null
  if (!config.storageReady) {
    return <Notice tone="error">Storage isn't set up: add a <code>MEDIA_SIGNING_SECRET</code> (32+ random characters) in Netlify, then redeploy.</Notice>
  }
  if (config.user && !config.user.canGenerate) {
    return (
      <Notice tone="warn">
        Your account can browse but not generate yet. The workspace owner can give you the <b>creator</b> role in Netlify → Identity.
        Role changes apply after you sign out and back in.
      </Notice>
    )
  }
  const usable = visibleModels(config, models)
  const missing = [...new Set(usable.map((m) => m.provider))].filter((p) => !config.providers[p])
  if (missing.includes("engine") && missing.length === new Set(usable.map((m) => m.provider)).size) {
    return (
      <Notice tone="warn" action={<Link to="/studio/settings" className="btn btn-ghost py-2">See setup</Link>}>
        The self-hosted engine isn't connected yet. Start it on a GPU machine, then add <code>ENGINE_URL</code> and <code>ENGINE_TOKEN</code> in Netlify (see docs/ENGINE.md).
      </Notice>
    )
  }
  if (missing.length && missing.length === new Set(usable.map((m) => m.provider)).size) {
    return (
      <Notice tone="warn" action={<Link to="/studio/settings" className="btn btn-ghost py-2">See setup</Link>}>
        No provider key is set for this tool yet. Add {missing.map((p) => PROVIDERS[p].envKey).join(" or ")} in Netlify to start generating.
      </Notice>
    )
  }
  return null
}

export function ModelPicker({
  models, value, onChange, config,
}: { models: ModelDef[]; value: string; onChange(id: string): void; config: AppConfig | null }) {
  return (
    <fieldset>
      <legend className="label">Model</legend>
      <div className="grid gap-1.5">
        {visibleModels(config, models).map((m) => {
          const ready = config ? config.providers[m.provider] : true
          const active = m.id === value
          return (
            <label
              key={m.id}
              className={`flex cursor-pointer items-start gap-3 rounded-[var(--radius-ctl)] border px-3 py-2.5 transition-colors ${
                active ? "border-signal bg-signal/[0.06]" : "border-line hover:border-[#45454c]"
              }`}
            >
              <input type="radio" name="model" className="sr-only" checked={active} onChange={() => onChange(m.id)} />
              <span className={`mt-1 h-3 w-3 shrink-0 rounded-full border-2 ${active ? "border-signal bg-signal" : "border-[#55555c]"}`} aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="font-semibold">{m.label}</span>
                  {m.lifecycle === "preview" && <span className="rounded bg-coal-3 px-1.5 py-px text-[11px] font-semibold text-mist">Preview</span>}
                  {m.provider === "engine" && <span className="rounded bg-signal/15 px-1.5 py-px text-[11px] font-semibold text-signal">Self-hosted{m.license ? ` · ${m.license}` : ""}</span>}
                  {!ready && <span className="rounded bg-alert/15 px-1.5 py-px text-[11px] font-semibold text-[#ffb3ad]">{m.provider === "engine" ? "Engine not connected" : `Needs ${PROVIDERS[m.provider].label} key`}</span>}
                </span>
                <span className="mt-0.5 block text-[13px] leading-snug text-smoke">{m.summary}</span>
                {active && <span className="mt-1 block text-[12px] text-mist">{m.priceNote}</span>}
              </span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}

export interface Asset extends UploadResult { name: string; previewUrl: string; seconds?: number }

export function UploadSlot({
  label, accept, assets, max, onChange, hint, disabled,
}: { label: string; accept: "image" | "video"; assets: Asset[]; max: number; onChange(a: Asset[]): void; hint?: ReactNode; disabled?: boolean }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [drag, setDrag] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  async function add(files: FileList | File[]) {
    setError(null)
    const list = [...files].slice(0, Math.max(0, max - assets.length))
    if (!list.length) { setError(`You can add up to ${max}.`); return }
    setBusy(true)
    const next = [...assets]
    for (const f of list) {
      if (!f.type.startsWith(accept + "/")) { setError(`${f.name} isn't ${accept === "image" ? "an image" : "a video"}.`); continue }
      try {
        const seconds = accept === "video" ? await readDuration(f) : undefined
        const r = await upload(f)
        next.push({ ...r, name: f.name, previewUrl: URL.createObjectURL(f), seconds })
      } catch (e) {
        setError((e as Error).message)
      }
    }
    onChange(next)
    setBusy(false)
  }

  return (
    <div>
      <span className="label">{label}</span>
      <div className="flex flex-wrap gap-2">
        {assets.map((a, i) => (
          <div key={a.assetId} className="group relative h-20 w-20 overflow-hidden rounded-[var(--radius-media)] border border-line bg-coal-2">
            {a.kind === "image"
              ? <img src={a.previewUrl} alt={a.name} className="h-full w-full object-cover" />
              : <video src={a.previewUrl} className="h-full w-full object-cover" muted />}
            <span className="absolute bottom-0 left-0 bg-ink/80 px-1.5 text-[11px] font-semibold">{accept === "image" && max > 1 ? `ref${i + 1}` : a.seconds ? `${a.seconds.toFixed(1)}s` : ""}</span>
            <button
              type="button"
              onClick={() => onChange(assets.filter((x) => x.assetId !== a.assetId))}
              className="absolute right-1 top-1 rounded-full bg-ink/80 p-1 opacity-80 hover:opacity-100"
              aria-label={`Remove ${a.name}`}
            >
              <Icon name="x" className="h-3 w-3" />
            </button>
          </div>
        ))}
        {assets.length < max && (
          <button
            type="button"
            disabled={busy || disabled}
            onClick={() => input.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); if (!disabled) add(e.dataTransfer.files) }}
            className={`flex h-20 min-w-20 flex-col items-center justify-center gap-1 rounded-[var(--radius-media)] border border-dashed px-3 text-[12px] font-semibold transition-colors ${
              drag ? "border-signal text-signal" : "border-[#46464d] text-mist hover:border-mist hover:text-paper"
            } disabled:opacity-40`}
          >
            {busy ? <Spinner /> : <Icon name="upload" />}
            {busy ? "Uploading" : "Add"}
          </button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        hidden
        multiple={max > 1}
        accept={accept === "image" ? "image/jpeg,image/png,image/webp" : "video/mp4,video/quicktime,video/webm"}
        onChange={(e) => { if (e.target.files) add(e.target.files); e.target.value = "" }}
      />
      {error && <p className="mt-1.5 text-[13px] text-[#ffb3ad]" role="alert">{error}</p>}
      {hint && !error && <p className="hint mt-1.5">{hint}</p>}
    </div>
  )
}

function readDuration(f: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video")
    v.preload = "metadata"
    v.onloadedmetadata = () => { resolve(v.duration); URL.revokeObjectURL(v.src) }
    v.onerror = () => reject(new Error("Couldn't read this video. Try an MP4."))
    v.src = URL.createObjectURL(f)
  })
}

const STATUS_TEXT: Record<string, string> = {
  queued: "Queued", processing: "Rendering", completed: "Done", failed: "Failed", canceled: "Cancelled",
}

export function JobCard({ job, onRetry, onUse }: { job: JobView; onRetry?(j: JobView): void; onUse?(j: JobView): ReactNode }) {
  const [now, setNow] = useState(Date.now())
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const running = !TERMINAL.includes(job.status)
  useEffect(() => {
    if (!running) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [running])

  async function act(kind: "cancel" | "delete") {
    setBusy(kind); setErr(null)
    try { kind === "cancel" ? await cancelJob(job.id) : await deleteJob(job.id) } catch (e) { setErr((e as Error).message) }
    setBusy(null)
  }

  const first = job.outputs[0]
  return (
    <article className="overflow-hidden rounded-[var(--radius-panel)] border border-line bg-coal">
      <div className={`relative bg-coal-2 ${job.kind === "audio" ? "" : aspectClass(job.params.aspect)}`}>
        {job.status === "completed" && first ? (
          job.outputs.length > 1 && job.kind === "image" ? (
            <div className="grid h-full grid-cols-2 gap-px">
              {job.outputs.map((o) => <img key={o.assetId} src={o.url} alt="" loading="lazy" className="h-full w-full object-cover" />)}
            </div>
          ) : job.kind === "video" ? (
            <video src={first.url} controls playsInline preload="metadata" className="h-full w-full bg-ink object-contain" />
          ) : job.kind === "audio" ? (
            <div className="p-4"><audio src={first.url} controls className="w-full" /></div>
          ) : (
            <a href={first.url} target="_blank" rel="noreferrer"><img src={first.url} alt={job.prompt.slice(0, 120)} loading="lazy" className="h-full w-full object-cover" /></a>
          )
        ) : (
          <div className={`flex h-full min-h-28 flex-col items-center justify-center gap-2 p-6 text-center ${job.kind === "audio" ? "py-8" : ""}`}>
            {running ? (
              <>
                <span className="display text-3xl text-signal">{typeof job.progress === "number" ? `${Math.round(job.progress * 100)}%` : elapsed(job.createdAt, now)}</span>
                <span className="text-sm text-mist">{STATUS_TEXT[job.status]} on {job.modelLabel}{typeof job.progress !== "number" ? " · the provider doesn't report progress" : ""}</span>
                <div className="processing-bar mt-1 h-0.5 w-32 bg-coal-3" />
              </>
            ) : (
              <span className={`text-sm ${job.status === "failed" ? "text-[#ffb3ad]" : "text-smoke"}`}>{job.error ?? STATUS_TEXT[job.status]}</span>
            )}
          </div>
        )}
      </div>
      <div className="space-y-2 p-3.5">
        <p className="line-clamp-2 text-[13.5px] leading-snug text-mist" title={job.prompt}>{job.prompt || "(no prompt)"}</p>
        <div className="flex flex-wrap items-center gap-x-2 text-[12px] text-smoke">
          <span className={job.status === "failed" ? "text-[#ffb3ad]" : job.status === "completed" ? "text-go" : "text-signal"}>{STATUS_TEXT[job.status]}</span>
          <span>{job.modelLabel}</span>
          <span title={job.cost.breakdown}>{job.cost.basis === "estimate" ? "≈" : ""}{usd(job.cost.usd)}</span>
          <span>{timeAgo(job.createdAt, now)}</span>
        </div>
        <div className="flex flex-wrap gap-1">
          {job.outputs.map((o, i) => (
            <a key={o.assetId} href={`${o.url}?download=1`} className="btn btn-quiet text-[13px]" download>
              <Icon name="download" /> {job.outputs.length > 1 ? i + 1 : "Download"}
            </a>
          ))}
          {onUse?.(job)}
          {running && <button className="btn btn-quiet text-[13px]" disabled={!!busy} onClick={() => act("cancel")}><Icon name="stop" /> Cancel</button>}
          {!running && onRetry && <button className="btn btn-quiet text-[13px]" onClick={() => onRetry(job)} title="Load these settings back into the form"><Icon name="retry" /> Reuse settings</button>}
          {!running && <button className="btn btn-quiet text-[13px]" disabled={!!busy} onClick={() => act("delete")} aria-label="Delete"><Icon name="trash" /></button>}
        </div>
        {job.provenance && <ProvenanceLine p={job.provenance} />}
        {err && <p className="text-[12.5px] text-[#ffb3ad]">{err}</p>}
      </div>
    </article>
  )
}

/** Which self-hosted model made this, on what hardware, and what the automatic checks found. */
function ProvenanceLine({ p }: { p: NonNullable<JobView["provenance"]> }) {
  const bits = [
    `Made on our engine with ${p.model}${p.license ? ` (${p.license})` : ""}`,
    p.seconds !== undefined ? `${p.seconds < 90 ? `${p.seconds.toFixed(1)} s` : `${(p.seconds / 60).toFixed(1)} min`}${p.gpu ? ` on ${p.gpu}` : ""}` : null,
    p.peakVramGb ? `${p.peakVramGb} GB GPU memory` : null,
  ].filter(Boolean)
  return (
    <p className="text-[12px] leading-snug text-smoke">
      {bits.join(" · ")}
      {p.quality && (p.quality.passed
        ? <span className="text-go"> · automatic checks passed</span>
        : <span className="text-[#ffb3ad]"> · check failed: {p.quality.failed.join(", ")}</span>)}
    </p>
  )
}

function aspectClass(a?: string) {
  switch (a) {
    case "9:16": return "aspect-[9/16] max-h-[460px] mx-auto w-full"
    case "1:1": return "aspect-square"
    case "4:3": return "aspect-[4/3]"
    case "3:4": return "aspect-[3/4]"
    case "3:2": return "aspect-[3/2]"
    case "2:3": return "aspect-[2/3]"
    case "21:9": return "aspect-[21/9]"
    default: return "aspect-video"
  }
}

export function CostLine({ cost, models }: { cost: ReturnType<typeof import("../../shared/catalog.ts").estimateCost>; models?: ModelDef }) {
  return (
    <p className="text-[12.5px] text-smoke" title={cost.breakdown}>
      {cost.basis === "estimate" ? "Estimated" : "Provider price"}: {cost.breakdown} = {usd(cost.usd)}.{" "}
      {models?.priceBasis === "estimate" ? "Final cost depends on your provider plan." : ""}
    </p>
  )
}

export { costLabel }
