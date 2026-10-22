/**
 * Unsolvable.ai model catalogue — the single source of truth for what each model can do
 * and what it costs. Imported by the React app (to render only valid controls) and by the
 * Netlify functions (to validate requests and compute cost estimates server-side).
 *
 * Every price here comes from the provider's official pricing page as read on 2026-10-22
 * (see docs/MODEL_RESEARCH.md). `priceBasis` says whether a price is verified or an estimate.
 */

export type ProviderId = "runway" | "google" | "openai" | "elevenlabs" | "higgsfield"
export type Kind = "image" | "video" | "audio"
export type Mode = "t2i" | "i2i" | "t2v" | "i2v" | "v2v" | "tts"
export type Aspect = "16:9" | "9:16" | "1:1" | "4:3" | "3:4" | "3:2" | "2:3" | "21:9"

export interface ModelDef {
  id: string
  provider: ProviderId
  providerModel: string
  label: string
  kind: Kind
  modes: Mode[]
  summary: string
  bestFor: string
  lifecycle: "stable" | "preview"
  aspects?: Partial<Record<Mode, Aspect[]>>
  durations?: number[]
  resolutions?: string[]
  qualities?: string[]
  maxVariations?: number
  maxRefImages?: number
  audio?: "native" | "none"
  negativePrompt?: boolean
  seed?: boolean
  transparentBackground?: boolean
  /** Constraint notes shown under the controls. */
  notes?: string[]
  priceBasis: "verified" | "estimate"
  priceNote: string
}

export const PROVIDERS: Record<ProviderId, { label: string; envKey: string; docs: string }> = {
  runway: { label: "Runway", envKey: "RUNWAY_API_KEY", docs: "https://docs.dev.runwayml.com/" },
  google: { label: "Google Gemini / Veo", envKey: "GEMINI_API_KEY", docs: "https://ai.google.dev/gemini-api/docs/veo" },
  openai: { label: "OpenAI", envKey: "OPENAI_API_KEY", docs: "https://developers.openai.com/api/docs/guides/image-generation" },
  elevenlabs: { label: "ElevenLabs", envKey: "ELEVENLABS_API_KEY", docs: "https://elevenlabs.io/docs" },
  higgsfield: { label: "Higgsfield API", envKey: "HIGGSFIELD_API_KEY", docs: "https://docs.higgsfield.ai/" },
}

/** Credits are a display unit: 1 credit = US$0.01 of provider cost × MARKUP. */
export const PRICING = { usdPerCredit: 0.01, markup: 1.5 } as const

const RUNWAY_I2V_ASPECTS: Aspect[] = ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"]

