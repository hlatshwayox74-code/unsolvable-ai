import type { Config, Context } from "@netlify/functions"
import { getUser } from "@netlify/identity"
import { verifyMediaSignature } from "../lib/sign.ts"
import { getMedia } from "../lib/store.ts"
import { handleError, HttpError } from "../lib/util.ts"

/** Serves private media to its owner, or to a provider holding a valid signed link. Supports Range for video. */
export default async (req: Request, context: Context) => {
  try {
    const { id } = context.params as { id: string }
    const url = new URL(req.url)
    let owner: string | null = null
    const o = url.searchParams.get("o"), e = url.searchParams.get("e"), s = url.searchParams.get("s")
    if (o && e && s) {
      if (!verifyMediaSignature(o, id, e, s)) throw new HttpError(403, "This link has expired.")
      owner = o
    } else {
      let user = null
      try { user = await getUser() } catch { user = null }
      if (!user) throw new HttpError(401, "Sign in to view this file.")
      owner = user.id
    }
    const m = await getMedia(owner, id)
    if (!m) throw new HttpError(404, "File not found.")

    const total = m.data.byteLength
    const headers: Record<string, string> = {
      "content-type": m.meta.contentType,
      "accept-ranges": "bytes",
      "cache-control": "private, max-age=3600",
      "x-content-type-options": "nosniff",
    }
    if (url.searchParams.get("download")) {
      const ext = m.meta.contentType.split("/")[1]?.replace("quicktime", "mov").replace("mpeg", "mp3") ?? "bin"
      headers["content-disposition"] = `attachment; filename="unsolvable-${id.slice(4, 12)}.${ext}"`
    }
    const range = req.headers.get("range")?.match(/^bytes=(\d*)-(\d*)$/)
    if (range) {
      const start = range[1] ? Number(range[1]) : Math.max(0, total - Number(range[2]))
      const end = range[1] && range[2] ? Math.min(Number(range[2]), total - 1) : total - 1
      if (start >= total || start > end) return new Response(null, { status: 416, headers: { "content-range": `bytes */${total}` } })
      return new Response(m.data.slice(start, end + 1), {
        status: 206,
        headers: { ...headers, "content-range": `bytes ${start}-${end}/${total}`, "content-length": String(end - start + 1) },
      })
    }
    return new Response(m.data, { headers: { ...headers, "content-length": String(total) } })
  } catch (e) {
    return handleError(e)
  }
}

export const config: Config = { path: "/api/media/:id", method: "GET" }
