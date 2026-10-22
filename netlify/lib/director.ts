import { getModel } from "../../shared/catalog.ts"
import { GEMINI_BASE } from "./providers/google.ts"
import { bytesToBase64, env, HttpError, ProviderError, providerFetch, readProviderError } from "./util.ts"

/**
 * The creative director: a small, cheap LLM that improves prompts, writes briefs and
 * storyboards, and describes uploaded products. It never invents facts about a product,
 * reviews, discounts or endorsements — the system prompt forbids it and the UI shows
 * every suggestion for the user to accept or edit.
 */

export type DirectorTask = "enhance" | "brief" | "storyboard" | "analyse-product"

const RULES = `You are the creative director inside Unsolvable.ai, an AI image, video and ad studio.
Hard rules:
- Use only facts the user gives you or that are visible in their images. Never invent product features, specifications, ingredients, prices, discounts, guarantees, awards, reviews, testimonials, endorsements, statistics or scarcity ("only 3 left", "ends tonight").
- If something needed is missing, list it in "missing" instead of guessing.
- No real celebrities, public figures or trademarked characters in prompts.
- Write prompts as concrete visual direction: subject, action, setting, lighting, lens and camera movement, mood, colour.
- Reply with a single JSON object matching the requested shape. No markdown.`

const SHAPES: Record<DirectorTask, string> = {
  enhance: `{"prompt": string (the improved prompt, under 900 characters), "negativePrompt": string (optional, short), "why": string[] (2-4 short reasons), "missing": string[]}`,
  brief: `{"summary": string, "audience": string, "concepts": [{"name": string, "funnel": "top"|"middle"|"bottom", "angle": string, "hook": string, "headline": string (max 8 words), "body": string (max 22 words), "cta": string (max 4 words), "imagePrompt": string, "videoPrompt": string}] (exactly 3, one per funnel stage), "missing": string[]}`,
  storyboard: `{"title": string, "shots": [{"title": string, "seconds": number, "prompt": string, "camera": string, "voiceover": string, "caption": string}] (3-6 shots), "voiceoverScript": string, "missing": string[]}`,
  "analyse-product": `{"productName": string|null, "category": string, "shape": string, "colours": string[], "materials": string[], "visibleText": string[] (exact text printed on the product or packaging, only if legible), "distinctiveDetails": string[], "preservationClause": string (one sentence to append to prompts so models keep the product accurate), "uncertain": string[]}`,
}

export interface DirectorInput {
  task: DirectorTask
  text: string
  modelId?: string
  images?: { data: ArrayBuffer; contentType: string }[]
}

function userMessage(input: DirectorInput): string {
  const model = input.modelId ? getModel(input.modelId) : undefined
  const ctx = model ? `Target model: ${model.label} (${model.kind}; ${model.summary}).\n` : ""
  const task = {
    enhance: "Rewrite this into a stronger prompt for the target model. Keep the user's intent and any specific details exactly.",
    brief: "Write a creative brief and three ad concepts (top, middle and bottom of funnel) from this campaign information.",
    storyboard: "Break this ad idea into a shot list for short AI-generated clips, with a voiceover script that fits the total length.",
    "analyse-product": "Describe the product in the attached image(s) precisely enough that an image or video model can reproduce it faithfully.",
  }[input.task]
  return `${task}\n${ctx}Return JSON shaped like: ${SHAPES[input.task]}\n\nUser input:\n${input.text.slice(0, 6000)}`
}

export function directorConfigured(): "gemini" | "openai" | null {
  if (env("GEMINI_API_KEY")) return "gemini"
  if (env("OPENAI_API_KEY")) return "openai"
  return null
}

export async function runDirector(input: DirectorInput): Promise<Record<string, unknown>> {
  const which = directorConfigured()
  if (!which) throw new HttpError(503, "The creative director needs a GEMINI_API_KEY or OPENAI_API_KEY.", "provider_not_configured")
  const raw = which === "gemini" ? await viaGemini(input) : await viaOpenAI(input)
  try {
    const parsed = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, ""))
    if (!parsed || typeof parsed !== "object") throw new Error("not an object")
    return parsed as Record<string, unknown>
  } catch {
    throw new ProviderError("The creative director returned something unreadable. Try again.")
  }
}

async function viaGemini(input: DirectorInput): Promise<string> {
  const model = env("DIRECTOR_GEMINI_MODEL") ?? "gemini-2.5-flash-lite"
  const parts: unknown[] = [{ text: userMessage(input) }]
  for (const img of input.images ?? []) parts.push({ inlineData: { mimeType: img.contentType, data: bytesToBase64(img.data) } })
  const res = await providerFetch(`${GEMINI_BASE}/models/${model}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": env("GEMINI_API_KEY")!, "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: RULES }] },
      contents: [{ role: "user", parts }],
      generationConfig: { responseMimeType: "application/json", temperature: input.task === "analyse-product" ? 0.1 : 0.8 },
    }),
    timeoutMs: 45_000,
  })
  if (!res.ok) throw await readProviderError(res, "Gemini")
  const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? ""
  if (!text) throw new ProviderError("Gemini returned an empty answer (it may have been blocked by a safety filter).")
  return text
}

async function viaOpenAI(input: DirectorInput): Promise<string> {
  const model = env("DIRECTOR_OPENAI_MODEL") ?? "gpt-5-mini"
  const content: unknown[] = [{ type: "input_text", text: userMessage(input) }]
  for (const img of input.images ?? []) {
    content.push({ type: "input_image", image_url: `data:${img.contentType};base64,${bytesToBase64(img.data)}` })
  }
  const res = await providerFetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${env("OPENAI_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, instructions: RULES, input: [{ role: "user", content }], text: { format: { type: "json_object" } } }),
    timeoutMs: 45_000,
  })
  if (!res.ok) throw await readProviderError(res, "OpenAI")
  const data = (await res.json()) as { output_text?: string; output?: { content?: { type?: string; text?: string }[] }[] }
  const text = data.output_text ?? data.output?.flatMap((o) => o.content ?? []).filter((c) => c.type === "output_text").map((c) => c.text).join("") ?? ""
  if (!text) throw new ProviderError("OpenAI returned an empty answer.")
  return text
}
