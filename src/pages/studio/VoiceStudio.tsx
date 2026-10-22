import { useEffect, useMemo, useState } from "react"
import { estimateCost, MAX_CHARS, modelsFor, validateRequest } from "../../../shared/catalog.ts"
import { api, generate, upsertJob, useConfig, useJobs } from "../../lib/api.ts"
import { useAuth } from "../../lib/auth.tsx"
import { costLabel } from "../../lib/format.ts"
import { CostLine, JobCard, ModelPicker, SetupGate } from "../../components/studio-parts.tsx"
import { Notice, Spinner } from "../../components/ui.tsx"

interface Voice { id: string; name: string; category?: string; labels?: Record<string, string>; previewUrl?: string }

export default function VoiceStudio({ initialScript = "" }: { initialScript?: string }) {
  const { user } = useAuth()
  const { config, error: configError } = useConfig(user?.id)
  const { jobs } = useJobs(!!user)
  const models = useMemo(() => modelsFor("audio", "tts"), [])
  const [modelId, setModelId] = useState(models[0].id)
  const [script, setScript] = useState(initialScript)
  const [voices, setVoices] = useState<Voice[] | null>(null)
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const [voiceId, setVoiceId] = useState("")
  const [stability, setStability] = useState(0.5)
  const [speed, setSpeed] = useState(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const ready = !!config?.providers.elevenlabs
  useEffect(() => {
    if (!user || !ready) return
    api<{ voices: Voice[] }>("/api/voices")
      .then((r) => { setVoices(r.voices); if (r.voices[0]) setVoiceId((v) => v || r.voices[0].id) })
      .catch((e) => setVoiceError((e as Error).message))
  }, [user, ready])

  const req = { modelId, mode: "tts" as const, prompt: script, params: { voiceId, stability, speed } }
  const v = validateRequest(req)
  const cost = estimateCost(modelId, "tts", v.params, script.trim().length)
  const limit = MAX_CHARS[modelId] ?? 5000
  const words = script.trim() ? script.trim().split(/\s+/).length : 0
  const voice = voices?.find((x) => x.id === voiceId)

  async function go() {
    setError(null)
    if (!v.ok) { setError(v.errors.join(" ")); return }
    setBusy(true)
    try { upsertJob(await generate(req)) } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <section className="space-y-5">
        <div>
          <h1 className="display text-5xl">Voice</h1>
          <p className="mt-1 text-sm text-smoke">Turn a script into a voiceover with ElevenLabs. Download it as MP3 or drop it into an ad.</p>
        </div>
        <SetupGate config={config} models={models} configError={configError} />
        <div>
          <label htmlFor="script" className="label">Script</label>
          <textarea
            id="script" className="field min-h-64 resize-y text-[15px] leading-relaxed" value={script} onChange={(e) => setScript(e.target.value)}
            placeholder="Built for the ones who keep going. The Problem Solver hoodie — heavyweight cotton, cut to move. Unsolvable. Beyond limits."
          />
          <p className="hint mt-1.5">
            {script.length.toLocaleString("en")} / {limit.toLocaleString("en")} characters · {words} words · about {Math.max(1, Math.round(words / 2.6))} seconds at a natural pace.
            Add emotion with brackets on v3/v4 models, e.g. [excited] or [whispers].
          </p>
        </div>
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-mist">Voiceovers</h2>
          {jobs.filter((j) => j.kind === "audio").length === 0 && <p className="text-sm text-smoke">Your voiceovers will appear here.</p>}
          <div className="grid gap-3 md:grid-cols-2">
            {jobs.filter((j) => j.kind === "audio").map((j) => (
              <JobCard key={j.id} job={j} onRetry={(job) => { setScript(job.prompt); setModelId(job.modelId); if (job.params.voiceId) setVoiceId(job.params.voiceId) }} />
            ))}
          </div>
        </div>
      </section>

      <aside className="space-y-5 lg:sticky lg:top-6 lg:self-start">
        <div>
          <label htmlFor="voice" className="label">Voice</label>
          {!ready ? (
            <p className="hint">Add ELEVENLABS_API_KEY to load your voices.</p>
          ) : voiceError ? (
            <Notice tone="error">{voiceError}</Notice>
          ) : !voices ? (
            <p className="hint flex items-center gap-2"><Spinner className="h-3.5 w-3.5" /> Loading your ElevenLabs voices…</p>
          ) : (
            <>
              <select id="voice" className="field" value={voiceId} onChange={(e) => setVoiceId(e.target.value)}>
                {voices.map((x) => <option key={x.id} value={x.id}>{x.name}{x.labels?.accent ? ` — ${x.labels.accent}` : ""}{x.category === "cloned" ? " (your clone)" : ""}</option>)}
              </select>
              {voice?.previewUrl && <audio key={voice.id} src={voice.previewUrl} controls className="mt-2 h-9 w-full" />}
              <p className="hint mt-1.5">Only use a cloned voice with the speaker's permission.</p>
            </>
          )}
        </div>
        <ModelPicker models={models} value={modelId} onChange={setModelId} config={config} />
        <div>
          <label htmlFor="stab" className="label">Delivery: {stability < 0.35 ? "expressive" : stability > 0.7 ? "steady" : "balanced"}</label>
          <input id="stab" type="range" min={0} max={1} step={0.05} value={stability} onChange={(e) => setStability(Number(e.target.value))} className="w-full accent-[var(--color-signal)]" />
        </div>
        <div>
          <label htmlFor="speed" className="label">Pace: {speed.toFixed(2)}×</label>
          <input id="speed" type="range" min={0.7} max={1.2} step={0.05} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="w-full accent-[var(--color-signal)]" />
        </div>
        <button className="btn btn-signal w-full py-3.5" onClick={go} disabled={busy || !ready || !user || !config?.user?.canGenerate || !config?.storageReady}>
          {busy ? <><Spinner /> Starting…</> : <>Generate voiceover · {costLabel(cost)}</>}
        </button>
        <CostLine cost={cost} models={models.find((m) => m.id === modelId)} />
        {error && <Notice tone="error">{error}</Notice>}
      </aside>
    </div>
  )
}
