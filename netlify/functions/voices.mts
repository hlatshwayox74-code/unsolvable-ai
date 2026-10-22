import type { Config } from "@netlify/functions"
import { requireActor } from "../lib/auth.ts"
import { listVoices } from "../lib/providers/elevenlabs.ts"
import { handleError, json } from "../lib/util.ts"

export default async () => {
  try {
    await requireActor()
    return json({ voices: await listVoices() }, 200, { "cache-control": "private, max-age=300" })
  } catch (e) {
    return handleError(e)
  }
}

export const config: Config = { path: "/api/voices", method: "GET" }
