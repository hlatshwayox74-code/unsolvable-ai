import { createHmac, timingSafeEqual } from "node:crypto"
import { env, HttpError } from "./util.ts"

/**
 * Short-lived signed links so a provider (e.g. Runway video-to-video) can fetch a private
 * upload. The link encodes owner + asset + expiry; nothing else is readable without it.
 */
function secret(): string {
  const s = env("MEDIA_SIGNING_SECRET")
  if (!s || s.length < 32) throw new HttpError(503, "MEDIA_SIGNING_SECRET is missing or shorter than 32 characters.", "not_configured")
  return s
}

export function signMediaPath(owner: string, assetId: string, ttlSeconds = 900, now = Date.now()): string {
  const exp = Math.floor(now / 1000) + ttlSeconds
  const payload = `${owner}.${assetId}.${exp}`
  const sig = createHmac("sha256", secret()).update(payload).digest("base64url")
  return `/api/media/${assetId}?o=${encodeURIComponent(owner)}&e=${exp}&s=${sig}`
}

export function verifyMediaSignature(owner: string, assetId: string, exp: string, sig: string, now = Date.now()): boolean {
  const e = Number(exp)
  if (!Number.isInteger(e) || e < Math.floor(now / 1000)) return false
  const expected = createHmac("sha256", secret()).update(`${owner}.${assetId}.${e}`).digest()
  let given: Buffer
  try {
    given = Buffer.from(sig, "base64url")
  } catch {
    return false
  }
  return given.length === expected.length && timingSafeEqual(given, expected)
}
