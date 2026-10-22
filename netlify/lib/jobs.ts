import { createHmac, timingSafeEqual } from "node:crypto"
import { estimateCost, getModel, PROVIDERS, TERMINAL, validateRequest, type GenerationRequest, type JobOutput } from "../../shared/catalog.ts"
import type { Actor } from "./auth.ts"
import { refundCredits, reserveCredits } from "./credits.ts"
import { adapterFor, externalAllowed } from "./providers/index.ts"
import type { OutputSource, ResolvedInputs } from "./providers/types.ts"
import { signMediaPath } from "./sign.ts"
import { countActiveJobs, getMedia, loadJob, putMedia, saveJob, type JobRecord } from "./store.ts"
import { env, HttpError, ID_RE, newId, nowIso, ProviderError } from "./util.ts"

const MAX_ACTIVE_JOBS = 4
const POLL_INTERVAL_MS = 4000
const MAX_OUTPUT_BYTES = 200 * 1024 * 1024

/** Validate, price, reserve credits and submit. Returns the saved job. */
export async function createJob(actor: Actor, req: GenerationRequest, origin: string): Promise<JobRecord> {
  const v = validateRequest(req)
  if (!v.ok) throw new HttpError(400, v.errors.join(" "), "invalid_request")
  const model = getModel(req.modelId)!
  const adapter = adapterFor(model.provider)
  if (PROVIDERS[model.provider].external && !externalAllowed()) {
    throw new HttpError(403, `${model.label} is a third-party AI service, and those are switched off. Use a self-hosted model instead.`, "external_disabled")
  }
  if (!adapter.isConfigured()) {
    throw new HttpError(503, model.provider === "engine"
      ? "The self-hosted engine isn't connected yet. Add ENGINE_URL and ENGINE_TOKEN in Netlify (see docs/ENGINE.md)."
      : `${model.label} needs a ${model.provider} API key. Add it in Netlify → Environment variables.`, "provider_not_configured")
  }
  if ((await countActiveJobs(actor.id)) >= MAX_ACTIVE_JOBS) {
    throw new HttpError(429, `You already have ${MAX_ACTIVE_JOBS} generations running. Wait for one to finish.`, "too_many_jobs")
  }

  const job: JobRecord = {
    id: newId("job"),
    ownerId: actor.id,
    kind: model.kind,
    mode: req.mode,
    modelId: model.id,
    provider: model.provider,
    prompt: req.prompt.trim(),
    params: v.params,
    imageRefs: req.imageRefs ?? [],
    videoRef: req.videoRef,
    ...(req.mode === "compose" ? { videoRefs: (req.videoRefs ?? []).slice(0, 12), audioRef: req.audioRef } : {}),
    status: "queued",
    outputs: [],
    cost: estimateCost(model.id, req.mode, v.params, req.prompt.trim().length),
    creditsCharged: 0,
    project: req.project?.slice(0, 80),
    createdAt: nowIso(),
    updatedAt: nowIso(),
  }

  // Resolve inputs before charging, so a bad asset id never costs anything.
  const inputs = await resolveInputs(actor.id, job, origin)
  job.creditsCharged = await reserveCredits(actor.id, job.id, job.cost.credits)
  await saveJob(job)

  try {
    if (adapter.submit) {
      job.providerJobId = await adapter.submit(job, inputs)
      job.status = "processing"
      job.lastPolledAt = Date.now()
      await saveJob(job)
    } else if (adapter.run) {
      await triggerBackgroundRun(job, origin)
    }
  } catch (e) {
    await failJob(job, e instanceof ProviderError || e instanceof HttpError ? e.message : "Couldn't start the generation.")
  }
  return job
}

