// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// In-memory stand-in for Netlify Blobs.
const stores = new Map<string, Map<string, { data: unknown; metadata?: unknown }>>()
vi.mock("@netlify/blobs", () => ({
  getStore: ({ name }: { name: string }) => {
    if (!stores.has(name)) stores.set(name, new Map())
    const s = stores.get(name)!
    return {
      setJSON: async (k: string, v: unknown) => { s.set(k, { data: JSON.parse(JSON.stringify(v)) }) },
      set: async (k: string, v: unknown, o?: { metadata?: unknown }) => { s.set(k, { data: v, metadata: o?.metadata }) },
      get: async (k: string) => s.get(k)?.data ?? null,
      getWithMetadata: async (k: string) => (s.has(k) ? { data: s.get(k)!.data, metadata: s.get(k)!.metadata } : null),
      list: async ({ prefix }: { prefix: string }) => ({ blobs: [...s.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }),
      delete: async (k: string) => { s.delete(k) },
    }
  },
}))

const { sniff } = await import("../netlify/lib/sniff.ts")
const { signMediaPath, verifyMediaSignature } = await import("../netlify/lib/sign.ts")
const jobs = await import("../netlify/lib/jobs.ts")
const store = await import("../netlify/lib/store.ts")

const actor = { id: "user-1", roles: ["admin"], canGenerate: true }
const SECRET = "x".repeat(40)

beforeEach(() => {
  stores.clear()
  process.env.MEDIA_SIGNING_SECRET = SECRET
  process.env.RUNWAY_API_KEY = "rk_test"
  process.env.ALLOW_EXTERNAL_PROVIDERS = "true"
})
afterEach(() => {
  vi.unstubAllGlobals()
  for (const k of ["RUNWAY_API_KEY", "OPENAI_API_KEY", "ALLOW_EXTERNAL_PROVIDERS", "ENGINE_URL", "ENGINE_TOKEN"]) delete process.env[k]
})

describe("third-party AI switch", () => {
  it("refuses external providers by default, even with a key present", async () => {
    delete process.env.ALLOW_EXTERNAL_PROVIDERS
    const f = vi.fn()
    vi.stubGlobal("fetch", f)
    await expect(jobs.createJob(actor, { modelId: "runway-gen45", mode: "t2v", prompt: "x", params: {} }, "https://site"))
      .rejects.toMatchObject({ status: 403, code: "external_disabled" })
    expect(f).not.toHaveBeenCalled()
    const { providerStatus } = await import("../netlify/lib/providers/index.ts")
    expect(providerStatus().runway).toBe(false)
  })
  it("falls back to the rules-based director with no AI calls", async () => {
    delete process.env.ALLOW_EXTERNAL_PROVIDERS
    process.env.OPENAI_API_KEY = "sk_test"
    const f = vi.fn()
    vi.stubGlobal("fetch", f)
    const { runDirector, directorConfigured } = await import("../netlify/lib/director.ts")
    expect(directorConfigured()).toBe("rules")
    const brief = "Brand: UNSOLVABLE\nProduct: Problem Solver Hoodie\nSelling points (stated by the brand): 400gsm cotton; oversized fit\nAudience: streetwear buyers\nOffer or price (use exactly, or leave out): none\nTone: street: confident\nCall to action: Shop the drop"
    const r = await runDirector({ task: "brief", text: brief }) as { concepts: { funnel: string; headline: string }[] }
    expect(r.concepts.map((c) => c.funnel)).toEqual(["top", "middle", "bottom"])
    const sb = await runDirector({ task: "storyboard", text: brief + "\nTotal length: about 15 seconds" }) as { shots: { seconds: number }[]; voiceoverScript: string }
    expect(sb.shots).toHaveLength(3)
    expect(sb.voiceoverScript).toMatch(/Shop the drop/)
    await expect(runDirector({ task: "analyse-product", text: "" })).rejects.toMatchObject({ status: 503 })
    expect(f).not.toHaveBeenCalled()
  })
})

describe("self-hosted engine", () => {
  beforeEach(() => {
    delete process.env.ALLOW_EXTERNAL_PROVIDERS
    process.env.ENGINE_URL = "https://gpu.example.com"
    process.env.ENGINE_TOKEN = "e".repeat(32)
  })

  it("submits to our engine, reports real progress and provenance, and stores the output", async () => {
    const calls: { url: string; init?: RequestInit }[] = []
    let polls = 0
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init })
      if (url === "https://gpu.example.com/v1/jobs") return Response.json({ id: "e1", status: "queued" }, { status: 202 })
      if (url === "https://gpu.example.com/v1/jobs/e1") {
        polls++
        const base = { id: "e1", model: "flux2-klein-4b", modelName: "FLUX.2 [klein] 4B", modelVersion: "FLUX.2-klein-4B", license: "Apache-2.0", error: null }
        return polls === 1
          ? Response.json({ ...base, status: "processing", progress: 0.5, outputs: [], metrics: {} })
          : Response.json({ ...base, status: "completed", progress: 1, outputs: [{ index: 0, contentType: "image/webp" }],
            metrics: { seconds: 4.2, gpu: "NVIDIA GeForce RTX 4090", peakVramGb: 12.8, estCostUsd: 0.0008 },
            quality: { passed: true, checks: [{ name: "not_blank", passed: true }] } })
      }
      if (url === "https://gpu.example.com/v1/jobs/e1/outputs/0") return new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/webp" } })
      return new Response("unexpected " + url, { status: 500 })
    }))
    const job = await jobs.createJob(actor, { modelId: "flux2-klein-4b", mode: "t2i", prompt: "a hoodie", params: { aspect: "9:16", variations: 1 } }, "https://site")
    expect(job.status).toBe("processing")
    const submit = calls[0]
    expect((submit.init!.headers as Record<string, string>).Authorization).toBe(`Bearer ${"e".repeat(32)}`)
    expect(JSON.parse(String(submit.init!.body))).toMatchObject({ model: "flux2-klein-4b", mode: "t2i", params: { width: 784, height: 1408, variations: 1 } })

    job.lastPolledAt = 0
    expect((await jobs.refreshJob(job)).progress).toBe(0.5)
    job.lastPolledAt = 0
    const done = await jobs.refreshJob(job)
    expect(done.status).toBe("completed")
    expect(done.provenance).toMatchObject({ engine: "self-hosted", model: "FLUX.2 [klein] 4B", license: "Apache-2.0", gpu: "NVIDIA GeForce RTX 4090", quality: { passed: true, failed: [] } })
    const out = calls.find((c) => c.url.endsWith("/outputs/0"))!
    expect((out.init!.headers as Record<string, string>).Authorization).toMatch(/^Bearer /)
    expect(store.toView(done).provenance?.seconds).toBe(4.2)
  })

  it("assembles an ad from the user's own shots and voiceover via signed links", async () => {
    let body: Record<string, unknown> = {}
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "https://gpu.example.com/v1/jobs") { body = JSON.parse(String(init!.body)); return Response.json({ id: "c1" }, { status: 202 }) }
      return new Response("unexpected", { status: 500 })
    }))
    const v = "ast_aaaaaaaaaaaaaaaaaaaaaaaa", a = "ast_bbbbbbbbbbbbbbbbbbbbbbbb"
    await store.putMedia(actor.id, v, new Uint8Array([1]).buffer, { contentType: "video/mp4", kind: "video", source: "output" })
    await store.putMedia(actor.id, a, new Uint8Array([1]).buffer, { contentType: "audio/wav", kind: "audio", source: "output" })
    const job = await jobs.createJob(actor, {
      modelId: "engine-compose", mode: "compose", prompt: "", videoRefs: [v, v], audioRef: a,
      params: { aspect: "9:16", captions: [{ start: 0, end: 2, text: "BEYOND LIMITS." }, { start: 3, end: 2, text: "bad" }] },
    }, "https://site")
    expect(job.status).toBe("processing")
    expect(body).toMatchObject({ model: "compose", mode: "compose", params: { width: 1080, height: 1920, captions: [{ text: "BEYOND LIMITS." }] } })
    expect((body.videoUrls as string[])).toHaveLength(2)
    expect(String(body.audioUrl)).toMatch(/^https:\/\/site\/api\/media\/ast_b.*[?&]s=/)
  })

  it("explains when the engine isn't connected", async () => {
    delete process.env.ENGINE_URL
    await expect(jobs.createJob(actor, { modelId: "kokoro-82m", mode: "tts", prompt: "hi", params: { voiceId: "af_heart" } }, "https://site"))
      .rejects.toMatchObject({ status: 503, message: expect.stringMatching(/ENGINE_URL/) })
  })
})

