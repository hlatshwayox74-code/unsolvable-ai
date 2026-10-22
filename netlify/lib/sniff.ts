// Netlify's buffered request limit is 6 MB including encoding overhead, so keep files ≤ 4 MB.
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024

/** Identify a file from its first bytes. The browser-supplied type is never trusted. */
export function sniff(b: Uint8Array): { contentType: string; kind: "image" | "video" } | null {
  const s = (o: number, str: string) => [...str].every((c, i) => b[o + i] === c.charCodeAt(0))
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { contentType: "image/jpeg", kind: "image" }
  if (b[0] === 0x89 && s(1, "PNG")) return { contentType: "image/png", kind: "image" }
  if (s(0, "RIFF") && s(8, "WEBP")) return { contentType: "image/webp", kind: "image" }
  if (s(4, "ftyp")) {
    const brand = String.fromCharCode(...b.slice(8, 12))
    return { contentType: brand.startsWith("qt") ? "video/quicktime" : "video/mp4", kind: "video" }
  }
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return { contentType: "video/webm", kind: "video" }
  return null
}

