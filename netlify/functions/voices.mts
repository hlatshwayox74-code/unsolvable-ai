import type { Config } from "@netlify/functions"
import { requireActor } from "../lib/auth.ts"
import { KOKORO_VOICES } from "../../shared/catalog.ts"
import { listVoices } from "../lib/providers/elevenlabs.ts"
import { externalAllowed } from "../lib/providers/index.ts"
import { handleError, json } from "../lib/util.ts"

/** Voices for a provider: ?provider=engine (Kokoro presets, the default) or ?provider=elevenlabs. */
export default async (req: Request) => {
  try {
    await requireActor()
    const provider = new URL(req.url).searchParams.get("provider") ?? "engine"
    if (provider !== "elevenlabs") return json({ voices: KOKORO_VOICES }, 200, { "cache-control": "private, max-age=3600" })
    if (!externalAllowed()) return json({ voices: [] })
    return json({ voices: await listVoices() }, 200, { "cache-control": "private, max-age=300" })
  } catch (e) {
    return handleError(e)
  }
}

export const config: Config = { path: "/api/voices", method: "GET" }