export const MODELS: ModelDef[] = [
  // ───────── Video ─────────
  {
    id: "runway-gen45", provider: "runway", providerModel: "gen4.5", label: "Runway Gen-4.5",
    kind: "video", modes: ["t2v", "i2v"], lifecycle: "stable",
    summary: "Cinematic motion with strong prompt following.",
    bestFor: "Hero shots, product reveals, cinematic b-roll",
    aspects: { t2v: ["16:9", "9:16"], i2v: RUNWAY_I2V_ASPECTS },
    durations: [5, 8, 10], seed: true, audio: "none",
    priceBasis: "verified", priceNote: "12 Runway credits per second ($0.12/s)",
  },
  {
    id: "runway-gen4-turbo", provider: "runway", providerModel: "gen4_turbo", label: "Runway Gen-4 Turbo",
    kind: "video", modes: ["i2v"], lifecycle: "stable",
    summary: "Fast, low-cost image-to-video drafts.",
    bestFor: "Testing motion ideas before a final render",
    aspects: { i2v: RUNWAY_I2V_ASPECTS }, durations: [5, 10], seed: true, audio: "none",
    priceBasis: "verified", priceNote: "5 Runway credits per second ($0.05/s)",
  },
  {
    id: "veo-31-fast", provider: "google", providerModel: "veo-3.1-fast-generate-preview", label: "Veo 3.1 Fast",
    kind: "video", modes: ["t2v", "i2v"], lifecycle: "preview",
    summary: "Video with native sound, dialogue and lip sync, at a low price.",
    bestFor: "Social ads with sound, talking scenes, product shots locked to references",
    aspects: { t2v: ["16:9", "9:16"], i2v: ["16:9", "9:16"] },
    durations: [4, 6, 8], resolutions: ["720p", "1080p", "4k"], maxRefImages: 3,
    audio: "native", negativePrompt: true,
    notes: ["1080p, 4K and reference images need an 8-second clip.", "Audio is always generated."],
    priceBasis: "verified", priceNote: "$0.10/s 720p · $0.12/s 1080p · $0.30/s 4K",
  },
  {
    id: "veo-31", provider: "google", providerModel: "veo-3.1-generate-preview", label: "Veo 3.1",
    kind: "video", modes: ["t2v", "i2v"], lifecycle: "preview",
    summary: "Google's highest-fidelity video model with native audio.",
    bestFor: "Final hero shots and dialogue where realism matters most",
    aspects: { t2v: ["16:9", "9:16"], i2v: ["16:9", "9:16"] },
    durations: [4, 6, 8], resolutions: ["720p", "1080p", "4k"], maxRefImages: 3,
    audio: "native", negativePrompt: true,
    notes: ["1080p, 4K and reference images need an 8-second clip.", "Audio is always generated."],
    priceBasis: "verified", priceNote: "$0.40/s 720p and 1080p · $0.60/s 4K",
  },
  {
    id: "veo-31-lite", provider: "google", providerModel: "veo-3.1-lite-generate-preview", label: "Veo 3.1 Lite",
    kind: "video", modes: ["t2v", "i2v"], lifecycle: "preview",
    summary: "The cheapest way to draft a shot with sound.",
    bestFor: "Storyboards and quick drafts",
    aspects: { t2v: ["16:9", "9:16"], i2v: ["16:9", "9:16"] },
    durations: [4, 6, 8], resolutions: ["720p", "1080p"], maxRefImages: 3,
    audio: "native", negativePrompt: true,
    notes: ["1080p and reference images need an 8-second clip."],
    priceBasis: "verified", priceNote: "$0.05/s 720p · $0.08/s 1080p",
  },
  {
    id: "runway-aleph2", provider: "runway", providerModel: "aleph2", label: "Runway Aleph 2",
    kind: "video", modes: ["v2v"], lifecycle: "stable",
    summary: "Edit an existing clip: restyle, relight, change the background.",
    bestFor: "Turning one shot into alternate versions",
    aspects: { v2v: ["16:9", "9:16", "1:1", "4:3", "3:4", "3:2", "2:3", "21:9"] }, seed: true, audio: "none",
    notes: ["Cost follows the length of the clip you upload (minimum 2 seconds billed)."],
    priceBasis: "verified", priceNote: "28 Runway credits per second ($0.28/s), $0.56 minimum",
  },
  {
    id: "higgsfield-seedance-2", provider: "higgsfield", providerModel: "bytedance/seedance-2.0/text-to-video",
    label: "Seedance 2.0 (Higgsfield API)", kind: "video", modes: ["t2v"], lifecycle: "stable",
    summary: "Realistic motion with optional sound, via the Higgsfield API.",
    bestFor: "An alternative look when Runway or Veo miss",
    aspects: { t2v: ["16:9", "9:16", "1:1"] }, durations: [5, 10], resolutions: ["720p", "1080p"], audio: "native",
    notes: ["Request fields follow Higgsfield's published example; confirm against the model page before production use."],
    priceBasis: "estimate", priceNote: "From $0.099/s (discounted) to $0.141/s list; estimated at list price",
  },

  // ───────── Image ─────────
  {
    id: "gpt-image-2", provider: "openai", providerModel: "gpt-image-2", label: "GPT Image 2",
    kind: "image", modes: ["t2i", "i2i"], lifecycle: "stable",
    summary: "Precise images with readable text and faithful edits from your references.",
    bestFor: "Product photography, ad backgrounds, edits that must keep details",
    aspects: { t2i: ["1:1", "3:2", "2:3", "16:9", "9:16"], i2i: ["1:1", "3:2", "2:3", "16:9", "9:16"] },
    qualities: ["low", "medium", "high"], maxVariations: 4, maxRefImages: 4, transparentBackground: true,
    priceBasis: "estimate", priceNote: "About $0.006–$0.21 per 1024² image depending on quality",
  },
  {
    id: "runway-gen4-image", provider: "runway", providerModel: "gen4_image", label: "Runway Gen-4 Image",
    kind: "image", modes: ["t2i", "i2i"], lifecycle: "stable",
    summary: "Keeps a character or product consistent across shots using tagged references.",
    bestFor: "A consistent person or product across a campaign",
    aspects: { t2i: ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"], i2i: ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"] },
    resolutions: ["720p", "1080p"], maxRefImages: 3, seed: true,
    notes: ["Refer to a reference in your prompt as @ref1, @ref2 or @ref3."],
    priceBasis: "verified", priceNote: "5 Runway credits at 720p ($0.05), 8 at 1080p ($0.08)",
  },

  // ───────── Audio ─────────
  {
    id: "eleven-v4", provider: "elevenlabs", providerModel: "eleven_v4", label: "ElevenLabs v4",
    kind: "audio", modes: ["tts"], lifecycle: "stable",
    summary: "The most expressive ElevenLabs voice model, 90+ languages.",
    bestFor: "Ad voiceovers, character dialogue",
    notes: ["Up to 10,000 characters per request."],
    priceBasis: "estimate", priceNote: "Billed by your ElevenLabs plan; estimated at $0.15 per 1,000 characters",
  },
  {
    id: "eleven-multilingual-v2", provider: "elevenlabs", providerModel: "eleven_multilingual_v2", label: "ElevenLabs Multilingual v2",
    kind: "audio", modes: ["tts"], lifecycle: "stable",
    summary: "Stable, natural narration in 29 languages.",
    bestFor: "Long-form narration and explainers",
    notes: ["Up to 10,000 characters per request."],
    priceBasis: "estimate", priceNote: "Billed by your ElevenLabs plan; estimated at $0.15 per 1,000 characters",
  },
  {
    id: "eleven-flash-v25", provider: "elevenlabs", providerModel: "eleven_flash_v2_5", label: "ElevenLabs Flash v2.5",
    kind: "audio", modes: ["tts"], lifecycle: "stable",
    summary: "Ultra-fast speech for previews and long scripts.",
    bestFor: "Checking timing before a final take",
    notes: ["Up to 40,000 characters per request."],
    priceBasis: "estimate", priceNote: "Billed by your ElevenLabs plan; estimated at $0.08 per 1,000 characters",
  },
]

