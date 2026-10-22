import { getStore } from "@netlify/blobs"
import type { CostEstimate, GenerationParams, JobOutput, JobStatus, JobView, Kind, Mode, Provenance } from "../../shared/catalog.ts"
import { getModel } from "../../shared/catalog.ts"
import { HttpError, ID_RE, nowIso } from "./util.ts"

/** Server-side job record. Never sent to the browser as-is (see toView). */
export interface JobRecord {
  id: string
  ownerId: string
  kind: Kind
  mode: Mode
  modelId: string
  provider: string
  providerJobId?: string
  prompt: string
  params: GenerationParams
  imageRefs: string[]
  videoRef?: string
  videoRefs?: string[]
  audioRef?: string
  status: JobStatus
  progress?: number
  error?: string
  outputs: JobOutput[]
  cost: CostEstimate
  creditsCharged: number
  provenance?: Provenance
  project?: string
  createdAt: string
  updatedAt: string
  completedAt?: string
  lastPolledAt?: number
}

// Strong consistency: a poll right after submit must see the job.
const jobs = () => getStore({ name: "jobs", consistency: "strong" })
const media = () => getStore({ name: "media", consistency: "strong" })

const jobKey = (owner: string, id: string) => `${safe(owner)}/${id}`
const mediaKey = (owner: string, id: string) => `${safe(owner)}/${id}`

function safe(owner: string) {
  if (!/^[A-Za-z0-9-]{1,64}$/.test(owner)) throw new HttpError(400, "Invalid account id.")
  return owner
}

export async function saveJob(job: JobRecord): Promise<void> {
  job.updatedAt = nowIso()
  await jobs().setJSON(jobKey(job.ownerId, job.id), job)
}

export async function loadJob(owner: string, id: string): Promise<JobRecord | null> {
  if (!ID_RE.test(id)) return null
  return (await jobs().get(jobKey(owner, id), { type: "json" })) as JobRecord | null
}

export async function listJobs(owner: string, limit = 60): Promise<JobRecord[]> {
  const { blobs } = await jobs().list({ prefix: `${safe(owner)}/` })
  // ids are random, so sort by the stored createdAt after loading the newest candidates
  const records = await Promise.all(
    blobs.slice(-400).map((b) => jobs().get(b.key, { type: "json" }) as Promise<JobRecord | null>),
  )
  return records
    .filter((r): r is JobRecord => !!r)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit)
}

export async function countActiveJobs(owner: string): Promise<number> {
  const recent = await listJobs(owner, 30)
  return recent.filter((j) => j.status === "queued" || j.status === "processing").length
}

export interface MediaMeta {
  contentType: string
  kind: "image" | "video" | "audio"
  source: "upload" | "output"
  jobId?: string
  createdAt: string
  bytes: number
  [k: string]: unknown
}

export async function putMedia(owner: string, id: string, data: ArrayBuffer, meta: Omit<MediaMeta, "createdAt" | "bytes">) {
  const full = { ...meta, createdAt: nowIso(), bytes: data.byteLength } as MediaMeta
  await media().set(mediaKey(owner, id), data, { metadata: full })
  return full
}

export async function getMedia(owner: string, id: string): Promise<{ data: ArrayBuffer; meta: MediaMeta } | null> {
  if (!ID_RE.test(id)) return null
  const r = await media().getWithMetadata(mediaKey(owner, id), { type: "arrayBuffer" })
  if (!r) return null
  return { data: r.data as ArrayBuffer, meta: r.metadata as MediaMeta }
}

export async function deleteMedia(owner: string, id: string) {
  if (ID_RE.test(id)) await media().delete(mediaKey(owner, id))
}

export async function deleteJob(owner: string, id: string) {
  if (ID_RE.test(id)) await jobs().delete(jobKey(owner, id))
}

export function toView(job: JobRecord): JobView {
  return {
    id: job.id,
    kind: job.kind,
    mode: job.mode,
    modelId: job.modelId,
    modelLabel: getModel(job.modelId)?.label ?? job.modelId,
    prompt: job.prompt,
    params: job.params,
    status: job.status,
    progress: job.progress,
    error: job.error,
    outputs: job.outputs,
    cost: job.cost,
    provenance: job.provenance,
    project: job.project,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    completedAt: job.completedAt,
  }
}
