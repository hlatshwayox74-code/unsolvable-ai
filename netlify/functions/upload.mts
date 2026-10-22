import type { Config } from "@netlify/functions"
import { requireGenerator } from "../lib/auth.ts"
import { putMedia } from "../lib/store.ts"
import { MAX_UPLOAD_BYTES, sniff } from "../lib/sniff.ts"
import { handleError, HttpError, json, newId } from "../lib/util.ts"

export default async (req: Request) => {
  try {
    const actor = await requireGenerator()
    const declared = Number(req.headers.get("content-length") ?? 0)
    if (declared > MAX_UPLOAD_BYTES) throw new HttpError(413, "Files must be 4 MB or smaller.", "too_large")
    const data = await req.arrayBuffer()
    if (data.byteLength === 0) throw new HttpError(400, "The file is empty.", "empty")
    if (data.byteLength > MAX_UPLOAD_BYTES) throw new HttpError(413, "Files must be 4 MB or smaller.", "too_large")
    const type = sniff(new Uint8Array(data.slice(0, 16)))
    if (!type) throw new HttpError(415, "Use a JPG, PNG or WebP image, or an MP4, MOV or WebM video.", "unsupported_type")
    const assetId = newId("ast")
    await putMedia(actor.id, assetId, data, { contentType: type.contentType, kind: type.kind, source: "upload" })
    return json({ assetId, url: `/api/media/${assetId}`, contentType: type.contentType, kind: type.kind, bytes: data.byteLength }, 201)
  } catch (e) {
    return handleError(e)
  }
}

export const config: Config = { path: "/api/upload", method: "POST" }