export const MAX_CHARS: Record<string, number> = {
  "eleven-v4": 10000, "eleven-multilingual-v2": 10000, "eleven-flash-v25": 40000,
}

export function getModel(id: string): ModelDef | undefined {
  return MODELS.find((m) => m.id === id)
}

export function modelsFor(kind: Kind, mode?: Mode): ModelDef[] {
  return MODELS.filter((m) => m.kind === kind && (!mode || m.modes.includes(mode)))
}

export const MODE_LABEL: Record<Mode, string> = {
  t2i: "Text to image", i2i: "Edit with references", t2v: "Text to video",
  i2v: "Image to video", v2v: "Edit a video", tts: "Text to speech",
}

// ───────── Requests ─────────

export interface GenerationParams {
  aspect?: Aspect
  duration?: number
  resolution?: string
  quality?: string
  variations?: number
  seed?: number
  negativePrompt?: string
  transparent?: boolean
  /** v2v only: length of the uploaded clip in seconds (read in the browser for the estimate). */
  sourceSeconds?: number
  /** tts only */
  voiceId?: string
  stability?: number
  speed?: number
}

export interface GenerationRequest {
  modelId: string
  mode: Mode
  prompt: string
  params: GenerationParams
  /** Asset ids from /api/upload. First image is the start frame for i2v. */
  imageRefs?: string[]
  videoRef?: string
  /** Optional project/campaign grouping */
  project?: string
}

export interface ValidationResult {
  ok: boolean
  errors: string[]
  params: GenerationParams
}

const SEED_MAX = 4294967295

