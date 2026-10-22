import type { JobStatus, Provenance } from "../../../shared/catalog.ts"
import type { JobRecord } from "../store.ts"

export interface ImageInput {
  assetId: string
  contentType: string
  data: ArrayBuffer
  /** Absolute, short-lived signed URL the provider can fetch. */
  signedUrl: string
}

export interface VideoInput {
  assetId: string
  contentType: string
  signedUrl: string
}

export interface ResolvedInputs {
  images: ImageInput[]
  video?: VideoInput
  /** compose only: finished shots in order and an optional voiceover. */
  videos?: VideoInput[]
  audio?: VideoInput
}

/** Where to fetch a finished output from, or the bytes themselves. */
export type OutputSource =
  | { url: string; headers?: Record<string, string>; contentType?: string }
  | { data: ArrayBuffer; contentType: string }

export interface PollResult {
  status: JobStatus
  progress?: number
  error?: string
  outputs?: OutputSource[]
  provenance?: Provenance
}

export interface ProviderAdapter {
  id: string
  isConfigured(): boolean
  /** Async providers: start the job and return the provider's id. */
  submit?(job: JobRecord, inputs: ResolvedInputs): Promise<string>
  poll?(job: JobRecord): Promise<PollResult>
  cancel?(job: JobRecord): Promise<boolean>
  /** Sync providers: do the whole job (called from a background function). */
  run?(job: JobRecord, inputs: ResolvedInputs): Promise<OutputSource[]>
}
