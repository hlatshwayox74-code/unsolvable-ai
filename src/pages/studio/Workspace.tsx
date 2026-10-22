import { useEffect, useMemo, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import {
  estimateCost, getModel, MODE_LABEL, modelsFor, validateRequest,
  type Aspect, type GenerationParams, type JobView, type Mode,
} from "../../../shared/catalog.ts"
import { director, generate, upsertJob, useConfig, useJobs } from "../../lib/api.ts"
import { useAuth } from "../../lib/auth.tsx"
import { costLabel } from "../../lib/format.ts"
import { CostLine, JobCard, ModelPicker, SetupGate, UploadSlot, type Asset } from "../../components/studio-parts.tsx"
import { ChipGroup, Icon, Notice, Segmented, Spinner } from "../../components/ui.tsx"

type Kind = "image" | "video"

const MODES: Record<Kind, Mode[]> = { image: ["t2i", "i2i"], video: ["t2v", "i2v", "v2v"] }

const STARTERS: Record<Kind, string[]> = {
  image: [
    "A matte black hoodie on a concrete plinth, hard noon sun, long shadow, studio product photo, 85mm",
    "Overhead flat lay of a skincare set on wet slate, droplets, soft window light, editorial",
    "Night street in Gqeberha after rain, neon reflections, a cyclist passing, cinematic still",
  ],
  video: [
    "Slow dolly-in on a power bank on a marble desk as a phone snaps onto it magnetically, warm morning light",
    "Handheld tracking shot of a runner crossing a beach boardwalk at sunrise, wind in the grass, 35mm film look",
    "A suitcase rolls into frame across an airport terminal floor, low angle, reflections, crowd blurred behind",
  ],
}

export default function Workspace({ kind }: { kind: Kind }) {
  const [search, setSearch] = useSearchParams()
  const { user } = useAuth()
  const { config, error: configError } = useConfig(user?.id)
  const { jobs, error: jobsError } = useJobs(!!user)

  const [mode, setMode] = useState<Mode>(() => {
    const m = search.get("mode") as Mode | null
    return m && MODES[kind].includes(m) ? m : MODES[kind][0]
  })
  const models = useMemo(() => modelsFor(kind, mode), [kind, mode])
  const [modelId, setModelId] = useState(models[0]?.id ?? "")
  const model = getModel(modelId) ?? models[0]
  const [prompt, setPrompt] = useState(search.get("prompt") ?? "")
  const [params, setParams] = useState<GenerationParams>({})
  const [images, setImages] = useState<Asset[]>(() => {
    const id = search.get("asset"), url = search.get("url")
    return id && url ? [{ assetId: id, url, previewUrl: url, contentType: "image/png", kind: "image", bytes: 0, name: "From your library" }] : []
  })
  const [video, setVideo] = useState<Asset[]>([])
  const [advanced, setAdvanced] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [suggestion, setSuggestion] = useState<{ prompt: string; why?: string[]; missing?: string[]; negativePrompt?: string } | null>(null)
  const [directing, setDirecting] = useState(false)

  // Clean the URL once prefill has been consumed.
  useEffect(() => {
    if (search.toString()) setSearch({}, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keep the selected model valid for the mode.
  useEffect(() => {
    if (!models.some((m) => m.id === modelId)) setModelId(models[0]?.id ?? "")
  }, [models, modelId])

  const req = {
    modelId: model?.id ?? "",
    mode,
    prompt,
    params: { ...params, sourceSeconds: video[0]?.seconds },
    imageRefs: images.map((i) => i.assetId),
    videoRef: video[0]?.assetId,
  }
  const validation = model ? validateRequest(req) : { ok: false, errors: ["Pick a model."], params: {} }
  const cost = model ? estimateCost(model.id, mode, validation.params, prompt.length) : null
  const providerReady = !!model && !!config?.providers[model.provider]
  const canGenerate = !!user && !!config?.user?.canGenerate && !!config?.storageReady && providerReady

  const set = (p: Partial<GenerationParams>) => setParams((x) => ({ ...x, ...p }))
  const aspects = (model?.aspects?.[mode] ?? []) as Aspect[]
  const maxImages = mode === "i2v" ? 1 : model?.maxRefImages ?? 0

  async function onGenerate() {
    setError(null)
    if (!validation.ok) { setError(validation.errors.join(" ")); return }
    setSubmitting(true)
    try {
      const job = await generate(req)
      upsertJob(job)
      if (job.status === "failed") setError(job.error ?? "The provider rejected the request.")
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  async function improve() {
    if (!prompt.trim()) { setError("Write a rough idea first, then improve it."); return }
    setDirecting(true); setError(null)
    try {
      setSuggestion(await director("enhance", prompt, { modelId: model?.id }))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setDirecting(false)
    }
  }

  function reuse(j: JobView) {
    setMode(j.mode)
    setModelId(j.modelId)
    setPrompt(j.prompt)
    setParams({ ...j.params, seed: undefined })
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const myJobs = jobs.filter((j) => j.kind === kind)

  return (
    <div className="grid gap-6 lg:grid-cols-[420px_minmax(0,1fr)] xl:grid-cols-[460px_minmax(0,1fr)]">
      <section aria-label="Settings" className="space-y-5 lg:sticky lg:top-6 lg:self-start">
        <div>
          <h1 className="display text-5xl">{kind === "image" ? "Image" : "Video"}</h1>
          <p className="mt-1 text-sm text-smoke">
            {kind === "image"
              ? "Generate stills, or edit using your own photos as references."
              : "Write a shot, animate a photo, or restyle a clip you already have."}
          </p>
        </div>

        <SetupGate config={config} models={models} configError={configError} />

        <Segmented<Mode>
          label="Mode"
          value={mode}
          onChange={(m) => { setMode(m); setError(null) }}
          options={MODES[kind].map((m) => ({ value: m, label: MODE_LABEL[m] }))}
        />

        {(mode === "i2i" || mode === "i2v" || (maxImages > 0 && mode !== "v2v")) && (
          <UploadSlot
            label={mode === "i2v" ? "Start image" : mode === "i2i" ? "Reference images" : "Reference images (optional)"}
            accept="image"
            assets={images}
            max={Math.max(1, maxImages)}
            onChange={setImages}
            disabled={!user}
            hint={
              mode === "i2v" ? "This frame is kept as the first frame of the clip — use your real product photo."
                : model?.provider === "runway" ? "Mention them in the prompt as @ref1, @ref2…"
                : model?.provider === "google" ? "Veo keeps the subject of these images consistent (needs an 8-second clip)."
                : "The model keeps details from these images. JPG, PNG or WebP, up to 4 MB."
            }
          />
        )}
        {mode === "v2v" && (
          <UploadSlot
            label="Clip to edit" accept="video" assets={video} max={1} onChange={setVideo} disabled={!user}
            hint="MP4, MOV or WebM, up to 4 MB and 30 seconds. Describe the change below."
          />
        )}

        <div>
          <div className="mb-1.5 flex items-end justify-between gap-2">
            <label htmlFor="prompt" className="label mb-0">{mode === "v2v" ? "What should change" : mode === "i2v" ? "Motion and camera (optional)" : "Prompt"}</label>
            <button type="button" className="btn btn-quiet py-1 text-[13px]" onClick={improve} disabled={directing || !user || !config?.director}
              title={config?.director ? "The creative director rewrites your prompt; you choose whether to use it" : "Needs a Gemini or OpenAI key"}>
              {directing ? <Spinner className="h-3.5 w-3.5" /> : <Icon name="sparkle" className="h-3.5 w-3.5" />} Improve
            </button>
          </div>
          <textarea
            id="prompt"
            className="field min-h-36 resize-y leading-relaxed"
            placeholder={mode === "v2v" ? "Make it night with rain on the windows; keep the person and their movement" : "Describe the subject, setting, light and camera…"}
            value={prompt}
            maxLength={4000}
            onChange={(e) => setPrompt(e.target.value)}
          />
          {!prompt && mode !== "v2v" && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {STARTERS[kind].map((s) => (
                <button key={s} type="button" className="chip max-w-full truncate text-left font-medium" onClick={() => setPrompt(s)} title={s}>
                  {s.split(",")[0]}
                </button>
              ))}
            </div>
          )}
          {suggestion && (
            <div className="mt-3 rounded-[var(--radius-ctl)] border border-signal/40 bg-signal/[0.05] p-3.5">
              <p className="text-[13px] font-semibold text-signal">Suggested prompt</p>
              <p className="mt-1 text-sm leading-relaxed">{suggestion.prompt}</p>
              {!!suggestion.why?.length && <ul className="mt-2 list-disc pl-4 text-[12.5px] text-smoke">{suggestion.why.map((w) => <li key={w}>{w}</li>)}</ul>}
              {!!suggestion.missing?.length && <p className="mt-2 text-[12.5px] text-mist">Worth adding: {suggestion.missing.join("; ")}</p>}
              <div className="mt-3 flex gap-2">
                <button className="btn btn-signal py-1.5 text-sm" onClick={() => {
                  setPrompt(suggestion.prompt)
                  if (suggestion.negativePrompt && model?.negativePrompt) set({ negativePrompt: suggestion.negativePrompt })
                  setSuggestion(null)
                }}>Use this prompt</button>
                <button className="btn btn-ghost py-1.5 text-sm" onClick={() => setSuggestion(null)}>Keep mine</button>
              </div>
            </div>
          )}
        </div>

        {model && <ModelPicker models={models} value={model.id} onChange={(id) => { setModelId(id); setParams({}) }} config={config} />}

        {model && (
          <div className="grid gap-4">
            {aspects.length > 0 && <ChipGroup label="Aspect ratio" value={validation.params.aspect} options={aspects} onChange={(aspect) => set({ aspect })} />}
            {model.durations && mode !== "v2v" && (
              <ChipGroup label="Length" value={validation.params.duration} options={model.durations} onChange={(duration) => set({ duration })} format={(d) => `${d}s`} />
            )}
            {model.resolutions && <ChipGroup label="Resolution" value={validation.params.resolution} options={model.resolutions} onChange={(resolution) => set({ resolution })} format={(r) => r.toUpperCase()} />}
            {model.qualities && <ChipGroup label="Quality" value={validation.params.quality} options={model.qualities} onChange={(quality) => set({ quality })} format={(q) => q[0].toUpperCase() + q.slice(1)} />}
            {model.maxVariations && model.maxVariations > 1 && (
              <ChipGroup label="Variations" value={validation.params.variations} options={Array.from({ length: model.maxVariations }, (_, i) => i + 1)} onChange={(variations) => set({ variations })} />
            )}
            {model.audio === "native" && <p className="hint">This model generates sound with the video — describe dialogue in quotes and name the sounds you want.</p>}
            {model.notes?.map((n) => <p key={n} className="hint">{n}</p>)}

            {(model.seed || model.negativePrompt || model.transparentBackground) && (
              <div>
                <button type="button" className="btn btn-quiet -ml-2 text-[13px]" aria-expanded={advanced} onClick={() => setAdvanced((a) => !a)}>
                  {advanced ? "Hide" : "Show"} advanced
                </button>
                {advanced && (
                  <div className="mt-2 grid gap-3">
                    {model.negativePrompt && (
                      <div>
                        <label htmlFor="neg" className="label">Avoid</label>
                        <input id="neg" className="field" placeholder="text overlays, extra fingers, warped logos" value={params.negativePrompt ?? ""} onChange={(e) => set({ negativePrompt: e.target.value })} />
                      </div>
                    )}
                    {model.seed && (
                      <div>
                        <label htmlFor="seed" className="label">Seed</label>
                        <div className="flex gap-2">
                          <input id="seed" className="field" inputMode="numeric" placeholder="Random" value={params.seed ?? ""}
                            onChange={(e) => set({ seed: e.target.value === "" ? undefined : Number(e.target.value.replace(/\D/g, "")) })} />
                          <button type="button" className="btn btn-ghost" onClick={() => set({ seed: Math.floor(Math.random() * 4294967295) })}>Random</button>
                        </div>
                        <p className="hint mt-1">Reusing a seed brings results closer together, but providers don't guarantee identical output.</p>
                      </div>
                    )}
                    {model.transparentBackground && (
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={!!params.transparent} onChange={(e) => set({ transparent: e.target.checked })} className="accent-[var(--color-signal)]" />
                        Transparent background (PNG)
                      </label>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="space-y-2 border-t border-line pt-4">
          <button className="btn btn-signal w-full py-3.5 text-base" disabled={!canGenerate || submitting} onClick={onGenerate}>
            {submitting ? <><Spinner /> Starting…</> : <>Generate{cost ? <span className="font-medium opacity-75"> · {costLabel(cost)}</span> : null}</>}
          </button>
          {cost && <CostLine cost={cost} models={model} />}
          {error && <Notice tone="error">{error}</Notice>}
        </div>
      </section>

      <section aria-label="Results" className="min-w-0">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-mist">Your {kind === "image" ? "images" : "videos"}</h2>
          <Link to="/studio/library" className="text-sm text-smoke hover:text-paper">All work</Link>
        </div>
        {jobsError && user && <Notice tone="error">{jobsError}</Notice>}
        {myJobs.length === 0 ? (
          <div className="grid min-h-80 place-items-center rounded-[var(--radius-panel)] border border-dashed border-line p-10 text-center">
            <div>
              <p className="display text-3xl text-coal-3">Nothing yet</p>
              <p className="mt-2 max-w-sm text-sm text-smoke">
                {user ? "Write a prompt and press Generate. Results land here and stay in your library." : "Sign in to keep your work here."}
              </p>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
            {myJobs.map((j) => (
              <JobCard
                key={j.id}
                job={j}
                onRetry={reuse}
                onUse={(job) =>
                  job.kind === "image" && job.status === "completed" ? (
                    <Link className="btn btn-quiet text-[13px]" to={`/studio/video?mode=i2v&asset=${job.outputs[0].assetId}&url=${encodeURIComponent(job.outputs[0].url)}`}>
                      <Icon name="video" /> Animate
                    </Link>
                  ) : null
                }
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
