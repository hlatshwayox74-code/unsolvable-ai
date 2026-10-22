import type { Config } from "@netlify/functions"
import { runJob, verifyInternalToken } from "../lib/jobs.ts"

/** Background worker (up to 15 minutes) for providers that answer synchronously: OpenAI images, ElevenLabs. */
export default async (req: Request) => {
  const body = (await req.json().catch(() => null)) as { owner?: string; id?: string } | null
  const token = req.headers.get("x-run-token") ?? ""
  if (!body?.owner || !body.id || !verifyInternalToken(body.id, token)) {
    console.warn("[unsolvable] run-job rejected an unauthenticated call")
    return
  }
  await runJob(body.owner, body.id, new URL(req.url).origin)
}

export const config: Config = { path: "/api/internal/run-job", method: "POST", background: true }
