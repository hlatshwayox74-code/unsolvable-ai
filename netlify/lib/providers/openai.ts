import { getModel, OPENAI_SIZE } from "../../../shared/catalog.ts"
import type { JobRecord } from "../store.ts"
import { env, ProviderError, providerFetch, readProviderError } from "../util.ts"
import type { OutputSource, ProviderAdapter, ResolvedInputs } from "./types.ts"

// https://developers.openai.com/api/docs/guides/image-generation — verified 2026-10-22.
const BASE = "https://api.openai.com/v1"

function key() {
  const k = env("OPENAI_API_KEY")
  if (!k) throw new ProviderError("OpenAI isn't configured. Add OPENAI_API_KEY in Netlify.")
  return k
}

export function openaiImageFields(job: JobRecord) {
  const p = job.params
  const format = p.transparent ? "png" : "webp"
  return {
    model: getModel(job.modelId)!.providerModel,
    prompt: job.prompt,
    size: OPENAI_SIZE[p.aspect ?? "1:1"],
    quality: p.quality ?? "medium",
    n: p.variations ?? 1,
    output_format: format,
    ...(p.transparent ? { background: "transparent" } : {}),
  }
}

export const openai: ProviderAdapter = {
  id: "openai",
  isConfigured: () => !!env("OPENAI_API_KEY"),
  async run(job, inputs: ResolvedInputs): Promise<OutputSource[]> {
    const fields = openaiImageFields(job)
    let res: Response
    if (job.mode === "i2i" && inputs.images.length) {
      const form = new FormData()
      for (const [k, v] of Object.entries(fields)) form.append(k, String(v))
      inputs.images.forEach((img, i) => form.append("image[]", new Blob([img.data], { type: img.contentType }), `ref${i + 1}`))
      res = await providerFetch(`${BASE}/images/edits`, {
        method: "POST", headers: { Authorization: `Bearer ${key()}` }, body: form, timeoutMs: 600_000,
      })
    } else {
      res = await providerFetch(`${BASE}/images/generations`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key()}`, "Content-Type": "application/json" },
        body: JSON.stringify(fields),
        timeoutMs: 600_000,
      })
    }
    if (!res.ok) throw await readProviderError(res, "OpenAI")
    const data = (await res.json()) as { data?: { b64_json?: string }[] }
    const outs = (data.data ?? []).filter((d) => d.b64_json)
    if (!outs.length) throw new ProviderError("OpenAI returned no image.")
    const contentType = fields.output_format === "png" ? "image/png" : "image/webp"
    return outs.map((d) => {
      const buf = Buffer.from(d.b64_json!, "base64")
      return { data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, contentType }
    })
  },
}
