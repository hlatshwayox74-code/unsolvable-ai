import { useCallback, useEffect, useRef, useState } from "react"
import type { GenerationRequest, JobView, ModelDef, ProviderId } from "../../shared/catalog.ts"
import { PROVIDERS, TERMINAL } from "../../shared/catalog.ts"

export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string) {
    super(message)
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, { credentials: "same-origin", ...init })
  } catch {
    throw new ApiError("You're offline or the server can't be reached.", 0, "network")
  }
  const text = await res.text()
  let body: unknown = null
  try { body = text ? JSON.parse(text) : null } catch { body = null }
  if (!res.ok) {
    const b = body as { error?: string; code?: string } | null
    const fallback = res.status === 404
      ? "This feature's server isn't running. On your computer, start it with `netlify dev`."
      : `Request failed (${res.status}).`
    throw new ApiError(b?.error ?? fallback, res.status, b?.code)
  }
  return body as T
}

export interface AppConfig {
  providers: Record<ProviderId, boolean>
  /** False (the default) means third-party AI APIs are switched off and only the self-hosted engine generates. */
  externalProviders?: boolean
  engine?: { online: boolean; gpu?: string | null; vramGb?: number; testMode?: boolean; queued?: number }
  director: "gemini" | "openai" | "rules" | null
  storageReady: boolean
  credits: { enabled: boolean; balance: number | null }
  billing: { connected: boolean }
  generationRoles: string[]
  user: { id: string; email?: string; roles: string[]; canGenerate: boolean } | null
}

/** Models the person can use here: third-party models are hidden while external AI is switched off. */
export function visibleModels(config: AppConfig | null, models: ModelDef[]): ModelDef[] {
  if (config?.externalProviders) return models
  return models.filter((m) => !PROVIDERS[m.provider].external)
}

let configCache: { at: number; value: AppConfig } | null = null

export function useConfig(refreshKey?: unknown) {
  const [config, setConfig] = useState<AppConfig | null>(configCache?.value ?? null)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(async (force = false) => {
    if (!force && configCache && Date.now() - configCache.at < 15000) {
      setConfig(configCache.value)
      return
    }
    try {
      const value = await api<AppConfig>("/api/config")
      configCache = { at: Date.now(), value }
      setConfig(value)
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])
  useEffect(() => { load(true) }, [load, refreshKey])
  return { config, error, reload: () => load(true) }
}

export interface UploadResult { assetId: string; url: string; contentType: string; kind: "image" | "video"; bytes: number }

export const MAX_UPLOAD = 4 * 1024 * 1024

/** Shrinks large photos in the browser so they fit the 4 MB upload limit without losing useful detail. */
export async function prepareImage(file: File): Promise<Blob> {
  if (file.size <= MAX_UPLOAD && /^image\/(jpeg|png|webp)$/.test(file.type)) return file
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, 2560 / Math.max(bmp.width, bmp.height))
  const canvas = document.createElement("canvas")
  canvas.width = Math.round(bmp.width * scale)
  canvas.height = Math.round(bmp.height * scale)
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height)
  const keepAlpha = file.type === "image/png"
  for (const q of [0.92, 0.85, 0.75]) {
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, keepAlpha ? "image/png" : "image/jpeg", q))
    if (blob && blob.size <= MAX_UPLOAD) return blob
  }
  throw new ApiError("This image is too large even after resizing. Try a smaller one.", 413)
}

export async function upload(file: File): Promise<UploadResult> {
  const body = file.type.startsWith("image/") ? await prepareImage(file) : file
  if (body.size > MAX_UPLOAD) throw new ApiError("Files must be 4 MB or smaller. Trim or compress the clip and try again.", 413)
  return api<UploadResult>("/api/upload", { method: "POST", body, headers: { "content-type": "application/octet-stream" } })
}

export function generate(req: GenerationRequest) {
  return api<{ job: JobView }>("/api/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(req),
  }).then((r) => r.job)
}

export function director<T = Record<string, unknown>>(task: string, text: string, opts: { modelId?: string; imageRefs?: string[] } = {}) {
  return api<{ result: T }>("/api/director", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ task, text, ...opts }),
  }).then((r) => r.result)
}

/** Shared job list with polling while anything is running. */
const listeners = new Set<(jobs: JobView[]) => void>()
let jobsState: JobView[] = []
let polling: ReturnType<typeof setTimeout> | null = null
let lastError: string | null = null

function publish(jobs: JobView[]) {
  jobsState = jobs
  listeners.forEach((l) => l(jobs))
}

export function upsertJob(job: JobView) {
  const others = jobsState.filter((j) => j.id !== job.id)
  publish([job, ...others].sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
  schedulePoll(1500)
}

export function removeJob(id: string) {
  publish(jobsState.filter((j) => j.id !== id))
}

async function refresh() {
  try {
    const { jobs } = await api<{ jobs: JobView[] }>("/api/jobs")
    lastError = null
    publish(jobs)
  } catch (e) {
    lastError = (e as Error).message
    listeners.forEach((l) => l(jobsState))
  }
  const running = jobsState.some((j) => !TERMINAL.includes(j.status))
  if (running && listeners.size) schedulePoll(5000)
}

function schedulePoll(ms: number) {
  if (polling) clearTimeout(polling)
  polling = setTimeout(() => { polling = null; refresh() }, ms)
}

export function useJobs(enabled = true) {
  const [jobs, setJobs] = useState<JobView[]>(jobsState)
  const [error, setError] = useState<string | null>(lastError)
  const mounted = useRef(false)
  useEffect(() => {
    if (!enabled) return
    const l = (j: JobView[]) => { setJobs(j); setError(lastError) }
    listeners.add(l)
    if (!mounted.current) { mounted.current = true; refresh() }
    return () => { listeners.delete(l) }
  }, [enabled])
  return { jobs, error, refresh }
}

export async function cancelJob(id: string) {
  const { job } = await api<{ job: JobView }>(`/api/jobs/${id}/cancel`, { method: "POST" })
  upsertJob(job)
}

export async function deleteJob(id: string) {
  await api(`/api/jobs/${id}`, { method: "DELETE" })
  removeJob(id)
}
