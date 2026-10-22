import { useEffect, useMemo, useRef, useState } from "react"
import { ChipGroup, Icon, Notice } from "../../../components/ui.tsx"

/**
 * Deterministic ad layout. The AI makes the scene; this draws headline, body, offer, CTA,
 * logo and (optionally) the untouched product cut-out on a canvas, so text and prices are
 * exactly what the user typed and the product pixels are the user's own photo.
 */

export interface Placement { id: string; label: string; w: number; h: number; safe?: { top: number; bottom: number; right?: number }; note?: string }

export const PLACEMENTS: Placement[] = [
  { id: "square", label: "Feed square 1:1", w: 1080, h: 1080 },
  { id: "portrait", label: "Feed portrait 4:5", w: 1080, h: 1350 },
  { id: "story", label: "Stories / Reels / TikTok 9:16", w: 1080, h: 1920, safe: { top: 0.14, bottom: 0.2, right: 0.12 }, note: "Shaded areas are an approximate guide to where app buttons and captions cover the ad. Check each platform's current spec before launch." },
  { id: "link", label: "Link ad 1.91:1", w: 1200, h: 628 },
  { id: "hero", label: "Website hero 16:9", w: 1920, h: 1080 },
]

export interface LayoutText { headline: string; body: string; offer: string; cta: string }

type Anchor = "top" | "center" | "bottom"
type Font = "display" | "sans" | "serif"
const FONT_STACK: Record<Font, string> = {
  display: `"Big Shoulders Display", "Arial Narrow", sans-serif`,
  sans: `"Instrument Sans", system-ui, sans-serif`,
  serif: `Georgia, "Times New Roman", serif`,
}

interface Props {
  backgrounds: { id: string; url: string; label: string }[]
  cutoutUrl?: string
  initialText: LayoutText
  brandColors: { primary: string; accent: string }
  brandName: string
}

