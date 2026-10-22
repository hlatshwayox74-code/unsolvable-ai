import { getModel } from "../../../shared/catalog.ts"
import type { JobRecord } from "../store.ts"
import { bytesToBase64, env, ProviderError, providerFetch, readProviderError } from "../util.ts"
import type { PollResult, ProviderAdapter, ResolvedInputs } from "./types.ts"

// https://ai.google.dev/gemini-api/docs/veo — predictLongRunning + operations.get, verified 2026-10-22.
// The image / referenceImages field shapes follow the documented Veo instance schema
// (bytesBase64Encoded + mimeType); confirm on the first live run (see PROJECT_STATUS.md).
export const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta"

function key() {
  const k = env("GEMINI_API_KEY")
  if (!k) throw new ProviderError("Google Veo isn't configured. Add GEMINI_API_KEY in Netlify.")
  return k
}

export function buildVeoRequest(job: JobRecord, inputs: ResolvedInputs) {
  const p = job.params
  const instance: Record<string, unknown> = { prompt: job.prompt }
  const img = (i: { data: ArrayBuffer; contentType: string }) => ({ bytesBase64Encoded: bytesToBase64(i.data), mimeType: i.contentType })
  if (job.mode === "i2v" && inputs.images[0]) instance.image = img(inputs.images[0])
  if (job.mode === "t2v" && inputs.images.length) {
    instance.referenceImages = inputs.images.slice(0, 3).map((i) => ({ image: img(i), referenceType: "asset" }))
  }
  const parameters: Record<string, unknown> = {
    aspectRatio: p.aspect ?? "16:9",
    durationSeconds: p.duration ?? 8,
    resolution: p.resolution ?? "720p",
  }
  if (p.negativePrompt) parameters.negativePrompt = p.negativePrompt
  return { instances: [instance], parameters }
}

interface VeoOperation {
  name?: string
  done?: boolean
  error?: { message?: string }
  response?: {
    generateVideoResponse?: {
      generatedSamples?: { video?: { uri?: string } }[]
      raiMediaFilteredCount?: number
      raiMediaFilteredReasons?: string[]
    }
  }
}

export function mapVeoOperation(op: VeoOperation, apiKey: string): PollResult {
  if (!op.done) return { status: "processing" }
  if (op.error) return { status: "failed", error: `Veo couldn't finish: ${op.error.message ?? "unknown error"}` }
  const r = op.response?.generateVideoResponse
  const uris = (r?.generatedSamples ?? []).map((s) => s.video?.uri).filter((u): u is string => !!u)
  if (!uris.length) {
    const why = r?.raiMediaFilteredReasons?.[0]
    return { status: "failed", error: why ? `Google's safety filter removed the video: ${why}` : "Veo returned no video." }
  }
  // The download needs the API key; util.copyOutputs strips it on cross-origin redirects.
  return { status: "completed", outputs: uris.map((url) => ({ url, headers: { "x-goog-api-key": apiKey }, contentType: "video/mp4" })) }
}

export const google: ProviderAdapter = {
  id: "google",
  isConfigured: () => !!env("GEMINI_API_KEY"),
  async submit(job, inputs) {
    const model = getModel(job.modelId)!
    const res = await providerFetch(`${GEMINI_BASE}/models/${model.providerModel}:predictLongRunning`, {
      method: "POST",
      headers: { "x-goog-api-key": key(), "Content-Type": "application/json" },
      body: JSON.stringify(buildVeoRequest(job, inputs)),
    })
    if (!res.ok) throw await readProviderError(res, "Google Veo")
    const op = (await res.json()) as VeoOperation
    if (!op.name || !/^models\/[\w.-]+\/operations\/[\w-]+$/.test(op.name)) throw new ProviderError("Veo didn't return an operation id.")
    return op.name
  },
  async poll(job) {
    const res = await providerFetch(`${GEMINI_BASE}/${job.providerJobId}`, { headers: { "x-goog-api-key": key() } })
    if (!res.ok) throw await readProviderError(res, "Google Veo")
    return mapVeoOperation(await res.json(), key())
  },
}
