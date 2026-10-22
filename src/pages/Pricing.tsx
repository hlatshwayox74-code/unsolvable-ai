import { Link } from "react-router-dom"
import { estimateCost, PRICING, type GenerationParams, type Mode } from "../../shared/catalog.ts"
import { usd } from "../lib/format.ts"

const EXAMPLES: { what: string; id: string; mode: Mode; p: GenerationParams; chars?: number }[] = [
  { what: "Product photo, high quality", id: "gpt-image-2", mode: "t2i", p: { quality: "high", aspect: "1:1", variations: 1 } },
  { what: "5-second cinematic clip", id: "runway-gen45", mode: "t2v", p: { duration: 5 } },
  { what: "8-second ad shot with sound, 1080p", id: "veo-31-fast", mode: "t2v", p: { duration: 8, resolution: "1080p" } },
  { what: "8-second hero shot with dialogue", id: "veo-31", mode: "t2v", p: { duration: 8, resolution: "1080p" } },
  { what: "4-second storyboard draft", id: "veo-31-lite", mode: "t2v", p: { duration: 4, resolution: "720p" } },
  { what: "30-second voiceover (~75 words)", id: "eleven-v4", mode: "tts", p: {}, chars: 420 },
]

export default function Pricing() {
  return (
    <div className="mx-auto max-w-[1100px] px-5 py-16 md:px-8">
      <h1 className="display text-7xl md:text-8xl">Pricing</h1>
      <div className="mt-6 max-w-2xl space-y-4 text-mist">
        <p>Unsolvable.ai passes through what each provider charges. A credit is one US cent of provider cost, with a {Math.round((PRICING.markup - 1) * 100)}% margin to run the platform. You see the credits and the dollar estimate on every Generate button before anything is charged.</p>
        <p className="rounded-[var(--radius-ctl)] border border-signal/40 bg-signal/[0.06] px-4 py-3 text-signal-soft">
          Plans and payments aren't live yet. Right now the studio is invite-only and runs on the workspace owner's own provider keys.
        </p>
      </div>

      <h2 className="display mt-16 text-5xl">What things cost</h2>
      <div className="mt-6 overflow-x-auto rounded-[var(--radius-panel)] border border-line">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="bg-coal text-[12.5px] text-smoke">
            <tr><th className="px-5 py-3 font-semibold">Output</th><th className="px-5 py-3 font-semibold">Provider cost</th><th className="px-5 py-3 font-semibold">Credits</th></tr>
          </thead>
          <tbody>
            {EXAMPLES.map((e) => {
              const c = estimateCost(e.id, e.mode, e.p, e.chars ?? 0)
              return (
                <tr key={e.what} className="border-t border-line">
                  <td className="px-5 py-3.5">{e.what}</td>
                  <td className="px-5 py-3.5 text-mist">{c.basis === "estimate" ? "≈" : ""}{usd(c.usd)} <span className="text-smoke">({c.breakdown})</span></td>
                  <td className="px-5 py-3.5 font-semibold">{c.credits}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="hint mt-3">Rates from Runway, Google, OpenAI and ElevenLabs as published on 22 October 2026. OpenAI image and ElevenLabs prices vary by plan and are shown as estimates. Failed and cancelled generations are refunded.</p>

      <div className="mt-16 flex flex-wrap gap-3">
        <Link to="/signup" className="btn btn-signal">Create an account</Link>
        <Link to="/models" className="btn btn-ghost">Compare models</Link>
      </div>
    </div>
  )
}