/** Validate and normalise a request against the catalogue. Pure; used on client and server. */
export function validateRequest(req: GenerationRequest): ValidationResult {
  const errors: string[] = []
  const m = getModel(req.modelId)
  if (!m) return { ok: false, errors: [`Unknown model "${req.modelId}".`], params: {} }
  if (!m.modes.includes(req.mode)) errors.push(`${m.label} can't do ${MODE_LABEL[req.mode] ?? req.mode}.`)

  const p: GenerationParams = {}
  const prompt = (req.prompt ?? "").trim()
  const maxPrompt = m.kind === "audio" ? (MAX_CHARS[m.id] ?? 5000) : 4000
  if (!prompt && req.mode !== "i2v") errors.push(m.kind === "audio" ? "Write the script to speak." : "Describe what you want to make.")
  if (prompt.length > maxPrompt) errors.push(`Keep it under ${maxPrompt.toLocaleString("en")} characters (you have ${prompt.length.toLocaleString("en")}).`)

  const refs = req.imageRefs ?? []
  if (req.mode === "i2v" && refs.length === 0) errors.push("Add a start image to animate.")
  if (req.mode === "i2i" && refs.length === 0) errors.push("Add at least one reference image.")
  if (req.mode === "v2v" && !req.videoRef) errors.push("Upload the clip you want to edit.")
  // i2v takes exactly one start frame; reference images are a t2v / image feature.
  const maxRefs = req.mode === "i2v" ? 1 : (m.maxRefImages ?? 0)
  if (refs.length > maxRefs) {
    errors.push(maxRefs === 0 ? `${m.label} doesn't take reference images in this mode.` : `${m.label} accepts up to ${maxRefs} image${maxRefs === 1 ? "" : "s"} here.`)
  }

  const aspects = m.aspects?.[req.mode]
  if (aspects) {
    p.aspect = req.params.aspect && aspects.includes(req.params.aspect) ? req.params.aspect : aspects[0]
    if (req.params.aspect && !aspects.includes(req.params.aspect)) errors.push(`${m.label} supports ${aspects.join(", ")} for this mode.`)
  }
  if (m.durations && req.mode !== "v2v") {
    const d = req.params.duration ?? m.durations[0]
    if (!m.durations.includes(d)) errors.push(`Duration must be one of ${m.durations.join(", ")} seconds.`)
    p.duration = d
  }
  if (m.resolutions) {
    const r = req.params.resolution ?? m.resolutions[0]
    if (!m.resolutions.includes(r)) errors.push(`Resolution must be one of ${m.resolutions.join(", ")}.`)
    p.resolution = r
  }
  if (m.qualities) {
    const q = req.params.quality ?? "medium"
    if (!m.qualities.includes(q)) errors.push(`Quality must be one of ${m.qualities.join(", ")}.`)
    p.quality = q
  }
  if (m.maxVariations) {
    const n = req.params.variations ?? 1
    if (!Number.isInteger(n) || n < 1 || n > m.maxVariations) errors.push(`Variations must be 1–${m.maxVariations}.`)
    p.variations = n
  }
  if (m.seed && req.params.seed !== undefined && req.params.seed !== null) {
    const s = Number(req.params.seed)
    if (!Number.isInteger(s) || s < 0 || s > SEED_MAX) errors.push("Seed must be a whole number from 0 to 4294967295.")
    else p.seed = s
  }
  if (m.negativePrompt && req.params.negativePrompt) p.negativePrompt = req.params.negativePrompt.slice(0, 1000)
  if (m.transparentBackground && req.params.transparent) p.transparent = true

  // Veo: 1080p, 4K and reference images require 8 s.
  if (m.provider === "google") {
    const extraRefs = req.mode === "t2v" ? refs.length : 0
    if ((p.resolution && p.resolution !== "720p") || extraRefs > 0) {
      if (p.duration !== 8) errors.push("1080p, 4K and reference images need an 8-second clip.")
    }
  }
  if (req.mode === "v2v") {
    const s = Number(req.params.sourceSeconds)
    if (!Number.isFinite(s) || s <= 0) errors.push("Couldn't read the clip length. Try a different file.")
    else if (s > 30) errors.push("Keep the clip to 30 seconds or less.")
    else p.sourceSeconds = Math.round(s * 10) / 10
  }
  if (m.kind === "audio") {
    if (!req.params.voiceId || !/^[A-Za-z0-9]{8,40}$/.test(req.params.voiceId)) errors.push("Pick a voice.")
    else p.voiceId = req.params.voiceId
    p.stability = clamp(req.params.stability ?? 0.5, 0, 1)
    p.speed = clamp(req.params.speed ?? 1, 0.7, 1.2)
  }
  return { ok: errors.length === 0, errors, params: p }
}

function clamp(n: number, lo: number, hi: number) {
  const v = Number(n)
  return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo
}

// ───────── Cost ─────────

export interface CostEstimate {
  usd: number
  credits: number
  basis: "verified" | "estimate"
  breakdown: string
}

const RES_PIXELS: Record<string, number> = { "1:1": 1, "3:2": 1.5, "2:3": 1.5, "16:9": 2.25, "9:16": 2.25 }
const GPT_IMAGE_BASE: Record<string, number> = { low: 0.011, medium: 0.053, high: 0.211 }

