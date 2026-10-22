import { Link } from "react-router-dom"
import { MODE_LABEL, MODELS, PROVIDERS, type Kind } from "../../shared/catalog.ts"

const GROUPS: { kind: Kind; title: string; to: string }[] = [
  { kind: "video", title: "Video", to: "/studio/video" },
  { kind: "image", title: "Image", to: "/studio/image" },
  { kind: "audio", title: "Voice", to: "/studio/voice" },
]

export default function Models() {
  return (
    <div className="mx-auto max-w-[1320px] px-5 py-16 md:px-8">
      <h1 className="display text-7xl md:text-8xl">Models</h1>
      <p className="mt-4 max-w-2xl text-mist">
        Every model here is called through its maker's official API. Details were checked against each provider's documentation on 22 October 2026.
        "Preview" means the provider hasn't marked it generally available yet.
      </p>
      {GROUPS.map((g) => (
        <section key={g.kind} className="mt-16">
          <div className="flex items-end justify-between border-b border-line pb-3">
            <h2 className="display text-5xl">{g.title}</h2>
            <Link to={g.to} className="text-sm text-smoke hover:text-paper">Open {g.title}</Link>
          </div>
          <div className="divide-y divide-line">
            {MODELS.filter((m) => m.kind === g.kind).map((m) => (
              <article key={m.id} className="grid gap-4 py-6 md:grid-cols-[260px_minmax(0,1fr)_280px]">
                <div>
                  <h3 className="text-lg font-semibold">{m.label}</h3>
                  <p className="text-[13px] text-smoke">via {PROVIDERS[m.provider].label}{m.lifecycle === "preview" ? " · Preview" : ""}</p>
                </div>
                <div className="space-y-1.5">
                  <p className="text-mist">{m.summary}</p>
                  <p className="text-[13.5px] text-smoke">Best for: {m.bestFor}</p>
                  <p className="text-[13.5px] text-smoke">
                    {m.modes.map((x) => MODE_LABEL[x]).join(" · ")}
                    {m.durations ? ` · ${m.durations.join("/")}s` : ""}
                    {m.resolutions ? ` · ${m.resolutions.join(", ")}` : ""}
                    {m.audio === "native" ? " · generates sound" : ""}
                    {m.maxRefImages ? ` · up to ${m.maxRefImages} reference images` : ""}
                  </p>
                </div>
                <p className="text-[13.5px] text-mist">{m.priceNote}{m.priceBasis === "estimate" ? " (estimate)" : ""}</p>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
