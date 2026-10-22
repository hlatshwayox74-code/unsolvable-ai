import { ENGINE_COMPOSE_SIZE, ENGINE_IMAGE_SIZE, ENGINE_VIDEO_SIZE, getModel, type JobStatus, type Provenance } from "../../../shared/catalog.ts"
import type { JobRecord } from "../store.ts"
import { env, ProviderError, providerFetch, readProviderError } from "../util.ts"
import type { OutputSource, PollResult, ProviderAdapter, ResolvedInputs } from "./types.ts"

/**
 * The self-hosted Unsolvable engine (engine/ in this repo) running on our own GPU.
 * ENGINE_URL is its public https address; ENGINE_TOKEN is the shared secret it checks.
 */
export function engineBase(): string {
  const url = env("ENGINE_URL")
  const token = env("ENGINE_TOKEN")
  if (!url || !token) throw new ProviderError("The engine isn't connected. Add ENGINE_URL and ENGINE_TOKEN in Netlify.")
  if (!/^https:\/\//.test(url)) throw new ProviderError("ENGINE_URL must start with https://.")
  return url.replace(/\/+$/, "")
}

export function engineHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${env("ENGINE_TOKEN")}`, "Content-Type": "application/json" }
}

export function buildEngineRequest(job: JobRecord, inputs: ResolvedInputs): Record<string, unknown> {
  const model = getModel(job.modelId)!
  const p = job.params
  const params: Record<string, unknown> = {}
  if (p.seed !== undefined) params.seed = p.seed
  switch (job.mode) {
    case "t2i":
    case "i2i": {
      const [w, h] = ENGINE_IMAGE_SIZE[p.aspect ?? "1:1"] ?? ENGINE_IMAGE_SIZE["1:1"]
      Object.assign(params, { width: w, height: h, variations: p.variations ?? 1 })
      break
    }
    case "t2v":
    case "i2v": {
      const [w, h] = ENGINE_VIDEO_SIZE[p.aspect ?? "16:9"] ?? ENGINE_VIDEO_SIZE["16:9"]
      Object.assign(params, { width: w, height: h, duration: p.duration ?? 5 })
      if (p.negativePrompt) params.negativePrompt = p.negativePrompt
      break
    }
    case "tts":
      Object.assign(params, { voiceId: p.voiceId, speed: p.speed ?? 1 })
      break
    case "compose": {
      const [w, h] = ENGINE_COMPOSE_SIZE[p.aspect ?? "9:16"] ?? ENGINE_COMPOSE_SIZE["9:16"]
      Object.assign(params, { width: w, height: h, captions: p.captions ?? [], trimToVoice: !!p.trimToVoice })
      break
    }
    default:
      throw new ProviderError(`The engine can't run mode ${job.mode}.`)
  }
  return {
    model: model.providerModel,
    mode: job.mode,
    prompt: job.prompt,
    params,
    // The engine downloads inputs from short-lived signed links to our storage.
    imageUrls: inputs.images.map((i) => i.signedUrl),
    videoUrls: (inputs.videos ?? []).map((v) => v.signedUrl),
    ...(inputs.audio ? { audioUrl: inputs.audio.signedUrl } : {}),
  }
}

interface EngineJob {
  id: string
  status: JobStatus
  progress: number | null
  error: string | null
  model: string
  modelName?: string
  modelVersion?: string | null
  license?: string | null
  outputs: { index: number; contentType: string }[]
  metrics?: { seconds?: number; gpu?: string | null; peakVramGb?: number | null; estCostUsd?: number }
  quality?: { passed: boolean; checks: { name: string; passed: boolean }[] } | null
}

export function provenanceOf(j: EngineJob): Provenance {
  return {
    engine: "self-hosted",
    model: j.modelName ?? j.model,
    version: j.modelVersion ?? undefined,
    license: j.license ?? undefined,
    seconds: j.metrics?.seconds,
    gpu: j.metrics?.gpu ?? null,
    peakVramGb: j.metrics?.peakVramGb ?? null,
    gpuCostUsd: j.metrics?.estCostUsd,
    quality: j.quality ? { passed: j.quality.passed, failed: j.quality.checks.filter((c) => !c.passed).map((c) => c.name) } : undefined,
  }
}

export const engine: ProviderAdapter = {
  id: "engine",
  isConfigured: () => !!env("ENGINE_URL") && !!env("ENGINE_TOKEN"),

  async submit(job, inputs) {
    const res = await providerFetch(`${engineBase()}/v1/jobs`, {
      method: "POST",
      headers: engineHeaders(),
      body: JSON.stringify(buildEngineRequest(job, inputs)),
      timeoutMs: 60_000,
    })
    if (!res.ok) throw await readProviderError(res, "The engine")
    const data = (await res.json()) as { id?: string }
    if (!data.id) throw new ProviderError("The engine didn't return a job id.")
    return data.id
  },

  async poll(job): Promise<PollResult> {
    const base = engineBase()
    const res = await providerFetch(`${base}/v1/jobs/${encodeURIComponent(job.providerJobId!)}`, { headers: engineHeaders() })
    if (res.status === 404) return { status: "failed", error: "The engine lost this job (it may have restarted). Try again." }
    if (!res.ok) throw await readProviderError(res, "The engine")
    const j = (await res.json()) as EngineJob
    const provenance = provenanceOf(j)
    if (j.status === "completed") {
      const outputs: OutputSource[] = j.outputs.map((o) => ({
        url: `${base}/v1/jobs/${encodeURIComponent(j.id)}/outputs/${o.index}`,
        headers: { Authorization: `Bearer ${env("ENGINE_TOKEN")}` },
        contentType: o.contentType,
      }))
      return { status: "completed", outputs, provenance }
    }
    if (j.status === "failed") return { status: "failed", error: j.error ?? "The engine reported a failure.", provenance }
    return { status: j.status, progress: j.progress ?? undefined, provenance }
  },

  async cancel(job) {
    const res = await providerFetch(`${engineBase()}/v1/jobs/${encodeURIComponent(job.providerJobId!)}`, { method: "DELETE", headers: engineHeaders() })
    // A running job stops at its next step; the engine discards its output.
    return res.ok
  },
}

/** Lightweight status for the settings page. Never throws. */
export async function engineHealth(): Promise<{ online: boolean; gpu?: string | null; vramGb?: number; testMode?: boolean; queued?: number }> {
  if (!engine.isConfigured()) return { online: false }
  try {
    const res = await providerFetch(`${engineBase()}/v1/health`, { timeoutMs: 2500 })
    if (!res.ok) return { online: false }
    const h = (await res.json()) as { gpu?: { name?: string | null; vram_gb?: number }; testMode?: boolean; queued?: number }
    return { online: true, gpu: h.gpu?.name ?? null, vramGb: h.gpu?.vram_gb, testMode: h.testMode, queued: h.queued }
  } catch {
    return { online: false }
  }
}