export function estimateCost(modelId: string, mode: Mode, params: GenerationParams, promptChars = 0): CostEstimate {
  const m = getModel(modelId)
  if (!m) return { usd: 0, credits: 0, basis: "estimate", breakdown: "Unknown model" }
  let usd = 0
  let breakdown = ""
  const sec = params.duration ?? m.durations?.[0] ?? 0
  switch (m.id) {
    case "runway-gen45": usd = 0.12 * sec; breakdown = `${sec}s × $0.12`; break
    case "runway-gen4-turbo": usd = 0.05 * sec; breakdown = `${sec}s × $0.05`; break
    case "runway-aleph2": {
      const s = params.sourceSeconds ?? 0
      usd = Math.max(0.56, 0.28 * s); breakdown = `${s}s × $0.28 (min $0.56)`; break
    }
    case "veo-31-fast": {
      const rate = params.resolution === "4k" ? 0.3 : params.resolution === "1080p" ? 0.12 : 0.1
      usd = rate * sec; breakdown = `${sec}s × $${rate.toFixed(2)}`; break
    }
    case "veo-31": {
      const rate = params.resolution === "4k" ? 0.6 : 0.4
      usd = rate * sec; breakdown = `${sec}s × $${rate.toFixed(2)}`; break
    }
    case "veo-31-lite": {
      const rate = params.resolution === "1080p" ? 0.08 : 0.05
      usd = rate * sec; breakdown = `${sec}s × $${rate.toFixed(2)}`; break
    }
    case "higgsfield-seedance-2": usd = 0.141 * sec; breakdown = `${sec}s × $0.141 (list price)`; break
    case "gpt-image-2": {
      const n = params.variations ?? 1
      const each = (GPT_IMAGE_BASE[params.quality ?? "medium"] ?? 0.053) * (RES_PIXELS[params.aspect ?? "1:1"] ?? 1)
      usd = each * n; breakdown = `${n} × ~$${each.toFixed(3)} (${params.quality ?? "medium"})`; break
    }
    case "runway-gen4-image": usd = params.resolution === "1080p" ? 0.08 : 0.05; breakdown = `1 image at ${params.resolution ?? "720p"}`; break
    case "eleven-v4": case "eleven-multilingual-v2": {
      usd = (promptChars / 1000) * 0.15; breakdown = `${promptChars.toLocaleString("en")} chars × ~$0.15/1k`; break
    }
    case "eleven-flash-v25": usd = (promptChars / 1000) * 0.08; breakdown = `${promptChars.toLocaleString("en")} chars × ~$0.08/1k`; break
  }
  usd = Math.round(usd * 1000) / 1000
  const credits = Math.max(1, Math.ceil((usd / PRICING.usdPerCredit) * PRICING.markup))
  return { usd, credits, basis: m.priceBasis, breakdown }
}

// ───────── Aspect → provider value maps ─────────

export const RUNWAY_VIDEO_RATIO: Record<string, string> = {
  "16:9": "1280:720", "9:16": "720:1280", "1:1": "960:960", "4:3": "1104:832", "3:4": "832:1104", "21:9": "1584:672",
}
export const RUNWAY_IMAGE_RATIO: Record<string, Record<string, string>> = {
  "720p": { "16:9": "1280:720", "9:16": "720:1280", "1:1": "720:720", "4:3": "960:720", "3:4": "720:960", "21:9": "1680:720" },
  "1080p": { "16:9": "1920:1080", "9:16": "1080:1920", "1:1": "1080:1080", "4:3": "1440:1080", "3:4": "1080:1440", "21:9": "2112:912" },
}
export const OPENAI_SIZE: Record<string, string> = {
  "1:1": "1024x1024", "3:2": "1536x1024", "2:3": "1024x1536", "16:9": "2048x1152", "9:16": "1152x2048",
}

export type JobStatus = "queued" | "processing" | "completed" | "failed" | "canceled"
export const TERMINAL: JobStatus[] = ["completed", "failed", "canceled"]

export interface JobOutput { assetId: string; url: string; contentType: string; kind: Kind }

export interface JobView {
  id: string
  kind: Kind
  mode: Mode
  modelId: string
  modelLabel: string
  prompt: string
  params: GenerationParams
  status: JobStatus
  progress?: number
  error?: string
  outputs: JobOutput[]
  cost: CostEstimate
  project?: string
  createdAt: string
  updatedAt: string
  completedAt?: string
}
