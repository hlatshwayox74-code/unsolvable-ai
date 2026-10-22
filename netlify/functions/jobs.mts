import type { Config, Context } from "@netlify/functions"
import { requireActor } from "../lib/auth.ts"
import { cancelJob, refreshJob } from "../lib/jobs.ts"
import { deleteJob, deleteMedia, listJobs, loadJob, toView } from "../lib/store.ts"
import { handleError, HttpError, json } from "../lib/util.ts"

export default async (req: Request, context: Context) => {
  try {
    const actor = await requireActor()
    const { id, action } = context.params as { id?: string; action?: string }

    if (!id) {
      if (req.method !== "GET") throw new HttpError(405, "Method not allowed.")
      const all = await listJobs(actor.id, 80)
      // Refresh a few running jobs so the list stays live without a request per card.
      const running = all.filter((j) => j.status === "queued" || j.status === "processing").slice(0, 4)
      const refreshed = new Map((await Promise.all(running.map(refreshJob))).map((j) => [j.id, j]))
      return json({ jobs: all.map((j) => toView(refreshed.get(j.id) ?? j)) })
    }

    const job = await loadJob(actor.id, id)
    if (!job) throw new HttpError(404, "That generation doesn't exist or isn't yours.", "not_found")

    if (req.method === "GET" && !action) return json({ job: toView(await refreshJob(job)) })
    if (req.method === "POST" && action === "cancel") return json({ job: toView(await cancelJob(job)) })
    if (req.method === "DELETE" && !action) {
      if (job.status === "queued" || job.status === "processing") throw new HttpError(409, "Wait for it to finish or cancel it first.")
      await Promise.all(job.outputs.map((o) => deleteMedia(actor.id, o.assetId)))
      await deleteJob(actor.id, job.id)
      return json({ deleted: true })
    }
    throw new HttpError(405, "Method not allowed.")
  } catch (e) {
    return handleError(e)
  }
}

export const config: Config = { path: ["/api/jobs", "/api/jobs/:id", "/api/jobs/:id/:action"] }