describe("upload sniffing", () => {
  const b = (...xs: (number | string)[]) => new Uint8Array(xs.flatMap((x) => (typeof x === "string" ? [...x].map((c) => c.charCodeAt(0)) : [x])).concat(Array(16).fill(0)))
  it("recognises real file signatures", () => {
    expect(sniff(b(0xff, 0xd8, 0xff))?.contentType).toBe("image/jpeg")
    expect(sniff(b(0x89, "PNG"))?.contentType).toBe("image/png")
    expect(sniff(b("RIFF", 0, 0, 0, 0, "WEBP"))?.contentType).toBe("image/webp")
    expect(sniff(b(0, 0, 0, 0x18, "ftypisom"))).toEqual({ contentType: "video/mp4", kind: "video" })
    expect(sniff(b(0, 0, 0, 0x18, "ftypqt  "))?.contentType).toBe("video/quicktime")
  })
  it("rejects anything else, whatever its name", () => {
    expect(sniff(b("<svg"))).toBeNull()
    expect(sniff(b("%PDF"))).toBeNull()
  })
})

describe("signed media links", () => {
  it("verifies its own links and rejects tampering or expiry", () => {
    const path = signMediaPath("user-1", "ast_aaaaaaaaaaaaaaaaaaaaaaaa", 60, 1_000_000)
    const u = new URL("https://x" + path)
    const [o, e, s] = ["o", "e", "s"].map((k) => u.searchParams.get(k)!)
    expect(verifyMediaSignature(o, "ast_aaaaaaaaaaaaaaaaaaaaaaaa", e, s, 1_000_000)).toBe(true)
    expect(verifyMediaSignature("user-2", "ast_aaaaaaaaaaaaaaaaaaaaaaaa", e, s, 1_000_000)).toBe(false)
    expect(verifyMediaSignature(o, "ast_bbbbbbbbbbbbbbbbbbbbbbbb", e, s, 1_000_000)).toBe(false)
    expect(verifyMediaSignature(o, "ast_aaaaaaaaaaaaaaaaaaaaaaaa", e, s, 1_000_000 + 61_000)).toBe(false)
  })
  it("refuses to sign without a strong secret", () => {
    process.env.MEDIA_SIGNING_SECRET = "short"
    expect(() => signMediaPath("u", "ast_aaaaaaaaaaaaaaaaaaaaaaaa")).toThrow(/MEDIA_SIGNING_SECRET/)
  })
})

