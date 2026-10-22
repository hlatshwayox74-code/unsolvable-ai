import type { Config } from "@netlify/functions"
import { requireGenerator } from "../lib/auth.ts"
import { runDirector, type DirectorTask } from "../lib/director.ts"
import { getMedia } from "../lib/store.ts"
import { handleError, HttpError, json } from "../lib/util.ts"

const TASKS: DirectorTask[] = ["enhance", "brief", "storyboard", "analyse-product"]

export default async (req: Request) => {
  try {
    const actor = await requireGenerator()
    const body = (await req.json().catch(() => null)) as { task?: string; text?: string; modelId?: string; imageRefs?: string[] } | null
    if (!body || !TASKS.includes(body.task as DirectorTask)) throw new HttpError(400, "Unknown task.")
    const text = String(body.text ?? "").slice(0, 6000)
    const images = []
    for (const id of (body.imageRefs ?? []).slice(0, 3)) {
      const m = await getMedia(actor.id, String(id))
      if (m && m.meta.kind === "image") images.push({ data: m.data, contentType: m.meta.contentType })
    }
    if (body.task === "analyse-product" && !images.length) throw new HttpError(400, "Upload a product photo first.")
    if (body.task !== "analyse-product" && !text.trim()) throw new HttpError(400, "Write something for the director to work with.")
    const result = await runDirector({ task: body.task as DirectorTask, text, modelId: body.modelId, images })
    return json({ result })
  } catch (e) {
    return handleError(e)
  }
}

export const config: Config = {
  path: "/api/director",
  method: "POST",
  rateLimit: { windowLimit: 30, windowSize: 60, aggregateBy: ["ip", "domain"] },
}