export default function Compositor({ backgrounds, cutoutUrl, initialText, brandColors, brandName }: Props) {
  const [placement, setPlacement] = useState(PLACEMENTS[0])
  const [bgId, setBgId] = useState(backgrounds[0]?.id ?? "")
  const [text, setText] = useState<LayoutText>(initialText)
  const [anchor, setAnchor] = useState<Anchor>("bottom")
  const [font, setFont] = useState<Font>("display")
  const [textColor, setTextColor] = useState("#ffffff")
  const [accent, setAccent] = useState(brandColors.accent)
  const [scrim, setScrim] = useState(0.45)
  const [focusY, setFocusY] = useState(0.5)
  const [showCutout, setShowCutout] = useState(!!cutoutUrl)
  const [cut, setCut] = useState({ x: 0.5, y: 0.55, scale: 0.55 })
  const [logo, setLogo] = useState<HTMLImageElement | null>(null)
  const [safe, setSafe] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [images, setImages] = useState<Record<string, HTMLImageElement>>({})

  useEffect(() => { setText(initialText) }, [initialText])
  useEffect(() => { if (!backgrounds.some((b) => b.id === bgId)) setBgId(backgrounds[0]?.id ?? "") }, [backgrounds, bgId])

  // Load images once (same-origin /api/media URLs keep the canvas exportable).
  useEffect(() => {
    const urls = [...backgrounds.map((b) => b.url), ...(cutoutUrl ? [cutoutUrl] : [])]
    urls.forEach((u) => {
      if (images[u]) return
      const img = new Image()
      img.onload = () => setImages((m) => ({ ...m, [u]: img }))
      img.onerror = () => setError("An image couldn't be loaded. Make sure you're signed in.")
      img.src = u
    })
  }, [backgrounds, cutoutUrl, images])

  const bg = useMemo(() => backgrounds.find((b) => b.id === bgId), [backgrounds, bgId])

  useEffect(() => {
    let cancel = false
    ;(async () => {
      try { await Promise.all(["800 48px 'Big Shoulders Display'", "600 24px 'Instrument Sans'"].map((f) => document.fonts.load(f))) } catch { /* fallback fonts */ }
      if (cancel || !canvas.current) return
      draw(canvas.current)
    })()
    return () => { cancel = true }
  })

  function draw(c: HTMLCanvasElement, overlay = safe) {
    const { w, h } = placement
    c.width = w; c.height = h
    const g = c.getContext("2d")!
    g.fillStyle = brandColors.primary
    g.fillRect(0, 0, w, h)
    const bgImg = bg && images[bg.url]
    if (bgImg) {
      const s = Math.max(w / bgImg.width, h / bgImg.height)
      const dw = bgImg.width * s, dh = bgImg.height * s
      g.drawImage(bgImg, (w - dw) / 2, (h - dh) * focusY, dw, dh)
    }
    const cutImg = showCutout && cutoutUrl ? images[cutoutUrl] : undefined
    if (cutImg) {
      const cw = w * cut.scale
      const ch = cutImg.height * (cw / cutImg.width)
      g.drawImage(cutImg, w * cut.x - cw / 2, h * cut.y - ch / 2, cw, ch)
    }

    const unit = Math.min(w, h) / 1080
    const pad = 72 * unit
    const safeTop = placement.safe ? h * placement.safe.top : pad
    const safeBottom = placement.safe ? h * placement.safe.bottom : pad
    const maxW = w - pad * 2 - (placement.safe?.right ? w * placement.safe.right - pad : 0)

    // Measure the text block, then place it.
    const hSize = (font === "display" ? 112 : 84) * unit
    const bSize = 34 * unit
    const oSize = 40 * unit
    const ctaSize = 32 * unit
    const hFont = `${font === "display" ? 800 : 700} ${hSize}px ${FONT_STACK[font]}`
    const bFont = `500 ${bSize}px ${FONT_STACK.sans}`
    const headline = font === "display" ? text.headline.toUpperCase() : text.headline
    const hLines = wrap(g, headline, hFont, maxW)
    const bLines = text.body ? wrap(g, text.body, bFont, maxW) : []
    const blockH =
      hLines.length * hSize * (font === "display" ? 0.92 : 1.08) +
      (bLines.length ? 18 * unit + bLines.length * bSize * 1.3 : 0) +
      (text.offer ? 22 * unit + oSize * 1.2 : 0) +
      (text.cta ? 30 * unit + ctaSize * 2.1 : 0)
    let y = anchor === "top" ? safeTop : anchor === "center" ? (h - blockH) / 2 : h - safeBottom - blockH

    if (scrim > 0) {
      const grad = anchor === "top" ? g.createLinearGradient(0, 0, 0, y + blockH + pad * 2)
        : anchor === "bottom" ? g.createLinearGradient(0, h, 0, y - pad * 2)
        : null
      if (grad) {
        grad.addColorStop(0, `rgba(0,0,0,${scrim})`)
        grad.addColorStop(1, "rgba(0,0,0,0)")
        g.fillStyle = grad
        g.fillRect(0, 0, w, h)
      } else {
        g.fillStyle = `rgba(0,0,0,${scrim * 0.6})`
        g.fillRect(0, y - pad, w, blockH + pad * 2)
      }
    }

    g.textBaseline = "top"
    g.fillStyle = textColor
    g.font = hFont
    for (const line of hLines) { g.fillText(line, pad, y); y += hSize * (font === "display" ? 0.92 : 1.08) }
    if (bLines.length) {
      y += 18 * unit
      g.font = bFont
      g.globalAlpha = 0.9
      for (const line of bLines) { g.fillText(line, pad, y); y += bSize * 1.3 }
      g.globalAlpha = 1
    }
    if (text.offer) {
      y += 22 * unit
      g.font = `700 ${oSize}px ${FONT_STACK.sans}`
      g.fillStyle = accent
      g.fillText(text.offer, pad, y)
      y += oSize * 1.2
    }
    if (text.cta) {
      y += 30 * unit
      g.font = `700 ${ctaSize}px ${FONT_STACK.sans}`
      const tw = g.measureText(text.cta).width
      const bh = ctaSize * 2.1, bw = tw + ctaSize * 1.6
      g.fillStyle = accent
      roundRect(g, pad, y, bw, bh, bh / 2)
      g.fill()
      g.fillStyle = contrastOn(accent)
      g.fillText(text.cta, pad + ctaSize * 0.8, y + (bh - ctaSize) / 2 + ctaSize * 0.05)
    }
    if (logo) {
      const lw = 180 * unit
      const lh = logo.height * (lw / logo.width)
      const ly = anchor === "top" ? h - safeBottom - lh : safeTop
      g.drawImage(logo, w - pad - lw, Math.max(pad * 0.6, ly), lw, lh)
    } else if (brandName) {
      g.font = `800 ${46 * unit}px ${FONT_STACK.display}`
      g.fillStyle = textColor
      const tw = g.measureText(brandName.toUpperCase()).width
      g.fillText(brandName.toUpperCase(), w - pad - tw, anchor === "top" ? h - safeBottom - 46 * unit : safeTop)
    }

    if (overlay && placement.safe) {
      g.fillStyle = "rgba(255,90,78,0.22)"
      g.fillRect(0, 0, w, h * placement.safe.top)
      g.fillRect(0, h * (1 - placement.safe.bottom), w, h * placement.safe.bottom)
      if (placement.safe.right) g.fillRect(w * (1 - placement.safe.right), h * placement.safe.top, w * placement.safe.right, h * (1 - placement.safe.top - placement.safe.bottom))
    }
  }

  function exportPng() {
    setError(null)
    const c = document.createElement("canvas")
    try {
      draw(c, false) // never bake the safe-zone overlay into the export
      c.toBlob((blob) => {
        if (!blob) { setError("Couldn't render the image."); return }
        const a = document.createElement("a")
        a.href = URL.createObjectURL(blob)
        a.download = `${(brandName || "ad").toLowerCase().replace(/\W+/g, "-")}-${placement.id}-${placement.w}x${placement.h}.png`
        a.click()
        setTimeout(() => URL.revokeObjectURL(a.href), 2000)
      }, "image/png")
    } catch {
      setError("This background can't be exported because it came from another website. Use one generated here.")
    }
  }

  function onLogo(f?: File) {
    if (!f) return
    const img = new Image()
    img.onload = () => setLogo(img)
    img.src = URL.createObjectURL(f)
  }

  if (!backgrounds.length) {
    return <Notice>Make at least one ad image in the previous step (or upload a background) to lay out an ad.</Notice>
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0">
        <div className="grid place-items-center rounded-[var(--radius-panel)] border border-line bg-[repeating-conic-gradient(#141416_0_25%,#19191c_0_50%)] bg-[length:24px_24px] p-4">
          <canvas ref={canvas} className="max-h-[70vh] max-w-full rounded-[var(--radius-media)] shadow-[0_0_0_1px_#2e2e33]" style={{ aspectRatio: `${placement.w}/${placement.h}` }} aria-label="Ad preview" />
        </div>
        {placement.note && <p className="hint mt-2">{placement.note}</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          <button className="btn btn-signal" onClick={exportPng}><Icon name="download" /> Download PNG ({placement.w}×{placement.h})</button>
          {placement.safe && (
            <label className="btn btn-ghost">
              <input type="checkbox" checked={safe} onChange={(e) => setSafe(e.target.checked)} className="accent-[var(--color-signal)]" /> Show safe zones
            </label>
          )}
        </div>
        {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
      </div>

      <div className="space-y-4">
        <ChipGroup<string> label="Placement" value={placement.id} options={PLACEMENTS.map((p) => p.id)} onChange={(id) => setPlacement(PLACEMENTS.find((p) => p.id === id)!)} format={(id) => PLACEMENTS.find((p) => p.id === id)!.label} />
        <div>
          <span className="label">Background</span>
          <div className="flex flex-wrap gap-2">
            {backgrounds.map((b) => (
              <button key={b.id} type="button" onClick={() => setBgId(b.id)} aria-pressed={b.id === bgId} title={b.label}
                className={`h-16 w-16 overflow-hidden rounded-[var(--radius-media)] border-2 ${b.id === bgId ? "border-signal" : "border-transparent opacity-70 hover:opacity-100"}`}>
                <img src={b.url} alt={b.label} className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
          <label className="mt-2 block text-[12.5px] text-smoke">Vertical crop
            <input type="range" min={0} max={1} step={0.01} value={focusY} onChange={(e) => setFocusY(Number(e.target.value))} className="w-full accent-[var(--color-signal)]" />
          </label>
        </div>
        {(["headline", "body", "offer", "cta"] as const).map((k) => (
          <div key={k}>
            <label htmlFor={`t-${k}`} className="label">{{ headline: "Headline", body: "Supporting line", offer: "Offer or price (exactly as it should appear)", cta: "Button" }[k]}</label>
            {k === "body"
              ? <textarea id={`t-${k}`} className="field min-h-16" value={text[k]} onChange={(e) => setText({ ...text, [k]: e.target.value })} />
              : <input id={`t-${k}`} className="field" value={text[k]} onChange={(e) => setText({ ...text, [k]: e.target.value })} />}
          </div>
        ))}
        <ChipGroup<Anchor> label="Text position" value={anchor} options={["top", "center", "bottom"] as Anchor[]} onChange={setAnchor} format={(a) => a[0].toUpperCase() + a.slice(1)} />
        <ChipGroup<Font> label="Headline type" value={font} options={["display", "sans", "serif"] as Font[]} onChange={setFont} format={(f) => ({ display: "Condensed", sans: "Clean", serif: "Serif" })[f]} />
        <div className="grid grid-cols-2 gap-3">
          <label className="text-[13px] text-mist">Text colour<input type="color" value={textColor} onChange={(e) => setTextColor(e.target.value)} className="mt-1 block h-9 w-full rounded border border-line bg-coal-2" /></label>
          <label className="text-[13px] text-mist">Accent<input type="color" value={accent} onChange={(e) => setAccent(e.target.value)} className="mt-1 block h-9 w-full rounded border border-line bg-coal-2" /></label>
        </div>
        <label className="block text-[13px] text-mist">Shade behind text
          <input type="range" min={0} max={0.85} step={0.05} value={scrim} onChange={(e) => setScrim(Number(e.target.value))} className="w-full accent-[var(--color-signal)]" />
        </label>
        {cutoutUrl && (
          <div className="space-y-2 rounded-[var(--radius-ctl)] border border-line p-3">
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input type="checkbox" checked={showCutout} onChange={(e) => setShowCutout(e.target.checked)} className="accent-[var(--color-signal)]" /> Place your original product photo on top
            </label>
            {showCutout && (["x", "y", "scale"] as const).map((k) => (
              <label key={k} className="block text-[12.5px] text-smoke">{{ x: "Left / right", y: "Up / down", scale: "Size" }[k]}
                <input type="range" min={k === "scale" ? 0.15 : 0} max={k === "scale" ? 1 : 1} step={0.01} value={cut[k]} onChange={(e) => setCut({ ...cut, [k]: Number(e.target.value) })} className="w-full accent-[var(--color-signal)]" />
              </label>
            ))}
          </div>
        )}
        <label className="block">
          <span className="label">Logo (PNG with transparency works best)</span>
          <input type="file" accept="image/png,image/svg+xml,image/webp" onChange={(e) => onLogo(e.target.files?.[0])} className="text-sm text-smoke file:mr-3 file:rounded-md file:border-0 file:bg-coal-3 file:px-3 file:py-1.5 file:text-paper" />
        </label>
      </div>
    </div>
  )
}

function wrap(g: CanvasRenderingContext2D, text: string, font: string, maxW: number): string[] {
  g.font = font
  const lines: string[] = []
  for (const para of text.split("\n")) {
    let line = ""
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const test = line ? `${line} ${word}` : word
      if (g.measureText(test).width > maxW && line) { lines.push(line); line = word } else line = test
    }
    if (line) lines.push(line)
  }
  return lines.slice(0, 6)
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath()
  g.moveTo(x + r, y)
  g.arcTo(x + w, y, x + w, y + h, r)
  g.arcTo(x + w, y + h, x, y + h, r)
  g.arcTo(x, y + h, x, y, r)
  g.arcTo(x, y, x + w, y, r)
  g.closePath()
}

export function contrastOn(hex: string): string {
  const m = hex.replace("#", "").match(/.{2}/g)
  if (!m) return "#000000"
  const [r, gg, b] = m.map((x) => parseInt(x, 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * gg + 0.0722 * b > 0.4 ? "#000000" : "#ffffff"
}
