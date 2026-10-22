import { useEffect, useMemo, useRef, useState } from "react"
import { getModel, type JobView } from "../../../../shared/catalog.ts"
import { api, director, generate, upsertJob, useConfig, useJobs, type AppConfig } from "../../../lib/api.ts"
import { useAuth } from "../../../lib/auth.tsx"
import { costLabel } from "../../../lib/format.ts"
import { estimateCost } from "../../../../shared/catalog.ts"
import { JobCard, SetupGate, UploadSlot, type Asset } from "../../../components/studio-parts.tsx"
import { ChipGroup, Icon, Notice, Spinner } from "../../../components/ui.tsx"
import Compositor from "./Compositor.tsx"

interface Analysis {
  productName: string | null; category: string; shape: string; colours: string[]; materials: string[]
  visibleText: string[]; distinctiveDetails: string[]; preservationClause: string; uncertain?: string[]
}
interface Concept { name: string; funnel: "top" | "middle" | "bottom"; angle: string; hook: string; headline: string; body: string; cta: string; imagePrompt: string; videoPrompt: string }
interface Shot { title: string; seconds: number; prompt: string; camera: string; voiceover: string; caption: string; jobId?: string }
interface Storyboard { title: string; shots: Shot[]; voiceoverScript: string; voJobId?: string; voiceId?: string }

interface Brief {
  brand: string; product: string; audience: string; market: string; offer: string
  points: string; objective: string; tone: string; platform: string; cta: string
  primary: string; accent: string
}

interface Campaign {
  id: string
  photos: Asset[]
  cutout: Asset[]
  analysis: Analysis | null
  brief: Brief
  concepts: Concept[]
  active: number
  storyboard: Storyboard | null
}

const EMPTY_BRIEF: Brief = {
  brand: "", product: "", audience: "", market: "South Africa, English", offer: "", points: "",
  objective: "Sales", tone: "Confident, premium", platform: "Instagram / Facebook", cta: "Shop now",
  primary: "#000000", accent: "#ffd100",
}

const STEPS = ["Product", "Campaign", "Concepts", "Create", "Layout & export"] as const
const FUNNEL = { top: "Top of funnel — attention", middle: "Middle — consideration", bottom: "Bottom — purchase" }
const OBJECTIVES = ["Awareness", "Traffic", "Sales", "Launch", "Retargeting"]
const PLATFORMS = ["Instagram / Facebook", "TikTok", "Instagram Reels / Stories", "YouTube Shorts", "Website / marketplace"]
const PRESETS = [
  "Premium product commercial", "UGC-style demo", "Cinematic reveal", "Problem and solution", "Product launch", "Seasonal",
]

function newCampaign(): Campaign {
  return { id: "cmp-" + Math.random().toString(36).slice(2, 10), photos: [], cutout: [], analysis: null, brief: EMPTY_BRIEF, concepts: [], active: 0, storyboard: null }
}

function storageKey(uid?: string) { return `unsolvable.ad.v1.${uid ?? "anon"}` }

/** First configured model from a preference list. */
function pick(config: AppConfig | null, ids: string[]): string {
  return ids.find((id) => { const m = getModel(id); return m && config?.providers[m.provider] }) ?? ids[0]
}

