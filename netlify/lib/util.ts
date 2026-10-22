/** Small server helpers shared by every function. */

declare const Netlify: { env: { get(name: string): string | undefined } } | undefined

export function env(name: string): string | undefined {
  try {
    const v = typeof Netlify !== "undefined" ? Netlify.env.get(name) : undefined
    if (v) return v
  } catch { /* outside the Netlify runtime */ }
  return process.env[name] || undefined
}

export class HttpError extends Error {
  constructor(public status: number, message: string, public code = "error") {
    super(message)
  }
}

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  })
}

/** Turn any thrown value into a JSON error response without leaking internals. */
export function handleError(err: unknown): Response {
  if (err instanceof HttpError) return json({ error: err.message, code: err.code }, err.status)
  console.error("[unsolvable] unhandled error:", err instanceof Error ? err.message : String(err))
  return json({ error: "Something went wrong on our side. Try again in a moment.", code: "internal" }, 500)
}

export function newId(prefix: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  return prefix + "_" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
}

export const ID_RE = /^[a-z]{2,6}_[a-f0-9]{24}$/

export function nowIso() {
  return new Date().toISOString()
}

/** fetch with a timeout and JSON error extraction for provider calls. */
export async function providerFetch(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<Response> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), init.timeoutMs ?? 25000)
  try {
    return await fetch(url, { ...init, signal: ctrl.signal })
  } catch (e) {
    if ((e as Error).name === "AbortError") throw new ProviderError("The provider took too long to respond.", true)
    throw new ProviderError("Couldn't reach the provider.", true)
  } finally {
    clearTimeout(t)
  }
}

/** Errors from a provider. `retryable` is only true for transient failures (network, 429, 5xx). */
export class ProviderError extends Error {
  constructor(message: string, public retryable = false, public status?: number) {
    super(message)
  }
}

export async function readProviderError(res: Response, provider: string): Promise<ProviderError> {
  let detail = ""
  try {
    const body = await res.json() as Record<string, unknown>
    const e = (body.error ?? body.detail ?? body.message ?? body) as unknown
    detail = typeof e === "string" ? e : typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : ""
  } catch { /* not JSON */ }
  const retryable = res.status === 429 || res.status >= 500
  let msg: string
  if (res.status === 401 || res.status === 403) msg = `${provider} rejected the API key. Check it in your Netlify environment variables.`
  else if (res.status === 402) msg = `${provider} says the account is out of credit.`
  else if (res.status === 429) msg = `${provider} is rate-limiting requests. Try again in a minute.`
  else if (res.status >= 500) msg = `${provider} had a server error.`
  else msg = `${provider} couldn't accept this request${detail ? `: ${detail.slice(0, 300)}` : "."}`
  return new ProviderError(msg, retryable, res.status)
}

export function bytesToBase64(buf: ArrayBuffer): string {
  return Buffer.from(buf).toString("base64")
}
