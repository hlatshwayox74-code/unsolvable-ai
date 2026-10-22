// @vitest-environment node
import { describe, expect, it } from "vitest"
import { buildVeoRequest, mapVeoOperation } from "../netlify/lib/providers/google.ts"
import { mapHiggsfield } from "../netlify/lib/providers/higgsfield.ts"
import { openaiImageFields } from "../netlify/lib/providers/openai.ts"
import { buildRunwayRequest, mapRunwayTask } from "../netlify/lib/providers/runway.ts"
import type { JobRecord } from "../netlify/lib/store.ts"

function job(p: Partial<JobRecord>): JobRecord {
  return {
    id: "job_000000000000000000000000", ownerId: "u1", kind: "video", mode: "t2v", modelId: "runway-gen45", provider: "runway",
    prompt: "a shot", params: {}, imageRefs: [], status: "queued", outputs: [], cost: { usd: 0, credits: 0, basis: "verified", breakdown: "" },
    creditsCharged: 0, createdAt: "", updatedAt: "", ...p,
  }
}
const img = { assetId: "ast_1", contentType: "image/png", data: new Uint8Array([1, 2, 3]).buffer, signedUrl: "https://site/api/media/ast_1?o=u&e=1&s=x" }

describe("Runway", () => {
  it("maps text-to-video to the documented body", () => {
    const r = buildRunwayRequest(job({ params: { aspect: "9:16", duration: 5, seed: 42 } }), { images: [] })
    expect(r).toEqual({ path: "/text_to_video", body: { model: "gen4.5", promptText: "a shot", ratio: "720:1280", duration: 5, seed: 42 } })
  })
  it("sends the start frame as a signed URL for image-to-video", () => {
    const r = buildRunwayRequest(job({ mode: "i2v", prompt: "", params: { aspect: "1:1", duration: 10 } }), { images: [img] })
    expect(r.path).toBe("/image_to_video")
    expect(r.body).toEqual({ model: "gen4.5", promptImage: img.signedUrl, ratio: "960:960", duration: 10 })
  })
  it("tags reference images for Gen-4 Image", () => {
    const r = buildRunwayRequest(job({ kind: "image", mode: "i2i", modelId: "runway-gen4-image", params: { aspect: "16:9", resolution: "1080p" } }), { images: [img, img] })
    expect(r.body.ratio).toBe("1920:1080")
    expect(r.body.referenceImages).toEqual([{ uri: img.signedUrl, tag: "ref1" }, { uri: img.signedUrl, tag: "ref2" }])
  })
  it("maps task states honestly", () => {
    expect(mapRunwayTask({ status: "THROTTLED" }).status).toBe("queued")
    expect(mapRunwayTask({ status: "RUNNING", progress: 0.4 })).toEqual({ status: "processing", progress: 0.4 })
    expect(mapRunwayTask({ status: "RUNNING" }).progress).toBeUndefined()
    expect(mapRunwayTask({ status: "SUCCEEDED", output: ["https://x/v.mp4"] })).toEqual({ status: "completed", outputs: [{ url: "https://x/v.mp4" }] })
    expect(mapRunwayTask({ status: "FAILED", failureCode: "SAFETY.INPUT" }).error).toMatch(/moderation/)
  })
})

describe("Veo", () => {
  it("builds an instance with the start frame and parameters", () => {
    const body = buildVeoRequest(job({ mode: "i2v", modelId: "veo-31-fast", params: { aspect: "9:16", duration: 8, resolution: "1080p", negativePrompt: "text" } }), { images: [img] })
    expect(body.instances[0].image).toEqual({ bytesBase64Encoded: "AQID", mimeType: "image/png" })
    expect(body.parameters).toEqual({ aspectRatio: "9:16", durationSeconds: 8, resolution: "1080p", negativePrompt: "text" })
  })
  it("sends references as assets for text-to-video", () => {
    const body = buildVeoRequest(job({ modelId: "veo-31", params: { duration: 8 } }), { images: [img, img] })
    expect(body.instances[0].referenceImages).toHaveLength(2)
    expect((body.instances[0].referenceImages as { referenceType: string }[])[0].referenceType).toBe("asset")
  })
  it("reads finished operations and safety filtering", () => {
    expect(mapVeoOperation({ done: false }, "k").status).toBe("processing")
    const done = mapVeoOperation({ done: true, response: { generateVideoResponse: { generatedSamples: [{ video: { uri: "https://g/f:download" } }] } } }, "k")
    expect(done.status).toBe("completed")
    expect(done.outputs?.[0]).toMatchObject({ url: "https://g/f:download", headers: { "x-goog-api-key": "k" } })
    const filtered = mapVeoOperation({ done: true, response: { generateVideoResponse: { raiMediaFilteredReasons: ["celebrity"] } } }, "k")
    expect(filtered).toMatchObject({ status: "failed" })
    expect(filtered.error).toMatch(/celebrity/)
  })
})

describe("Higgsfield", () => {
  it("maps request states including moderation", () => {
    expect(mapHiggsfield({ status: "in_progress" }).status).toBe("processing")
    expect(mapHiggsfield({ status: "nsfw" }).status).toBe("failed")
    expect(mapHiggsfield({ status: "completed", video: { url: "https://h/v.mp4" } }).outputs).toEqual([{ url: "https://h/v.mp4" }])
    expect(mapHiggsfield({ status: "completed" }).status).toBe("failed")
  })
})

describe("OpenAI images", () => {
  it("maps aspect, quality and transparency", () => {
    const f = openaiImageFields(job({ kind: "image", mode: "t2i", modelId: "gpt-image-2", params: { aspect: "9:16", quality: "high", variations: 2, transparent: true } }))
    expect(f).toEqual({ model: "gpt-image-2", prompt: "a shot", size: "1152x2048", quality: "high", n: 2, output_format: "png", background: "transparent" })
  })
})