export async function resolveInputs(owner: string, job: Pick<JobRecord, "imageRefs" | "videoRef" | "videoRefs" | "audioRef">, origin: string): Promise<ResolvedInputs> {
  const images = []
  for (const id of job.imageRefs) {
    const m = await getMedia(owner, id)
    if (!m || m.meta.kind !== "image") throw new HttpError(400, "One of the reference images is missing. Upload it again.", "missing_asset")
    images.push({ assetId: id, contentType: m.meta.contentType, data: m.data, signedUrl: origin + signMediaPath(owner, id) })
  }
  let video: ResolvedInputs["video"]
  if (job.videoRef) {
    const m = await getMedia(owner, job.videoRef)
    if (!m || m.meta.kind !== "video") throw new HttpError(400, "The video to edit is missing. Upload it again.", "missing_asset")
    video = { assetId: job.videoRef, contentType: m.meta.contentType, signedUrl: origin + signMediaPath(owner, job.videoRef, 3600) }
  }
  const videos: NonNullable<ResolvedInputs["videos"]> = []
  for (const id of job.videoRefs ?? []) {
    const m = await getMedia(owner, id)
    if (!m || m.meta.kind !== "video") throw new HttpError(400, "One of the shots is missing. Make it again.", "missing_asset")
    videos.push({ assetId: id, contentType: m.meta.contentType, signedUrl: origin + signMediaPath(owner, id, 3600) })
  }
  let audio: ResolvedInputs["audio"]
  if (job.audioRef) {
    const m = await getMedia(owner, job.audioRef)
    if (!m || m.meta.kind !== "audio") throw new HttpError(400, "The voiceover is missing. Make it again.", "missing_asset")
    audio = { assetId: job.audioRef, contentType: m.meta.contentType, signedUrl: origin + signMediaPath(owner, job.audioRef, 3600) }
  }
  return { images, video, videos, audio }
}

export function internalToken(jobId: string): string {
  const s = env("MEDIA_SIGNING_SECRET") ?? ""
  return createHmac("sha256", "run-job:" + s).update(jobId).digest("base64url")
}

export function verifyInternalToken(jobId: string, token: string): boolean {
  if (!ID_RE.test(jobId) || !env("MEDIA_SIGNING_SECRET")) return false
  const a = Buffer.from(internalToken(jobId))
  const b = Buffer.from(token)
  return a.length === b.length && timingSafeEqual(a, b)
}

async function triggerBackgroundRun(job: JobRecord, origin: string) {
  const res = await fetch(`${origin}/api/internal/run-job`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-run-token": internalToken(job.id) },
    body: JSON.stringify({ owner: job.ownerId, id: job.id }),
  })
  if (res.status !== 202 && !res.ok) throw new HttpError(502, "Couldn't start the background worker.")
}

/** Background function body: run a synchronous provider to completion. */
export async function runJob(owner: string, id: string, origin: string): Promise<void> {
  const job = await loadJob(owner, id)
  if (!job || job.status !== "queued") return
  job.status = "processing"
  await saveJob(job)
  try {
    const adapter = adapterFor(getModel(job.modelId)!.provider)
    const inputs = await resolveInputs(owner, job, origin)
    const sources = await adapter.run!(job, inputs)
    job.outputs = await storeOutputs(job, sources)
    job.status = "completed"
    job.completedAt = nowIso()
    await saveJob(job)
  } catch (e) {
    await failJob(job, e instanceof ProviderError || e instanceof HttpError ? e.message : "The generation failed unexpectedly.")
  }
}