describe("job lifecycle (Runway, async)", () => {
  it("submits, polls and stores the output privately", async () => {
    const calls: { url: string; init?: RequestInit }[] = []
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init })
      if (url.endsWith("/v1/text_to_video")) return Response.json({ id: "task-1" })
      if (url.endsWith("/v1/tasks/task-1")) return Response.json({ status: "SUCCEEDED", output: ["https://cdn.runway/out.mp4"] })
      if (url === "https://cdn.runway/out.mp4") return new Response(new Uint8Array([0, 0, 0, 1]), { headers: { "content-type": "video/mp4" } })
      return new Response("unexpected " + url, { status: 500 })
    }))
    const job = await jobs.createJob(actor, { modelId: "runway-gen45", mode: "t2v", prompt: "a slow dolly shot", params: { duration: 5 } }, "https://site")
    expect(job.status).toBe("processing")
    expect(job.providerJobId).toBe("task-1")
    const submit = calls.find((c) => c.url.endsWith("/text_to_video"))!
    expect((submit.init!.headers as Record<string, string>)["X-Runway-Version"]).toBe("2024-11-06")
    expect(JSON.parse(String(submit.init!.body))).toMatchObject({ model: "gen4.5", ratio: "1280:720", duration: 5 })

    job.lastPolledAt = 0
    const done = await jobs.refreshJob(job)
    expect(done.status).toBe("completed")
    expect(done.outputs[0].url).toMatch(/^\/api\/media\/ast_/)
    const media = await store.getMedia(actor.id, done.outputs[0].assetId)
    expect(media?.meta).toMatchObject({ contentType: "video/mp4", source: "output", jobId: job.id })
    expect(job.cost.usd).toBe(0.6)
  })

  it("records provider rejections as failed jobs with the reason", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "promptText is too long" }, { status: 400 })))
    const job = await jobs.createJob(actor, { modelId: "runway-gen45", mode: "t2v", prompt: "x", params: {} }, "https://site")
    expect(job.status).toBe("failed")
    expect(job.error).toMatch(/promptText is too long/)
  })

  it("keeps a job running through a transient poll error", async () => {
    let n = 0
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.endsWith("/text_to_video")) return Response.json({ id: "t2" })
      n++
      return new Response("busy", { status: 503 })
    }))
    const job = await jobs.createJob(actor, { modelId: "runway-gen45", mode: "t2v", prompt: "x", params: {} }, "https://site")
    job.lastPolledAt = 0
    expect((await jobs.refreshJob(job)).status).toBe("processing")
    expect(n).toBe(1)
  })

  it("refuses models whose provider has no key", async () => {
    await expect(jobs.createJob(actor, { modelId: "gpt-image-2", mode: "t2i", prompt: "x", params: {} }, "https://site")).rejects.toMatchObject({ status: 503 })
  })

  it("rejects invalid requests before calling any provider", async () => {
    const f = vi.fn()
    vi.stubGlobal("fetch", f)
    await expect(jobs.createJob(actor, { modelId: "runway-gen45", mode: "t2v", prompt: "", params: {} }, "https://site")).rejects.toMatchObject({ status: 400 })
    expect(f).not.toHaveBeenCalled()
  })

  it("won't use another account's upload as a reference", async () => {
    await store.putMedia("someone-else", "ast_cccccccccccccccccccccccc", new Uint8Array([1]).buffer, { contentType: "image/png", kind: "image", source: "upload" })
    await expect(jobs.createJob(actor, { modelId: "runway-gen45", mode: "i2v", prompt: "", params: {}, imageRefs: ["ast_cccccccccccccccccccccccc"] }, "https://site"))
      .rejects.toMatchObject({ status: 400 })
  })

  it("caps concurrent jobs per user", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ id: "t" })))
    for (let i = 0; i < 4; i++) await jobs.createJob(actor, { modelId: "runway-gen45", mode: "t2v", prompt: "x", params: {} }, "https://site")
    await expect(jobs.createJob(actor, { modelId: "runway-gen45", mode: "t2v", prompt: "x", params: {} }, "https://site")).rejects.toMatchObject({ status: 429 })
  })
})

