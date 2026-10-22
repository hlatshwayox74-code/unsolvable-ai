import { animate, createTimeline, stagger } from "animejs"
import { useEffect, useRef, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { estimateCost, MODELS, PROVIDERS } from "../../shared/catalog.ts"
import { XMark } from "../components/brand.tsx"
import { Icon } from "../components/ui.tsx"
import { usd } from "../lib/format.ts"

const DEMO_PROMPTS = [
  "Slow push-in on a black hoodie hanging in an empty concrete garage, a single shaft of morning light, dust in the air",
  "A carry-on suitcase rolls itself across a wet airport floor at night, reflections of departure boards, low tracking shot",
  "Overhead shot of hands snapping a magnetic power bank onto a phone, marble desk, soft window light, crisp detail",
]

const TOOLS = [
  {
    id: "image", name: "Image", to: "/studio/image",
    in: "A prompt, plus up to four of your own photos as references",
    out: "One to four images, up to 1536 px, rendered on our own GPU",
    models: "FLUX.2 [klein] 4B (self-hosted, Apache 2.0)",
    from: estimateCost("flux2-klein-4b", "t2i", { aspect: "1:1", variations: 1 }).usd,
    detail: "Product shots, campaign stills and edits that keep the details of what you upload.",
  },
  {
    id: "video", name: "Video", to: "/studio/video",
    in: "A written shot, or a start frame from your photos",
    out: "5-second 720p clips at 24 fps; add sound with a voiceover in Ad Studio",
    models: "Wan 2.2 TI2V-5B (self-hosted, Apache 2.0)",
    from: estimateCost("wan22-ti2v-5b", "t2v", { duration: 5 }).usd,
    detail: "Write the camera move and the light; animate a product photo without losing the product.",
  },
  {
    id: "voice", name: "Voice", to: "/studio/voice",
    in: "A script and one of 12 preset voices",
    out: "A WAV voiceover in US or UK English, with pace control",
    models: "Kokoro-82M (self-hosted, Apache 2.0)",
    from: estimateCost("kokoro-82m", "tts", {}, 300).usd,
    detail: "Clear reads for ads and explainers, made on our own server.",
  },
  {
    id: "ads", name: "Ad Studio", to: "/studio/ads",
    in: "Your product photo, brand, offer and audience",
    out: "Three funnel-stage concepts, ad images in every placement size, and one finished MP4 with voiceover and captions",
    models: "All of the above, plus the ad assembler",
    from: null,
    detail: "Headlines, prices and logos are laid out exactly as you typed them — never drawn by the AI.",
  },
] as const

const STEPS = [
  ["Upload the product", "Your real photos become the reference for every scene."],
  ["Check what must stay", "The product is described — colours, materials, printed text — and you correct it."],
  ["Pick a concept", "Three ideas: one to stop the scroll, one to explain, one to sell. Nothing invented."],
  ["Generate the scenes", "Images and video shots around your product. Redo any single shot."],
  ["Add voice", "A voiceover from the script, timed to the shots."],
  ["Lay out and export", "Exact text, price and logo in each placement, with safe zones."],
]

export default function Home() {
  const hero = useRef<HTMLDivElement>(null)
  const [prompt, setPrompt] = useState("")
  const [touched, setTouched] = useState(false)
  const [tool, setTool] = useState<(typeof TOOLS)[number]["id"]>("image")
  const nav = useNavigate()

  // One orchestrated entrance: the X cuts in, then the prompt types itself.
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (reduce || !hero.current) { setPrompt(DEMO_PROMPTS[0]); return }
    const root = hero.current
    const tl = createTimeline({ defaults: { ease: "outExpo" } })
    tl.add(root.querySelectorAll(".x-bar"), { scaleX: [0, 1], duration: 900, delay: stagger(140) })
      .add(root.querySelectorAll(".hero-line"), { opacity: [0, 1], translateY: [24, 0], duration: 700, delay: stagger(90) }, "-=600")
      .add(root.querySelector(".prompt-card")!, { opacity: [0, 1], scale: [0.96, 1], duration: 600 }, "-=500")
    return () => { tl.pause() }
  }, [])

  useEffect(() => {
    if (touched || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    let i = 0, n = 0, alive = true
    let timer: ReturnType<typeof setTimeout>
    const tick = () => {
      if (!alive) return
      const full = DEMO_PROMPTS[i % DEMO_PROMPTS.length]
      if (n <= full.length) { setPrompt(full.slice(0, n)); n += 2; timer = setTimeout(tick, 28) }
      else { timer = setTimeout(() => { i++; n = 0; tick() }, 2600) }
    }
    timer = setTimeout(tick, 1500)
    return () => { alive = false; clearTimeout(timer) }
  }, [touched])

  const demoCost = estimateCost("wan22-ti2v-5b", "t2v", { duration: 5, aspect: "16:9" })
  const active = TOOLS.find((t) => t.id === tool)!

  function pulse(el: HTMLElement | null) {
    if (el && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) animate(el, { opacity: [0.4, 1], duration: 350, ease: "outQuad" })
  }

  return (
    <>
      {/* ── Hero ── */}
      <section ref={hero} className="relative overflow-hidden border-b border-line">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute left-[58%] top-1/2 h-0 w-0">
            <div className="x-bar absolute left-1/2 top-1/2 h-24 w-[220vmax] origin-center -translate-x-1/2 -translate-y-1/2 rotate-[58deg] bg-signal md:h-36" />
            <div className="x-bar absolute left-1/2 top-1/2 h-24 w-[220vmax] origin-center -translate-x-1/2 -translate-y-1/2 -rotate-[58deg] bg-signal md:h-36" />
          </div>
        </div>
        <div className="relative mx-auto grid min-h-[calc(100dvh-64px)] max-w-[1320px] items-center gap-10 px-5 py-16 md:px-8 lg:grid-cols-[1.05fr_1fr]">
          <div className="relative z-10 max-w-xl [text-shadow:0_2px_30px_#000]">
            <h1 className="display text-[clamp(4.2rem,11vw,9.5rem)]">
              <span className="hero-line block">Type the idea.</span>
              <span className="hero-line block">Get the film.</span>
            </h1>
            <p className="hero-line mt-6 max-w-md text-lg leading-relaxed text-mist">
              Images, video with sound, voiceovers and ready-to-post ads from a sentence or a product photo — made on our own GPU with open models, with the cost shown before you press generate.
            </p>
            <div className="hero-line mt-8 flex flex-wrap gap-3">
              <Link to="/studio/ads" className="btn btn-signal px-5 py-3 text-base">Make an ad from a photo</Link>
              <Link to="/models" className="btn btn-ghost bg-ink px-5 py-3 text-base">See the models</Link>
            </div>
          </div>

          <form
            className="prompt-card relative z-10 w-full max-w-lg justify-self-center rounded-[20px] border border-line bg-ink p-5 shadow-[0_30px_80px_-20px_#000] lg:justify-self-end"
            onSubmit={(e) => { e.preventDefault(); nav(`/studio/video?prompt=${encodeURIComponent(prompt)}`) }}
          >
            <label htmlFor="hero-prompt" className="text-sm font-semibold text-mist">Describe a shot</label>
            <textarea
              id="hero-prompt"
              value={prompt}
              onFocus={() => setTouched(true)}
              onChange={(e) => { setTouched(true); setPrompt(e.target.value) }}
              rows={5}
              className="mt-2 w-full resize-none bg-transparent text-xl leading-snug text-paper outline-none placeholder:text-coal-3"
              placeholder="A hoodie on a concrete plinth, hard noon light…"
            />
            <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[13px]">
              <span className="chip" aria-pressed="true">Wan 2.2 · self-hosted</span>
              <span className="chip">16:9</span>
              <span className="chip">5s</span>
            </div>
            <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-4">
              <span className="text-[13px] text-smoke">≈{usd(demoCost.usd)} GPU time</span>
              <button type="submit" className="btn btn-signal" disabled={!prompt.trim()}>Open in studio <Icon name="arrow" /></button>
            </div>
          </form>
        </div>
      </section>

      {/* ── Tools ── */}
      <section className="mx-auto max-w-[1320px] px-5 py-24 md:px-8">
        <h2 className="display max-w-3xl text-6xl md:text-7xl">Four tools that hand work to each other.</h2>
        <p className="mt-4 max-w-xl text-mist">Turn a generated still into a video with one click. Send an ad's script to Voice. Everything you make lands in one library.</p>
        <div className="mt-12 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div role="tablist" aria-label="Tools" className="border-t border-line">
            {TOOLS.map((t) => (
              <button
                key={t.id}
                role="tab"
                id={`tab-${t.id}`}
                aria-selected={tool === t.id}
                aria-controls="tool-panel"
                onClick={() => { setTool(t.id); pulse(document.getElementById("tool-panel")) }}
                onMouseEnter={() => setTool(t.id)}
                className={`group flex w-full items-baseline justify-between gap-4 border-b border-line py-5 text-left transition-colors ${tool === t.id ? "text-paper" : "text-coal-3 hover:text-mist"}`}
              >
                <span className="display text-6xl md:text-7xl">{t.name}</span>
                <XMark className={`h-7 w-7 shrink-0 transition-all duration-300 ${tool === t.id ? "rotate-0 text-signal" : "-rotate-45 text-transparent"}`} />
              </button>
            ))}
          </div>
          <div id="tool-panel" role="tabpanel" aria-labelledby={`tab-${active.id}`} className="panel flex flex-col p-6 md:p-8">
            <p className="text-xl leading-snug">{active.detail}</p>
            <dl className="mt-8 grid gap-5 text-sm">
              <div><dt className="text-smoke">Goes in</dt><dd className="mt-1 text-[15px]">{active.in}</dd></div>
              <div><dt className="text-smoke">Comes out</dt><dd className="mt-1 text-[15px]">{active.out}</dd></div>
              <div><dt className="text-smoke">Models</dt><dd className="mt-1 text-[15px]">{active.models}</dd></div>
              <div><dt className="text-smoke">From</dt><dd className="mt-1 text-[15px]">{active.from !== null ? `about ${usd(active.from)} per output in GPU time` : "the sum of the pieces you generate"}</dd></div>
            </dl>
            <Link to={active.to} className="btn btn-signal mt-8 self-start">Open {active.name}</Link>
          </div>
        </div>
      </section>

      {/* ── Ad pipeline (a real sequence) ── */}
      <section className="border-y border-line bg-coal">
        <div className="mx-auto max-w-[1320px] px-5 py-24 md:px-8">
          <h2 className="display max-w-4xl text-6xl md:text-7xl">From one product photo to a campaign.</h2>
          <p className="mt-4 max-w-2xl text-mist">AI video can warp a label or change a colour. Ad Studio is built around that: the product is checked at every step, and the words on your ad are never left to the model.</p>
          <ol className="mt-14 grid gap-px overflow-hidden rounded-[var(--radius-panel)] border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
            {STEPS.map(([t, d], i) => (
              <li key={t} className="bg-ink p-6">
                <span className="display text-5xl text-signal">{i + 1}</span>
                <h3 className="mt-3 text-lg font-semibold">{t}</h3>
                <p className="mt-1 text-sm leading-relaxed text-smoke">{d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── Prices ── */}
      <section className="mx-auto max-w-[1320px] px-5 py-24 md:px-8">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <h2 className="display text-6xl md:text-7xl">The price, before you press go.</h2>
            <p className="mt-4 max-w-xl text-mist">Our own engine costs GPU time, not per-generation fees. The studio shows the estimate for your exact settings on every Generate button.</p>
          </div>
          <Link to="/pricing" className="btn btn-ghost">How credits work</Link>
        </div>
        <div className="mt-10 overflow-x-auto rounded-[var(--radius-panel)] border border-line">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-coal text-[12.5px] text-smoke">
              <tr><th className="px-5 py-3 font-semibold">Model</th><th className="px-5 py-3 font-semibold">Best for</th><th className="px-5 py-3 font-semibold">Cost basis</th></tr>
            </thead>
            <tbody>
              {MODELS.filter((m) => m.kind !== "audio" && !PROVIDERS[m.provider].external && !m.modes.includes("compose")).map((m) => (
                <tr key={m.id} className="border-t border-line">
                  <td className="px-5 py-3.5 font-semibold">{m.label}{m.lifecycle === "preview" && <span className="ml-2 text-[11px] font-semibold text-smoke">Preview</span>}</td>
                  <td className="px-5 py-3.5 text-mist">{m.bestFor}</td>
                  <td className="px-5 py-3.5 text-mist">{m.priceNote}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Commitments ── */}
      <section className="border-t border-line">
        <div className="mx-auto grid max-w-[1320px] gap-10 px-5 py-24 md:px-8 lg:grid-cols-[1fr_1.4fr]">
          <h2 className="display text-6xl md:text-7xl">No fake numbers.</h2>
          <ul className="grid gap-6 sm:grid-cols-2">
            {[
              ["Real progress only", "When a provider doesn't report progress, you see elapsed time — not an invented percentage."],
              ["Real failures", "If a job fails, you see why, and any reserved credits come back automatically."],
              ["No invented claims", "The creative director won't write reviews, discounts or product features you didn't give it."],
              ["Your files stay private", "Uploads and results are stored privately and only open for your account."],
            ].map(([t, d]) => (
              <li key={t}>
                <h3 className="font-semibold">{t}</h3>
                <p className="mt-1 text-sm leading-relaxed text-smoke">{d}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── Close ── */}
      <section className="bg-signal text-ink">
        <div className="mx-auto flex max-w-[1320px] flex-col items-start justify-between gap-8 px-5 py-20 md:flex-row md:items-end md:px-8">
          <p className="display text-[clamp(4.5rem,14vw,12rem)]">Beyond limits.</p>
          <Link to="/studio" className="btn bg-ink px-6 py-3.5 text-base text-paper hover:bg-coal-2">Open the studio</Link>
        </div>
      </section>
    </>
  )
}
