// @vitest-environment node
import { describe, expect, it } from "vitest"
import { estimateCost, MODELS, validateRequest } from "../shared/catalog.ts"

describe("validateRequest", () => {
  it("rejects unknown models and unsupported modes", () => {
    expect(validateRequest({ modelId: "nope", mode: "t2v", prompt: "x", params: {} }).ok).toBe(false)
    const r = validateRequest({ modelId: "runway-gen4-turbo", mode: "t2v", prompt: "x", params: {} })
    expect(r.ok).toBe(false)
    expect(r.errors.join()).toMatch(/can't do Text to video/)
  })

  it("fills defaults from the catalogue", () => {
    const r = validateRequest({ modelId: "runway-gen45", mode: "t2v", prompt: "a shot", params: {} })
    expect(r.ok).toBe(true)
    expect(r.params).toMatchObject({ aspect: "16:9", duration: 5 })
  })

  it("refuses aspect ratios a mode doesn't support", () => {
    const r = validateRequest({ modelId: "runway-gen45", mode: "t2v", prompt: "a", params: { aspect: "1:1" } })
    expect(r.ok).toBe(false)
  })

  it("enforces Veo's 8-second rule for 1080p, 4K and references", () => {
    expect(validateRequest({ modelId: "veo-31-fast", mode: "t2v", prompt: "a", params: { duration: 4, resolution: "1080p" } }).ok).toBe(false)
    expect(validateRequest({ modelId: "veo-31-fast", mode: "t2v", prompt: "a", params: { duration: 8, resolution: "1080p" } }).ok).toBe(true)
    expect(validateRequest({ modelId: "veo-31-fast", mode: "t2v", prompt: "a", params: { duration: 6 }, imageRefs: ["ast_000000000000000000000000"] }).ok).toBe(false)
    expect(validateRequest({ modelId: "veo-31-lite", mode: "t2v", prompt: "a", params: { resolution: "4k", duration: 8 } }).ok).toBe(false)
  })

  it("requires a start image for image-to-video and allows only one", () => {
    expect(validateRequest({ modelId: "runway-gen45", mode: "i2v", prompt: "", params: {} }).errors.join()).toMatch(/start image/)
    expect(validateRequest({ modelId: "runway-gen45", mode: "i2v", prompt: "", params: {}, imageRefs: ["a"] }).ok).toBe(true)
    expect(validateRequest({ modelId: "runway-gen45", mode: "i2v", prompt: "", params: {}, imageRefs: ["a", "b"] }).ok).toBe(false)
  })

  it("caps reference images per model", () => {
    const refs = ["a", "b", "c", "d", "e"]
    expect(validateRequest({ modelId: "gpt-image-2", mode: "i2i", prompt: "x", params: {}, imageRefs: refs.slice(0, 4) }).ok).toBe(true)
    expect(validateRequest({ modelId: "gpt-image-2", mode: "i2i", prompt: "x", params: {}, imageRefs: refs }).ok).toBe(false)
    expect(validateRequest({ modelId: "runway-gen45", mode: "t2v", prompt: "x", params: {}, imageRefs: ["a"] }).errors.join()).toMatch(/doesn't take reference/)
  })

  it("validates video-to-video clip length", () => {
    const base = { modelId: "runway-aleph2", mode: "v2v" as const, prompt: "make it night", videoRef: "v" }
    expect(validateRequest({ ...base, params: { sourceSeconds: 12 } }).ok).toBe(true)
    expect(validateRequest({ ...base, params: { sourceSeconds: 45 } }).ok).toBe(false)
    expect(validateRequest({ ...base, params: {} }).ok).toBe(false)
  })

  it("requires a voice and clamps voice settings", () => {
    expect(validateRequest({ modelId: "eleven-v4", mode: "tts", prompt: "hi", params: {} }).ok).toBe(false)
    const r = validateRequest({ modelId: "eleven-v4", mode: "tts", prompt: "hi", params: { voiceId: "21m00Tcm4TlvDq8ikWAM", stability: 4, speed: 0.1 } })
    expect(r.ok).toBe(true)
    expect(r.params).toMatchObject({ stability: 1, speed: 0.7 })
  })

  it("rejects bad seeds and over-long prompts", () => {
    expect(validateRequest({ modelId: "runway-gen45", mode: "t2v", prompt: "x", params: { seed: -1 } }).ok).toBe(false)
    expect(validateRequest({ modelId: "runway-gen45", mode: "t2v", prompt: "x".repeat(4001), params: {} }).ok).toBe(false)
  })
})

describe("estimateCost uses the published rates", () => {
  it("Runway Gen-4.5 at $0.12/s", () => expect(estimateCost("runway-gen45", "t2v", { duration: 10 }).usd).toBe(1.2))
  it("Veo 3.1 Fast by resolution", () => {
    expect(estimateCost("veo-31-fast", "t2v", { duration: 8, resolution: "720p" }).usd).toBe(0.8)
    expect(estimateCost("veo-31-fast", "t2v", { duration: 8, resolution: "1080p" }).usd).toBe(0.96)
    expect(estimateCost("veo-31-fast", "t2v", { duration: 8, resolution: "4k" }).usd).toBe(2.4)
  })
  it("Veo 3.1 standard is $0.40/s, $0.60 at 4K", () => {
    expect(estimateCost("veo-31", "t2v", { duration: 8, resolution: "1080p" }).usd).toBe(3.2)
    expect(estimateCost("veo-31", "t2v", { duration: 8, resolution: "4k" }).usd).toBe(4.8)
  })
  it("Aleph 2 has a $0.56 minimum", () => {
    expect(estimateCost("runway-aleph2", "v2v", { sourceSeconds: 1 }).usd).toBe(0.56)
    expect(estimateCost("runway-aleph2", "v2v", { sourceSeconds: 10 }).usd).toBe(2.8)
  })
  it("marks plan-dependent prices as estimates", () => {
    expect(estimateCost("gpt-image-2", "t2i", { quality: "high" }).basis).toBe("estimate")
    expect(estimateCost("runway-gen45", "t2v", { duration: 5 }).basis).toBe("verified")
  })
  it("charges at least one credit and applies the markup", () => {
    expect(estimateCost("runway-gen45", "t2v", { duration: 5 }).credits).toBe(90)
    expect(estimateCost("eleven-flash-v25", "tts", {}, 10).credits).toBe(1)
  })
  it("every model has a price function", () => {
    for (const m of MODELS) {
      const c = estimateCost(m.id, m.modes[0], { duration: m.durations?.[0], sourceSeconds: 5 }, 1000)
      expect(c.usd, m.id).toBeGreaterThan(0)
    }
  })
})

describe("self-hosted models", () => {
  it("accept Kokoro preset voices and reject unknown ones", async () => {
    const { validateRequest } = await import("../shared/catalog.ts")
    expect(validateRequest({ modelId: "kokoro-82m", mode: "tts", prompt: "hi", params: { voiceId: "af_heart" } }).ok).toBe(true)
    expect(validateRequest({ modelId: "kokoro-82m", mode: "tts", prompt: "hi", params: { voiceId: "21m00Tcm4TlvDq8ikWAM" } }).ok).toBe(false)
  })
  it("need at least one shot to assemble, and drop broken captions", async () => {
    const { validateRequest } = await import("../shared/catalog.ts")
    expect(validateRequest({ modelId: "engine-compose", mode: "compose", prompt: "", params: {} }).ok).toBe(false)
    const v = validateRequest({ modelId: "engine-compose", mode: "compose", prompt: "", videoRefs: ["ast_aaaaaaaaaaaaaaaaaaaaaaaa"],
      params: { aspect: "9:16", captions: [{ start: 0, end: 1, text: "ok" }, { start: 2, end: 1, text: "backwards" }, { start: 0, end: 1, text: " " }] } })
    expect(v.ok).toBe(true)
    expect(v.params.captions).toEqual([{ start: 0, end: 1, text: "ok" }])
  })
  it("price GPU time, not provider fees", async () => {
    const { estimateCost } = await import("../shared/catalog.ts")
    const c = estimateCost("wan22-ti2v-5b", "t2v", { duration: 5 })
    expect(c.usd).toBeCloseTo(0.107, 3)
    expect(c.breakdown).toMatch(/GPU time/)
  })
})