export default function AdStudio() {
  const { user } = useAuth()
  const { config, error: configError } = useConfig(user?.id)
  const { jobs } = useJobs(!!user)
  const [step, setStep] = useState(0)
  const [c, setC] = useState<Campaign>(() => {
    try { const raw = localStorage.getItem(storageKey()); if (raw) return JSON.parse(raw) } catch { /* fresh */ }
    return newCampaign()
  })
  const [busy, setBusy] = useState<string | null>(null)
  const [confirmNew, setConfirmNew] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const loadedFor = useRef<string | null>(null)

  // Per-user persistence in this browser.
  useEffect(() => {
    if (!user || loadedFor.current === user.id) return
    loadedFor.current = user.id
    try { const raw = localStorage.getItem(storageKey(user.id)); if (raw) setC(JSON.parse(raw)) } catch { /* ignore */ }
  }, [user])
  useEffect(() => {
    try {
      const persist = { ...c, photos: c.photos.map((p) => ({ ...p, previewUrl: p.url })), cutout: c.cutout.map((p) => ({ ...p, previewUrl: p.url })) }
      localStorage.setItem(storageKey(user?.id), JSON.stringify(persist))
    } catch { /* storage full or blocked */ }
  }, [c, user])

  const update = (p: Partial<Campaign>) => setC((x) => ({ ...x, ...p }))
  const setBrief = (p: Partial<Brief>) => setC((x) => ({ ...x, brief: { ...x.brief, ...p } }))
  const concept = c.concepts[c.active]
  const projectJobs = jobs.filter((j) => j.project === c.id)
  const canGenerate = !!config?.user?.canGenerate && !!config?.storageReady

  async function run<T>(label: string, fn: () => Promise<T>): Promise<T | undefined> {
    setBusy(label); setError(null)
    try { return await fn() } catch (e) { setError((e as Error).message) } finally { setBusy(null) }
  }

  const productFacts = useMemo(() => {
    const a = c.analysis
    const lines = [
      c.brief.product && `Product: ${c.brief.product}`,
      a && `Appearance: ${a.shape}; colours ${a.colours.join(", ")}; materials ${a.materials.join(", ")}`,
      a?.visibleText.length && `Printed text: ${a.visibleText.join(" | ")}`,
      a?.distinctiveDetails.length && `Distinctive details: ${a.distinctiveDetails.join("; ")}`,
    ]
    return lines.filter(Boolean).join("\n")
  }, [c.analysis, c.brief.product])

  function briefText() {
    const b = c.brief
    return [
      `Brand: ${b.brand}`, productFacts, `Selling points (stated by the brand): ${b.points || "none given"}`,
      `Audience: ${b.audience}`, `Market and language: ${b.market}`, `Offer or price (use exactly, or leave out): ${b.offer || "none"}`,
      `Objective: ${b.objective}`, `Tone: ${b.tone}`, `Platform: ${b.platform}`, `Call to action: ${b.cta}`,
    ].join("\n")
  }

  const preserve = c.analysis?.preservationClause
    ? ` ${c.analysis.preservationClause}`
    : " Keep the product exactly as in the reference photo: same shape, colours, proportions and printed text."

  async function makeImage(cpt: Concept, aspect: "1:1" | "2:3" | "9:16" | "16:9") {
    const modelId = pick(config, ["gpt-image-2", "runway-gen4-image"])
    const m = getModel(modelId)!
    const refs = c.photos.slice(0, m.maxRefImages ?? 1).map((p) => p.assetId)
    const aspectFor = m.aspects?.i2i?.includes(aspect) ? aspect : "1:1"
    const refNote = m.provider === "runway" ? " The product is @ref1." : ""
    await run("image", async () => {
      const job = await generate({
        modelId, mode: refs.length ? "i2i" : "t2i", project: c.id,
        prompt: `${cpt.imagePrompt}.${refNote}${preserve} Leave clean, uncluttered space for a headline. Do not render any words, prices, logos or watermarks.`,
        params: { aspect: aspectFor, quality: "high", variations: 1, resolution: "1080p" },
        imageRefs: refs,
      })
      upsertJob(job)
    })
  }

  async function writeStoryboard(seconds: number) {
    if (!concept) return
    const r = await run("storyboard", () => director<Storyboard>("storyboard",
      `${briefText()}\n\nConcept: ${concept.name} — ${concept.angle}\nHook: ${concept.hook}\nVideo idea: ${concept.videoPrompt}\nTotal length: about ${seconds} seconds; each shot 4–8 seconds.\nEvery shot prompt must include the product as described.`))
    if (r?.shots?.length) update({ storyboard: { ...r, shots: r.shots.map((s) => ({ ...s, seconds: Math.min(8, Math.max(4, Math.round(s.seconds))) })) } })
  }

  const videoAspect = /tiktok|reels|stories|shorts/i.test(c.brief.platform) ? "9:16" : "16:9"
  const shotModel = pick(config, ["veo-31-fast", "runway-gen45", "veo-31-lite"])

  async function makeShot(i: number, fromPhoto: boolean) {
    const sb = c.storyboard
    if (!sb) return
    const shot = sb.shots[i]
    const m = getModel(shotModel)!
    const durations = m.durations ?? [8]
    const duration = durations.reduce((best, d) => (Math.abs(d - shot.seconds) < Math.abs(best - shot.seconds) ? d : best), durations[0])
    const useRefs = !fromPhoto && m.provider === "google" && c.photos.length > 0
    await run(`shot-${i}`, async () => {
      const job = await generate({
        modelId: m.id,
        mode: fromPhoto ? "i2v" : "t2v",
        project: c.id,
        prompt: `${shot.prompt}. Camera: ${shot.camera}.${preserve}${m.audio === "native" ? " No dialogue; ambient sound only." : ""}`,
        params: { aspect: videoAspect, duration: useRefs ? 8 : duration, resolution: "720p" },
        imageRefs: fromPhoto ? c.photos.slice(0, 1).map((p) => p.assetId) : useRefs ? c.photos.slice(0, 3).map((p) => p.assetId) : [],
      })
      upsertJob(job)
      setC((x) => x.storyboard ? { ...x, storyboard: { ...x.storyboard, shots: x.storyboard.shots.map((s, k) => (k === i ? { ...s, jobId: job.id } : s)) } } : x)
    })
  }

  const layoutText = useMemo(
    () => ({ headline: concept?.headline ?? c.brief.product, body: concept?.body ?? "", offer: c.brief.offer, cta: concept?.cta ?? c.brief.cta }),
    [concept, c.brief.offer, c.brief.product, c.brief.cta],
  )

  const steps = [
    // 1 ─ Product
    <div key="p" className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-5">
        <UploadSlot label="Product photos" accept="image" assets={c.photos} max={3} onChange={(photos) => update({ photos })} disabled={!user}
          hint="Clear, well-lit photos of the real product. These are sent to the models as references." />
        <UploadSlot label="Product cut-out (optional)" accept="image" assets={c.cutout} max={1} onChange={(cutout) => update({ cutout })} disabled={!user}
          hint="A PNG with a transparent background. In the layout step it can be placed over the AI scene untouched, so the product is pixel-exact." />
        <button className="btn btn-signal" disabled={!c.photos.length || !!busy || !config?.director}
          onClick={() => run("analyse", async () => {
            const a = await director<Analysis>("analyse-product", c.brief.product, { imageRefs: c.photos.map((p) => p.assetId) })
            update({ analysis: a })
            if (a.productName && !c.brief.product) setBrief({ product: a.productName })
          })}>
          {busy === "analyse" ? <Spinner /> : <Icon name="sparkle" />} Analyse product
        </button>
        {!config?.director && <p className="hint">Analysis needs a Gemini or OpenAI key. You can also fill in the details yourself.</p>}
      </div>
      <div className="space-y-3">
        <h3 className="font-semibold">What the models must keep</h3>
        <p className="hint">Check this carefully — it's added to every prompt. Fix anything the analysis got wrong.</p>
        {(["colours", "materials", "visibleText", "distinctiveDetails"] as const).map((k) => (
          <div key={k}>
            <label className="label" htmlFor={`a-${k}`}>{{ colours: "Colours", materials: "Materials", visibleText: "Text printed on the product", distinctiveDetails: "Distinctive details" }[k]}</label>
            <textarea id={`a-${k}`} className="field min-h-16 text-sm" value={(c.analysis?.[k] ?? []).join("\n")} placeholder="One per line"
              onChange={(e) => update({ analysis: { ...(c.analysis ?? blankAnalysis()), [k]: e.target.value.split("\n") } })} />
          </div>
        ))}
        <div>
          <label className="label" htmlFor="a-clause">Accuracy instruction</label>
          <textarea id="a-clause" className="field min-h-20 text-sm" value={c.analysis?.preservationClause ?? ""}
            placeholder="Keep the bottle exactly as in the reference: matte black, gold cap, label reading VESSARA."
            onChange={(e) => update({ analysis: { ...(c.analysis ?? blankAnalysis()), preservationClause: e.target.value } })} />
        </div>
        {!!c.analysis?.uncertain?.length && <Notice tone="warn">Unsure about: {c.analysis.uncertain.join("; ")}</Notice>}
      </div>
    </div>,

    // 2 ─ Campaign
    <div key="b" className="grid gap-4 md:grid-cols-2">
      {([
        ["brand", "Brand name", "UNSOLVABLE"], ["product", "Product", "Problem Solver Hoodie"],
        ["audience", "Who it's for", "18–30 streetwear buyers in SA cities"], ["market", "Country and language", ""],
        ["offer", "Offer or price — only if real", "R899 · Free delivery over R1000"], ["cta", "Call to action", ""],
      ] as const).map(([k, label, ph]) => (
        <div key={k}>
          <label className="label" htmlFor={`b-${k}`}>{label}</label>
          <input id={`b-${k}`} className="field" value={c.brief[k]} placeholder={ph} onChange={(e) => setBrief({ [k]: e.target.value })} />
        </div>
      ))}
      <div className="md:col-span-2">
        <label className="label" htmlFor="b-points">Selling points you can back up</label>
        <textarea id="b-points" className="field min-h-20" value={c.brief.points} placeholder="400gsm brushed cotton; oversized fit; embroidered UX logo" onChange={(e) => setBrief({ points: e.target.value })} />
        <p className="hint mt-1">The director only uses what you write here and what's visible in the photos. It won't invent reviews, discounts or features.</p>
      </div>
      <ChipGroup label="Objective" value={c.brief.objective} options={OBJECTIVES} onChange={(objective) => setBrief({ objective })} />
      <ChipGroup label="Platform" value={c.brief.platform} options={PLATFORMS} onChange={(platform) => setBrief({ platform })} />
      <ChipGroup label="Style preset" value={c.brief.tone.split(":")[0]} options={PRESETS} onChange={(p) => setBrief({ tone: `${p}: ${c.brief.tone.split(":").slice(1).join(":").trim() || "confident"}` })} />
      <div>
        <label className="label" htmlFor="b-tone">Tone in your words</label>
        <input id="b-tone" className="field" value={c.brief.tone} onChange={(e) => setBrief({ tone: e.target.value })} />
      </div>
      <div className="flex gap-4">
        <label className="text-[13px] text-mist">Brand colour<input type="color" value={c.brief.primary} onChange={(e) => setBrief({ primary: e.target.value })} className="mt-1 block h-9 w-24 rounded border border-line bg-coal-2" /></label>
        <label className="text-[13px] text-mist">Accent<input type="color" value={c.brief.accent} onChange={(e) => setBrief({ accent: e.target.value })} className="mt-1 block h-9 w-24 rounded border border-line bg-coal-2" /></label>
      </div>
    </div>,

    // 3 ─ Concepts
    <div key="c" className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn btn-signal" disabled={!!busy || !config?.director || !c.brief.brand}
          onClick={() => run("brief", async () => {
            const r = await director<{ concepts: Concept[]; missing?: string[] }>("brief", briefText())
            if (r.concepts?.length) update({ concepts: r.concepts.slice(0, 3), active: 0 })
            if (r.missing?.length) setError(`To sharpen the concepts, add: ${r.missing.join("; ")}`)
          })}>
          {busy === "brief" ? <Spinner /> : <Icon name="sparkle" />} {c.concepts.length ? "Write new concepts" : "Write three concepts"}
        </button>
        {!c.brief.brand && <span className="hint">Add a brand name in Campaign first.</span>}
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        {c.concepts.map((cp, i) => (
          <article key={i} className={`space-y-2.5 rounded-[var(--radius-panel)] border p-4 ${i === c.active ? "border-signal" : "border-line"}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12px] font-semibold text-smoke">{FUNNEL[cp.funnel] ?? cp.funnel}</span>
              <button className="chip" aria-pressed={i === c.active} onClick={() => update({ active: i })}>{i === c.active ? "Selected" : "Use this"}</button>
            </div>
            <input className="field font-semibold" value={cp.name} onChange={(e) => editConcept(i, { name: e.target.value })} aria-label="Concept name" />
            <p className="text-[13px] text-mist">{cp.angle}</p>
            {(["hook", "headline", "body", "cta", "imagePrompt", "videoPrompt"] as const).map((k) => (
              <label key={k} className="block text-[12px] text-smoke">{{ hook: "Hook", headline: "Headline", body: "Body", cta: "Button", imagePrompt: "Image direction", videoPrompt: "Video direction" }[k]}
                <textarea className="field mt-1 min-h-12 text-[13px]" value={cp[k]} onChange={(e) => editConcept(i, { [k]: e.target.value })} />
              </label>
            ))}
          </article>
        ))}
      </div>
    </div>,

    // 4 ─ Create
    <div key="m" className="space-y-10">
      {!concept ? <Notice>Write and pick a concept first.</Notice> : (
        <>
          <section className="space-y-3">
            <h3 className="display text-3xl">Ad images</h3>
            <p className="hint max-w-2xl">Generates the scene around your product photo. Text, prices and logos are added in the next step, so they're exactly right.</p>
            <div className="flex flex-wrap gap-2">
              {(["1:1", "2:3", "9:16", "16:9"] as const).map((a) => (
                <button key={a} className="btn btn-ghost" disabled={!!busy || !canGenerate || !c.photos.length} onClick={() => makeImage(concept, a)}>
                  {busy === "image" ? <Spinner /> : <Icon name="image" />} Make {a} · {costLabel(estimateCost(pick(config, ["gpt-image-2", "runway-gen4-image"]), "i2i", { aspect: a, quality: "high", variations: 1, resolution: "1080p" }))}
                </button>
              ))}
            </div>
            {!c.photos.length && <p className="hint">Add a product photo in step 1.</p>}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {projectJobs.filter((j) => j.kind === "image").map((j) => <JobCard key={j.id} job={j} />)}
            </div>
          </section>

          <section className="space-y-4">
            <h3 className="display text-3xl">Video ad</h3>
            <div className="flex flex-wrap items-center gap-2">
              {[15, 30].map((s) => (
                <button key={s} className="btn btn-ghost" disabled={!!busy || !config?.director} onClick={() => writeStoryboard(s)}>
                  {busy === "storyboard" ? <Spinner /> : <Icon name="sparkle" />} Write a {s}s shot list
                </button>
              ))}
              <span className="hint">Shots render with {getModel(shotModel)?.label} in {videoAspect}.</span>
            </div>
            {c.storyboard && (
              <>
                <ol className="space-y-3">
                  {c.storyboard.shots.map((s, i) => {
                    const job = projectJobs.find((j) => j.id === s.jobId)
                    return (
                      <li key={i} className="grid gap-3 rounded-[var(--radius-panel)] border border-line p-4 md:grid-cols-[2rem_minmax(0,1fr)_260px]">
                        <span className="display text-3xl text-signal">{i + 1}</span>
                        <div className="space-y-2">
                          <input className="field font-semibold" value={s.title} onChange={(e) => editShot(i, { title: e.target.value })} aria-label="Shot title" />
                          <textarea className="field min-h-16 text-[13px]" value={s.prompt} onChange={(e) => editShot(i, { prompt: e.target.value })} aria-label="Shot prompt" />
                          <div className="grid gap-2 sm:grid-cols-2">
                            <input className="field text-[13px]" value={s.camera} onChange={(e) => editShot(i, { camera: e.target.value })} aria-label="Camera" />
                            <input className="field text-[13px]" value={s.caption} onChange={(e) => editShot(i, { caption: e.target.value })} aria-label="On-screen caption" />
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button className="btn btn-ghost py-1.5 text-sm" disabled={!!busy || !canGenerate || !c.photos.length} onClick={() => makeShot(i, true)} title="Starts from your real product photo — the most faithful option">
                              {busy === `shot-${i}` ? <Spinner /> : <Icon name="video" />} {s.jobId ? "Redo" : "Make"} from product photo
                            </button>
                            <button className="btn btn-quiet py-1.5 text-sm" disabled={!!busy || !canGenerate} onClick={() => makeShot(i, false)}>
                              {s.jobId ? "Redo" : "Make"} from prompt{getModel(shotModel)?.provider === "google" && c.photos.length ? " + product reference" : ""}
                            </button>
                          </div>
                        </div>
                        <div>{job ? <JobCard job={job} /> : <div className="grid h-full min-h-24 place-items-center rounded-[var(--radius-media)] border border-dashed border-line text-[13px] text-smoke">{s.seconds}s · not made yet</div>}</div>
                      </li>
                    )
                  })}
                </ol>
                <Voiceover storyboard={c.storyboard} onChange={(sb) => update({ storyboard: sb })} project={c.id} jobs={projectJobs} canGenerate={canGenerate && !!config?.providers.elevenlabs} />
                <AdPreview storyboard={c.storyboard} jobs={projectJobs} aspect={videoAspect} />
              </>
            )}
          </section>
        </>
      )}
    </div>,

    // 5 ─ Layout
    <Compositor
      key="l"
      backgrounds={[
        ...projectJobs.filter((j) => j.kind === "image" && j.status === "completed").flatMap((j) => j.outputs.map((o) => ({ id: o.assetId, url: o.url, label: j.prompt.slice(0, 60) }))),
        ...c.photos.map((p) => ({ id: p.assetId, url: p.url, label: "Your product photo" })),
      ]}
      cutoutUrl={c.cutout[0]?.url}
      initialText={layoutText}
      brandColors={{ primary: c.brief.primary, accent: c.brief.accent }}
      brandName={c.brief.brand}
    />,
  ]

  function editConcept(i: number, p: Partial<Concept>) {
    setC((x) => ({ ...x, concepts: x.concepts.map((cp, k) => (k === i ? { ...cp, ...p } : cp)) }))
  }
  function editShot(i: number, p: Partial<Shot>) {
    setC((x) => x.storyboard ? { ...x, storyboard: { ...x.storyboard, shots: x.storyboard.shots.map((s, k) => (k === i ? { ...s, ...p } : s)) } } : x)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display text-5xl">Ad Studio</h1>
          <p className="mt-1 max-w-2xl text-sm text-smoke">From a product photo to finished ads: the product is analysed, concepts are written for each funnel stage, scenes are generated around your real photo, and text is laid out exactly.</p>
        </div>
        <button className="btn btn-ghost" onClick={() => {
          if (!confirmNew) { setConfirmNew(true); setTimeout(() => setConfirmNew(false), 4000); return }
          setC(newCampaign()); setStep(0); setConfirmNew(false)
        }}>{confirmNew ? "Click again to clear this plan" : "New campaign"}</button>
      </div>
      <SetupGate config={config} models={[getModel("gpt-image-2")!, getModel("veo-31-fast")!, getModel("runway-gen45")!]} configError={configError} />
      <ol className="flex flex-wrap gap-1.5" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s}>
            <button onClick={() => setStep(i)} aria-current={i === step ? "step" : undefined}
              className={`flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors ${i === step ? "border-signal bg-signal text-ink" : "border-line text-mist hover:text-paper"}`}>
              <span className={i === step ? "" : "text-smoke"}>{i + 1}</span> {s}
            </button>
          </li>
        ))}
      </ol>
      {error && <Notice tone="error" action={<button className="btn btn-quiet" onClick={() => setError(null)}>Dismiss</button>}>{error}</Notice>}
      <div className="panel p-5 md:p-7">{steps[step]}</div>
      <div className="flex justify-between">
        <button className="btn btn-ghost" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>Back</button>
        {step < STEPS.length - 1 && <button className="btn btn-signal" onClick={() => setStep((s) => s + 1)}>Next: {STEPS[step + 1]}</button>}
      </div>
    </div>
  )
}

function blankAnalysis(): Analysis {
  return { productName: null, category: "", shape: "", colours: [], materials: [], visibleText: [], distinctiveDetails: [], preservationClause: "" }
}

function Voiceover({ storyboard, onChange, project, jobs, canGenerate }: { storyboard: Storyboard; onChange(s: Storyboard): void; project: string; jobs: JobView[]; canGenerate: boolean }) {
  const [voices, setVoices] = useState<{ id: string; name: string }[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    if (!canGenerate) return
    api<{ voices: { id: string; name: string }[] }>("/api/voices").then((r) => {
      setVoices(r.voices)
      if (!storyboard.voiceId && r.voices[0]) onChange({ ...storyboard, voiceId: r.voices[0].id })
    }).catch((e) => setErr((e as Error).message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canGenerate])
  const job = jobs.find((j) => j.id === storyboard.voJobId)
  return (
    <div className="grid gap-4 rounded-[var(--radius-panel)] border border-line p-4 md:grid-cols-[minmax(0,1fr)_320px]">
      <div>
        <label className="label" htmlFor="vo">Voiceover script</label>
        <textarea id="vo" className="field min-h-24" value={storyboard.voiceoverScript} onChange={(e) => onChange({ ...storyboard, voiceoverScript: e.target.value })} />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select className="field w-auto" value={storyboard.voiceId ?? ""} onChange={(e) => onChange({ ...storyboard, voiceId: e.target.value })} aria-label="Voice" disabled={!voices.length}>
            {voices.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
          <button className="btn btn-ghost" disabled={busy || !canGenerate || !storyboard.voiceId}
            onClick={async () => {
              setBusy(true); setErr(null)
              try {
                const j = await generate({ modelId: "eleven-v4", mode: "tts", prompt: storyboard.voiceoverScript, params: { voiceId: storyboard.voiceId }, project })
                upsertJob(j)
                onChange({ ...storyboard, voJobId: j.id })
              } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
            }}>
            {busy ? <Spinner /> : <Icon name="voice" />} {storyboard.voJobId ? "Redo" : "Make"} voiceover
          </button>
        </div>
        {!canGenerate && <p className="hint mt-1.5">Voiceover needs ELEVENLABS_API_KEY.</p>}
        {err && <p className="mt-1.5 text-[13px] text-[#ffb3ad]">{err}</p>}
      </div>
      <div>{job ? <JobCard job={job} /> : null}</div>
    </div>
  )
}

/** Plays finished shots in order with the voiceover and captions. A preview, not a rendered file. */
function AdPreview({ storyboard, jobs, aspect }: { storyboard: Storyboard; jobs: JobView[]; aspect: string }) {
  const shots = storyboard.shots.map((s) => ({ s, url: jobs.find((j) => j.id === s.jobId && j.status === "completed")?.outputs[0]?.url }))
  const ready = shots.filter((x) => x.url)
  const voUrl = jobs.find((j) => j.id === storyboard.voJobId && j.status === "completed")?.outputs[0]?.url
  const [i, setI] = useState(0)
  const [playing, setPlaying] = useState(false)
  const video = useRef<HTMLVideoElement>(null)
  const audio = useRef<HTMLAudioElement>(null)

  function start() {
    setI(0); setPlaying(true)
    if (audio.current) { audio.current.currentTime = 0; audio.current.play().catch(() => {}) }
  }
  useEffect(() => { if (playing) video.current?.play().catch(() => {}) }, [i, playing])

  function srt() {
    let t = 0
    const fmt = (s: number) => new Date(s * 1000).toISOString().slice(11, 23).replace(".", ",")
    const body = storyboard.shots.map((s, k) => { const a = t; t += s.seconds; return `${k + 1}\n${fmt(a)} --> ${fmt(t)}\n${s.caption || s.voiceover}\n` }).join("\n")
    const a = document.createElement("a")
    a.href = URL.createObjectURL(new Blob([body], { type: "text/plain" }))
    a.download = "captions.srt"
    a.click()
  }

  return (
    <div className="space-y-3 rounded-[var(--radius-panel)] border border-line p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-semibold">Preview the cut</h4>
        <div className="flex gap-2">
          <button className="btn btn-signal py-1.5 text-sm" disabled={!ready.length} onClick={start}><Icon name="play" /> Play {ready.length}/{shots.length} shots</button>
          <button className="btn btn-ghost py-1.5 text-sm" onClick={srt}><Icon name="download" /> Captions (.srt)</button>
        </div>
      </div>
      {ready.length > 0 && (
        <div className={`relative mx-auto overflow-hidden rounded-[var(--radius-media)] bg-ink ${aspect === "9:16" ? "aspect-[9/16] max-w-xs" : "aspect-video max-w-2xl"}`}>
          <video ref={video} src={ready[i % ready.length]?.url} playsInline muted={!!voUrl} className="h-full w-full object-cover"
            onEnded={() => { if (i + 1 < ready.length) setI(i + 1); else { setPlaying(false); audio.current?.pause() } }} />
          {playing && ready[i]?.s.caption && (
            <p className="absolute inset-x-4 bottom-[18%] text-center text-lg font-bold [text-shadow:0_2px_8px_#000]">{ready[i].s.caption}</p>
          )}
        </div>
      )}
      {voUrl && <audio ref={audio} src={voUrl} preload="auto" />}
      <p className="hint">This plays your finished shots in order with the voiceover so you can judge pacing. Download each shot and the voiceover from the cards above to edit them together; a one-click MP4 export is on the roadmap.</p>
    </div>
  )
}
