import { Link } from "react-router-dom"
import { estimateCost, PRICING, type GenerationParams, type Mode } from "../../shared/catalog.ts"
import { usd } from "../lib/format.ts"

const EXAMPLES: { what: string; id: string; mode: Mode; p: GenerationParams; chars?: number }[] = [
  { what: "Product photo (FLUX.2 klein 4B)", id: "flux2-klein-4b", mode: "t2i", p: { aspect: "1:1", variations: 1 } },
  { what: "Four product photo variations", id: "flux2-klein-4b", mode: "t2i", p: { aspect: "1:1", variations: 4 } },
  { what: "5-second 720p clip (Wan 2.2)", id: "wan22-ti2v-5b", mode: "t2v", p: { duration: 5 } },
  { what: "30-second voiceover, ~75 words (Kokoro)", id: "kokoro-82m", mode: "tts", p: {}, chars: 420 },
  { what: "Assemble a 15-second ad with voiceover and captions", id: "engine-compose", mode: "compose", p: {} },
]

export default function Pricing() {
  return (
    <div className="mx-auto max-w-[1100px] px-5 py-16 md:px-8">
      <h1 className="display text-7xl md:text-8xl">Pricing</h1>
      <div className="mt-6 max-w-2xl space-y-4 text-mist">
        <p>Everything runs on our own GPU with open-weight models, so the cost of an output is the GPU time it takes. A credit is one US cent of that cost, with a {Math.round((PRICING.markup - 1) * 100)}% margin to run the platform, and every output costs at least one credit. You see the estimate on every Generate button.</p>
        <p className="rounded-[var(--radius-ctl)] border border-signal/40 bg-signal/[0.06] px-4 py-3 text-signal-soft">
          Plans and payments aren't live yet. Right now the studio is invite-only. The GPU itself has a running cost while it's switched on, whether or not anyone is generating.
        </p>
      </div>

      <h2 className="display mt-16 text-5xl">What things cost</h2>
      <div className="mt-6 overflow-x-auto rounded-[var(--radius-panel)] border border-line">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="bg-coal text-[12.5px] text-smoke">
            <tr><th className="px-5 py-3 font-semibold">Output</th><th className="px-5 py-3 font-semibold">GPU cost</th><th className="px-5 py-3 font-semibold">Credits</th></tr>
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
      <p className="hint mt-3">Estimated from published speeds on an RTX 4090 at $0.69/hour; the engine records the real seconds for every job, and these estimates will be replaced with measured numbers. Failed and cancelled generations are refunded.</p>

      <div className="mt-16 flex flex-wrap gap-3">
        <Link to="/signup" className="btn btn-signal">Create an account</Link>
        <Link to="/models" className="btn btn-ghost">Compare models</Link>
      </div>
    </div>
  )
}
