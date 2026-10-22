import { getModel, RUNWAY_IMAGE_RATIO, RUNWAY_VIDEO_RATIO } from "../../../shared/catalog.ts"
import type { JobRecord } from "../store.ts"
import { env, ProviderError, providerFetch, readProviderError } from "../util.ts"
import type { PollResult, ProviderAdapter, ResolvedInputs } from "./types.ts"

// https://docs.dev.runwayml.com/api/ — base URL and version verified 2026-10-22.
const BASE = "https://api.dev.runwayml.com/v1"
const VERSION = "2024-11-06"

function headers() {
  const key = env("RUNWAY_API_KEY")
  if (!key) throw new ProviderError("Runway isn't configured. Add RUNWAY_API_KEY in Netlify.")
  return { Authorization: `Bearer ${key}`, "X-Runway-Version": VERSION, "Content-Type": "application/json" }
}

export function buildRunwayRequest(job: JobRecord, inputs: ResolvedInputs): { path: string; body: Record<string, unknown> } {
  const model = getModel(job.modelId)!
  const p = job.params
  const seed = p.seed !== undefined ? { seed: p.seed } : {}
  switch (job.mode) {
    case "t2v":
      return {
        path: "/text_to_video",
        body: { model: model.providerModel, promptText: job.prompt, ratio: RUNWAY_VIDEO_RATIO[p.aspect ?? "16:9"], duration: p.duration, ...seed },
      }
    case "i2v":
      return {
        path: "/image_to_video",
        body: {
          model: model.providerModel,
          promptImage: inputs.images[0].signedUrl,
          ...(job.prompt ? { promptText: job.prompt } : {}),
          ratio: RUNWAY_VIDEO_RATIO[p.aspect ?? "16:9"],
          duration: p.duration,
          ...seed,
        },
      }
    case "v2v":
      if (!inputs.video) throw new ProviderError("No video was attached.")
      return {
        path: "/video_to_video",
        body: { model: model.providerModel, videoUri: inputs.video.signedUrl, promptText: job.prompt, targetAspectRatio: p.aspect, ...seed },
      }
    case "t2i":
    case "i2i":
      return {
        path: "/text_to_image",
        body: {
          model: model.providerModel,
          promptText: job.prompt,
          ratio: RUNWAY_IMAGE_RATIO[p.resolution ?? "720p"][p.aspect ?? "16:9"],
          ...(inputs.images.length
            ? { referenceImages: inputs.images.map((img, i) => ({ uri: img.signedUrl, tag: `ref${i + 1}` })) }
            : {}),
          ...seed,
        },
      }
    default:
      throw new ProviderError(`Runway can't run mode ${job.mode}.`)
  }
}

export function mapRunwayTask(task: { status?: string; progress?: number; output?: string[]; failure?: string; failureCode?: string }): PollResult {
  switch (task.status) {
    case "PENDING":
    case "THROTTLED":
      return { status: "queued" }
    case "RUNNING":
      return { status: "processing", progress: typeof task.progress === "number" ? task.progress : undefined }
    case "SUCCEEDED":
      return { status: "completed", outputs: (task.output ?? []).map((url) => ({ url })) }
    case "CANCELLED":
      return { status: "canceled" }
    case "FAILED":
      return { status: "failed", error: friendlyFailure(task.failure, task.failureCode) }
    default:
      return { status: "processing" }
  }
}

function friendlyFailure(failure?: string, code?: string) {
  if (code?.startsWith("SAFETY")) return "Runway's content moderation blocked this request. Rephrase the prompt or change the reference."
  return failure ? `Runway couldn't finish: ${failure}` : "Runway couldn't finish this generation."
}

export const runway: ProviderAdapter = {
  id: "runway",
  isConfigured: () => !!env("RUNWAY_API_KEY"),
  async submit(job, inputs) {
    const { path, body } = buildRunwayRequest(job, inputs)
    const res = await providerFetch(BASE + path, { method: "POST", headers: headers(), body: JSON.stringify(body) })
    if (!res.ok) throw await readProviderError(res, "Runway")
    const data = (await res.json()) as { id?: string }
    if (!data.id) throw new ProviderError("Runway didn't return a task id.")
    return data.id
  },
  async poll(job) {
    const res = await providerFetch(`${BASE}/tasks/${encodeURIComponent(job.providerJobId!)}`, { headers: headers() })
    if (res.status === 404) return { status: "failed", error: "Runway no longer has this task." }
    if (!res.ok) throw await readProviderError(res, "Runway")
    return mapRunwayTask(await res.json())
  },
  async cancel(job) {
    const res = await providerFetch(`${BASE}/tasks/${encodeURIComponent(job.providerJobId!)}`, { method: "DELETE", headers: headers() })
    return res.ok || res.status === 404
  },
}