describe("background jobs (OpenAI, sync)", () => {
  it("only accepts correctly signed run requests", () => {
    const t = jobs.internalToken("job_aaaaaaaaaaaaaaaaaaaaaaaa")
    expect(jobs.verifyInternalToken("job_aaaaaaaaaaaaaaaaaaaaaaaa", t)).toBe(true)
    expect(jobs.verifyInternalToken("job_bbbbbbbbbbbbbbbbbbbbbbbb", t)).toBe(false)
    expect(jobs.verifyInternalToken("job_aaaaaaaaaaaaaaaaaaaaaaaa", "nope")).toBe(false)
  })

  it("queues, then runs to completion in the worker", async () => {
    process.env.OPENAI_API_KEY = "sk_test"
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString("base64")
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url === "https://site/api/internal/run-job") return new Response(null, { status: 202 })
      if (url.endsWith("/images/generations")) return Response.json({ data: [{ b64_json: png }, { b64_json: png }] })
      return new Response("unexpected", { status: 500 })
    }))
    const job = await jobs.createJob(actor, { modelId: "gpt-image-2", mode: "t2i", prompt: "a hoodie", params: { variations: 2 } }, "https://site")
    expect(job.status).toBe("queued")
    await jobs.runJob(actor.id, job.id, "https://site")
    const saved = await store.loadJob(actor.id, job.id)
    expect(saved?.status).toBe("completed")
    expect(saved?.outputs).toHaveLength(2)
  })
})

describe("output download", () => {
  it("never forwards provider auth headers across a cross-origin redirect", async () => {
    const seen: Record<string, string | undefined> = {}
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      seen[url] = (init?.headers as Record<string, string> | undefined)?.["x-goog-api-key"]
      if (url.startsWith("https://generativelanguage.googleapis.com")) return new Response(null, { status: 302, headers: { location: "https://storage.example.com/v.mp4" } })
      return new Response(new Uint8Array([1]))
    }))
    await jobs.fetchOutput("https://generativelanguage.googleapis.com/v1beta/files/x:download", { "x-goog-api-key": "secret" })
    expect(seen["https://generativelanguage.googleapis.com/v1beta/files/x:download"]).toBe("secret")
    expect(seen["https://storage.example.com/v.mp4"]).toBeUndefined()
  })
  it("refuses insecure links", async () => {
    await expect(jobs.fetchOutput("http://x/v.mp4")).rejects.toThrow(/insecure/)
  })
})
