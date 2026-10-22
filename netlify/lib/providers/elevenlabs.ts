import { getModel } from "../../../shared/catalog.ts"
import { env, ProviderError, providerFetch, readProviderError } from "../util.ts"
import type { OutputSource, ProviderAdapter } from "./types.ts"

// https://elevenlabs.io/docs — xi-api-key auth, text-to-speech/{voice_id}. Verified 2026-10-22.
const BASE = "https://api.elevenlabs.io"

function key() {
  const k = env("ELEVENLABS_API_KEY")
  if (!k) throw new ProviderError("ElevenLabs isn't configured. Add ELEVENLABS_API_KEY in Netlify.")
  return k
}

export interface Voice { id: string; name: string; category?: string; labels?: Record<string, string>; previewUrl?: string }

export async function listVoices(): Promise<Voice[]> {
  const res = await providerFetch(`${BASE}/v2/voices?page_size=100`, { headers: { "xi-api-key": key() } })
  if (!res.ok) throw await readProviderError(res, "ElevenLabs")
  const data = (await res.json()) as { voices?: { voice_id: string; name: string; category?: string; labels?: Record<string, string>; preview_url?: string }[] }
  return (data.voices ?? []).map((v) => ({ id: v.voice_id, name: v.name, category: v.category, labels: v.labels, previewUrl: v.preview_url }))
}

export const elevenlabs: ProviderAdapter = {
  id: "elevenlabs",
  isConfigured: () => !!env("ELEVENLABS_API_KEY"),
  async run(job): Promise<OutputSource[]> {
    const p = job.params
    const res = await providerFetch(
      `${BASE}/v1/text-to-speech/${encodeURIComponent(p.voiceId!)}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: { "xi-api-key": key(), "Content-Type": "application/json", Accept: "audio/mpeg" },
        body: JSON.stringify({
          text: job.prompt,
          model_id: getModel(job.modelId)!.providerModel,
          voice_settings: { stability: p.stability ?? 0.5, similarity_boost: 0.75, speed: p.speed ?? 1 },
        }),
        timeoutMs: 300_000,
      },
    )
    if (!res.ok) throw await readProviderError(res, "ElevenLabs")
    return [{ data: await res.arrayBuffer(), contentType: "audio/mpeg" }]
  },
}