/** Poll an async provider (rate-limited per job) and finalise when done. */
export async function refreshJob(job: JobRecord): Promise<JobRecord> {
  if (TERMINAL.includes(job.status) || !job.providerJobId) return job
  if (job.lastPolledAt && Date.now() - job.lastPolledAt < POLL_INTERVAL_MS) return job
  const adapter = adapterFor(getModel(job.modelId)!.provider)
  if (!adapter.poll) return job
  job.lastPolledAt = Date.now()
  let r: Awaited<ReturnType<NonNullable<typeof adapter.poll>>>
  try {
    r = await adapter.poll(job)
  } catch (e) {
    // Transient errors leave the job running; it will be polled again.
    if (e instanceof ProviderError && e.retryable) { await saveJob(job); return job }
    await failJob(job, e instanceof Error ? e.message : "Status check failed.")
    return job
  }
  if (r.provenance) job.provenance = r.provenance
  if (r.status === "completed") {
    try {
      job.outputs = await storeOutputs(job, r.outputs ?? [])
      job.status = "completed"
      job.completedAt = nowIso()
      job.progress = undefined
    } catch (e) {
      await failJob(job, e instanceof Error ? e.message : "Couldn't save the result.")
      return job
    }
  } else if (r.status === "failed") {
    await failJob(job, r.error ?? "The provider reported a failure.")
    return job
  } else if (r.status === "canceled") {
    job.status = "canceled"
    await refundCredits(job.ownerId, job.id, job.creditsCharged, "canceled by provider")
  } else {
    job.status = r.status
    job.progress = r.progress
  }
  await saveJob(job)
  return job
}

export async function cancelJob(job: JobRecord): Promise<JobRecord> {
  if (TERMINAL.includes(job.status)) return job
  const adapter = adapterFor(getModel(job.modelId)!.provider)
  if (!adapter.cancel || !job.providerJobId) {
    throw new HttpError(409, "This model can't be stopped once it has started. You won't be able to cancel it.", "not_cancelable")
  }
  const ok = await adapter.cancel(job)
  if (!ok) throw new HttpError(409, "The provider has already started rendering, so it can't be cancelled now.", "not_cancelable")
  job.status = "canceled"
  await refundCredits(job.ownerId, job.id, job.creditsCharged, "canceled by user")
  await saveJob(job)
  return job
}

async function failJob(job: JobRecord, message: string) {
  job.status = "failed"
  job.error = message
  job.progress = undefined
  await refundCredits(job.ownerId, job.id, job.creditsCharged, message).catch((e) =>
    console.error("[unsolvable] refund failed for", job.id, (e as Error).message),
  )
  await saveJob(job)
}

/** Copy provider outputs into our private storage so links never expire. */
export async function storeOutputs(job: JobRecord, sources: OutputSource[]): Promise<JobOutput[]> {
  if (!sources.length) throw new ProviderError("The provider finished but returned nothing.")
  const out: JobOutput[] = []
  for (const src of sources) {
    let data: ArrayBuffer
    let contentType: string
    if ("data" in src) {
      data = src.data
      contentType = src.contentType
    } else {
      const res = await fetchOutput(src.url, src.headers)
      data = await res.arrayBuffer()
      contentType = src.contentType ?? res.headers.get("content-type")?.split(";")[0] ?? defaultType(job.kind)
    }
    if (data.byteLength === 0 || data.byteLength > MAX_OUTPUT_BYTES) throw new ProviderError("The provider's file was empty or too large to save.")
    const assetId = newId("ast")
    await putMedia(job.ownerId, assetId, data, { contentType, kind: job.kind, source: "output", jobId: job.id })
    out.push({ assetId, url: `/api/media/${assetId}`, contentType, kind: job.kind })
  }
  return out
}

/** Download an output; auth headers are only sent to the original host (never across a redirect). */
export async function fetchOutput(url: string, headers?: Record<string, string>, hops = 0): Promise<Response> {
  if (!/^https:\/\//.test(url)) throw new ProviderError("The provider returned an insecure output link.")
  const res = await fetch(url, { headers, redirect: "manual" })
  if (res.status >= 300 && res.status < 400) {
    const loc = res.headers.get("location")
    if (!loc || hops > 4) throw new ProviderError("Too many redirects while saving the result.")
    const next = new URL(loc, url)
    const sameOrigin = next.origin === new URL(url).origin
    return fetchOutput(next.toString(), sameOrigin ? headers : undefined, hops + 1)
  }
  if (!res.ok) throw new ProviderError(`Couldn't download the result (HTTP ${res.status}).`, res.status >= 500)
  return res
}

function defaultType(kind: string) {
  return kind === "video" ? "video/mp4" : kind === "audio" ? "audio/mpeg" : "image/png"
}
