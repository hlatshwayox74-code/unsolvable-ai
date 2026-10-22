import type { Config, Context } from "@netlify/functions"
import type { GenerationRequest } from "../../shared/catalog.ts"
import { requireGenerator } from "../lib/auth.ts"
import { createJob } from "../lib/jobs.ts"
import { toView } from "../lib/store.ts"
import { handleError, HttpError, json } from "../lib/util.ts"

export default async (req: Request, context: Context) => {
  try {
    const actor = await requireGenerator()
    let body: GenerationRequest
    try {
      body = await req.json()
    } catch {
      throw new HttpError(400, "The request body must be JSON.")
    }
    if (!body || typeof body.modelId !== "string" || typeof body.mode !== "string" || typeof body.prompt !== "string") {
      throw new HttpError(400, "modelId, mode and prompt are required.")
    }
    body.params = body.params && typeof body.params === "object" ? body.params : {}
    body.imageRefs = Array.isArray(body.imageRefs) ? body.imageRefs.filter((r) => typeof r === "string").slice(0, 8) : []
    body.videoRefs = Array.isArray(body.videoRefs) ? body.videoRefs.filter((r) => typeof r === "string").slice(0, 12) : []
    body.audioRef = typeof body.audioRef === "string" ? body.audioRef : undefined
    const origin = new URL(req.url).origin || context.site?.url || ""
    const job = await createJob(actor, body, origin)
    return json({ job: toView(job) }, 201)
  } catch (e) {
    return handleError(e)
  }
}

export const config: Config = {
  path: "/api/generate",
  method: "POST",
  rateLimit: { windowLimit: 20, windowSize: 60, aggregateBy: ["ip", "domain"] },
}
