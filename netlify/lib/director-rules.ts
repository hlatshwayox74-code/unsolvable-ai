import { getModel } from "../../shared/catalog.ts"

/**
 * Rules-based creative director: used when third-party AI is switched off and no local language
 * model is connected. It only rearranges what the user wrote into the shapes the studio expects;
 * it can't analyse photos and it never adds facts. Everything it returns is editable.
 */

function field(text: string, label: string): string {
  const m = text.match(new RegExp(`^${label}[^:\\n]*:\\s*(.*)$`, "im"))
  const v = (m?.[1] ?? "").trim()
  return /^(none|none given)$/i.test(v) ? "" : v
}

function words(s: string, n: number): string {
  const w = s.replace(/\s+/g, " ").trim().split(" ").filter(Boolean)
  return w.slice(0, n).join(" ")
}

const LOOKS: [RegExp, string][] = [
  [/street|urban|bold|edgy/i, "night city street, wet asphalt reflections, hard rim light, deep blacks with a single yellow accent"],
  [/premium|luxury|minimal|clean/i, "clean studio set, soft directional key light, shallow depth of field, refined and calm"],
  [/playful|fun|bright|energetic/i, "bright colourful set, natural daylight, energetic handheld framing"],
]

function look(tone: string): string {
  return LOOKS.find(([re]) => re.test(tone))?.[1] ?? "high-contrast lighting, confident framing, rich blacks, crisp detail"
}

export function rulesDirector(task: string, text: string, modelId?: string): Record<string, unknown> {
  const brand = field(text, "Brand")
  const product = field(text, "Product") || brand || "the product"
  const points = field(text, "Selling points").split(/[;\n]|,\s(?=[A-Z0-9])/).map((s) => s.trim()).filter(Boolean)
  const audience = field(text, "Audience")
  const offer = field(text, "Offer")
  const tone = field(text, "Tone")
  const cta = field(text, "Call to action") || "Shop now"
  const style = look(tone + " " + text)
  const missing = [
    !points.length && "selling points you can back up",
    !audience && "who it's for",
  ].filter(Boolean) as string[]

  if (task === "enhance") {
    const m = modelId ? getModel(modelId) : undefined
    const base = text.trim().replace(/[.\s]+$/, "")
    const extra = m?.kind === "video"
      ? "Smooth cinematic camera movement, steady framing, natural motion, 24 fps, realistic lighting"
      : "Photorealistic, sharp focus, realistic materials and reflections, balanced composition, natural colour"
    return {
      prompt: `${base}. ${extra}.`.slice(0, 900),
      negativePrompt: "blurry, distorted, extra limbs, warped text, watermark, low quality",
      why: ["Added camera and lighting direction", "Added realism and quality cues", "Kept your wording and details unchanged"],
      missing: [],
    }
  }

  if (task === "brief") {
    const p1 = points[0] ?? ""
    const p2 = points[1] ?? p1
    const concept = (funnel: string, name: string, angle: string, hook: string, headline: string, body: string, scene: string) => ({
      name, funnel, angle, hook, headline: words(headline, 8), body: words(body, 22), cta: words(cta, 4),
      imagePrompt: `${scene}, ${style}. Advertising photograph, no text, no logos.`,
      videoPrompt: `${scene}, slow push-in, ${style}.`,
    })
    return {
      summary: `${brand ? brand + ": " : ""}${product}${audience ? ` for ${audience}` : ""}.`,
      audience,
      concepts: [
        concept("top", "The reveal", "Grab attention with the product itself.", `First look: ${product}.`, product, p1 || `Meet ${product}.`, `Dramatic close-up reveal of ${product}`),
        concept("middle", "In the details", "Show the points the brand can back up.", p1 ? `${p1}.` : `Look closer at ${product}.`, p2 || "Look closer", points.slice(0, 2).join(". ") || `Every detail of ${product}, up close.`, `Macro detail shots of ${product}, textures and craft`),
        concept("bottom", "Ready when you are", "Make the next step obvious.", offer || cta, offer || cta, offer ? `${offer}. ${cta}.` : `${product}. ${cta}.`, `Hero shot of ${product} with empty space at the top for a headline`),
      ],
      missing,
    }
  }

  if (task === "storyboard") {
    const total = Number(text.match(/Total length: about (\d+)/)?.[1] ?? 15)
    const idea = field(text, "Video idea") || `${product} in a ${style} scene`
    const hook = field(text, "Hook")
    const n = Math.max(2, Math.min(6, Math.round(total / 5)))
    const beats = [
      { title: "Hook", prompt: `Dramatic close-up reveal of ${product}. ${idea}`, camera: "slow push-in" },
      { title: "Detail", prompt: `Macro detail of ${product}: texture, materials and craft`, camera: "slow orbit" },
      { title: "In use", prompt: `Someone${audience ? " from " + audience : ""} using ${product} naturally`, camera: "handheld medium shot" },
      { title: "Lifestyle", prompt: `Lifestyle scene featuring ${product}`, camera: "wide tracking shot" },
      { title: "Detail 2", prompt: `Close-up of ${product} catching the light`, camera: "slow tilt" },
    ]
    const hero = { title: "Hero", prompt: `Hero shot of ${product}, centred, empty space at the top for a headline`, camera: "static" }
    const chosen = [...beats.slice(0, n - 1), hero]
    const lines = [hook || `Meet ${product}.`, ...points.slice(0, n - 2).map((p) => p.replace(/\.?$/, ".")), offer ? `${offer}. ${cta}.` : `${cta}.`]
    const shots = chosen.map((b, i) => ({
      title: b.title, seconds: 5, prompt: `${b.prompt}, ${style}`, camera: b.camera,
      voiceover: lines[i] ?? "", caption: words(lines[i] ?? "", 7),
    }))
    const budget = Math.round(n * 5 * 2.5)
    return {
      title: `${product} — ${n * 5}s`,
      shots,
      voiceoverScript: words(lines.join(" "), budget),
      missing,
    }
  }

  throw new Error("unsupported")
}
