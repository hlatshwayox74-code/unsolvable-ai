import { getModel } from "../../../shared/catalog.ts"
import { env, ProviderError, providerFetch, readProviderError } from "../util.ts"
import type { PollResult, ProviderAdapter } from "./types.ts"

// https://docs.higgsfield.ai/docs/concepts/requests.md — submit / poll / cancel verified 2026-10-22.
const BASE = "https://api.higgsfield.ai"

function headers() {
  const k = env("HIGGSFIELD_API_KEY")
  if (!k) throw new ProviderError("The Higgsfield API isn't configured. Add HIGGSFIELD_API_KEY in Netlify.")
  return { Authorization: `Key ${k}`, "Content-Type": "application/json" }
}

export function mapHiggsfield(body: { status?: string; error?: string; video?: { url?: string }; images?: { url?: string }[] }): PollResult {
  switch (body.status) {
    case "queued": return { status: "queued" }
    case "in_progress": return { status: "processing" }
    case "completed": {
      const urls = [body.video?.url, ...(body.images ?? []).map((i) => i.url)].filter((u): u is string => !!u)
      return urls.length ? { status: "completed", outputs: urls.map((url) => ({ url })) } : { status: "failed", error: "Higgsfield returned no output." }
    }
    case "nsfw": return { status: "failed", error: "Higgsfield's content moderation rejected this request." }
    case "canceled": return { status: "canceled" }
    case "failed": return { status: "failed", error: body.error ? `Higgsfield couldn't finish: ${body.error}` : "Higgsfield couldn't finish." }
    default: return { status: "processing" }
  }
}

export const higgsfield: ProviderAdapter = {
  id: "higgsfield",
  isConfigured: () => !!env("HIGGSFIELD_API_KEY"),
  async submit(job) {
    const p = job.params
    const res = await providerFetch(`${BASE}/${getModel(job.modelId)!.providerModel}`, {
      method: "POST",
      headers: { ...headers(), "Idempotency-Key": job.id },
      body: JSON.stringify({
        prompt: job.prompt,
        resolution: p.resolution ?? "720p",
        duration: p.duration ?? 5,
        aspect_ratio: p.aspect ?? "16:9",
        generate_audio: true,
      }),
    })
    if (!res.ok) throw await readProviderError(res, "Higgsfield")
    const data = (await res.json()) as { request_id?: string }
    if (!data.request_id || !/^[\w-]{8,64}$/.test(data.request_id)) throw new ProviderError("Higgsfield didn't return a request id.")
    return data.request_id
  },
  async poll(job) {
    const res = await providerFetch(`${BASE}/requests/${job.providerJobId}/status`, { headers: headers() })
    if (!res.ok) throw await readProviderError(res, "Higgsfield")
    return mapHiggsfield(await res.json())
  },
  async cancel(job) {
    const res = await providerFetch(`${BASE}/requests/${job.providerJobId}/cancel`, { method: "POST", headers: headers() })
    return res.status === 202 // 400 means processing already started
  },
}
