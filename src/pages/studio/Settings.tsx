import { MODELS, PROVIDERS, type ProviderId } from "../../../shared/catalog.ts"
import { Notice } from "../../components/ui.tsx"
import { useConfig } from "../../lib/api.ts"
import { useAuth } from "../../lib/auth.tsx"

export default function Settings() {
  const { user } = useAuth()
  const { config, error, reload } = useConfig(user?.id)

  return (
    <div className="max-w-4xl space-y-8">
      <div>
        <h1 className="display text-5xl">Settings</h1>
        <p className="mt-1 text-sm text-smoke">Keys and engine settings live in Netlify, never in the browser. Change them under Project configuration → Environment variables, then redeploy.</p>
      </div>
      {error && <Notice tone="error">{error}</Notice>}

      <section className="panel space-y-2 p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold">Self-hosted engine</h2>
          <button className="btn btn-quiet text-sm" onClick={reload}>Check again</button>
        </div>
        {!config ? <p className="text-sm text-smoke">…</p> : !config.providers.engine ? (
          <p className="text-sm text-mist">Not connected. Start the engine on a GPU machine (docs/ENGINE.md), then add <code>ENGINE_URL</code> and <code>ENGINE_TOKEN</code> here in Netlify and redeploy.</p>
        ) : config.engine?.online ? (
          <p className="text-sm"><span className="text-go">Online</span>{config.engine.gpu ? ` on ${config.engine.gpu}${config.engine.vramGb ? ` (${config.engine.vramGb} GB)` : ""}` : " — no GPU detected, so only voice and the ad assembler can run"}{config.engine.queued ? ` · ${config.engine.queued} waiting` : ""}.{config.engine.testMode && <b className="text-[#ffb3ad]"> Test mode is on: it only draws test patterns. Turn ENGINE_TEST_MODE off.</b>}</p>
        ) : (
          <p className="text-sm"><span className="text-[#ffb3ad]">Configured but not answering.</span> The GPU machine may be stopped, or ENGINE_URL is wrong.</p>
        )}
        <p className="hint">Runs FLUX.2 [klein] 4B (images), Wan 2.2 TI2V-5B (video), Kokoro-82M (voice) and the ad assembler on hardware you control. No per-generation fees to anyone.</p>
        <p className="text-sm text-mist">
          Third-party AI services are <b className={config?.externalProviders ? "text-signal" : "text-go"}>{config?.externalProviders ? "switched on" : "switched off"}</b>.
          {config?.externalProviders ? " Their models appear in the studio and are billed to the keys below." : " Their keys below are ignored. To switch them on, set ALLOW_EXTERNAL_PROVIDERS=true in Netlify."}
        </p>
      </section>

      <section className="panel overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="font-semibold">Providers</h2>
          <button className="btn btn-quiet text-sm" onClick={reload}>Check again</button>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="text-[12px] text-smoke">
            <tr><th className="px-5 py-2 font-semibold">Provider</th><th className="px-5 py-2 font-semibold">Variable</th><th className="px-5 py-2 font-semibold">Unlocks</th><th className="px-5 py-2 font-semibold">Status</th></tr>
          </thead>
          <tbody>
            {(Object.keys(PROVIDERS) as ProviderId[]).map((p) => (
              <tr key={p} className="border-t border-line align-top">
                <td className="px-5 py-3 font-semibold"><a href={PROVIDERS[p].docs} target="_blank" rel="noreferrer" className="hover:text-signal">{PROVIDERS[p].label}</a></td>
                <td className="px-5 py-3"><code className="text-[12.5px] text-mist">{PROVIDERS[p].envKey}</code></td>
                <td className="px-5 py-3 text-smoke">{MODELS.filter((m) => m.provider === p).map((m) => m.label).join(", ")}{p === "google" || p === "openai" ? " · creative director" : ""}</td>
                <td className="px-5 py-3">{config ? (config.providers[p] ? <span className="text-go">Connected</span> : PROVIDERS[p].external && !config.externalProviders ? <span className="text-smoke">Switched off</span> : <span className="text-smoke">Not set</span>) : "…"}</td>
              </tr>
            ))}
            <tr className="border-t border-line align-top">
              <td className="px-5 py-3 font-semibold">Private storage</td>
              <td className="px-5 py-3"><code className="text-[12.5px] text-mist">MEDIA_SIGNING_SECRET</code></td>
              <td className="px-5 py-3 text-smoke">Uploads, provider access to your references, background jobs</td>
              <td className="px-5 py-3">{config ? (config.storageReady ? <span className="text-go">Ready</span> : <span className="text-[#ffb3ad]">Missing</span>) : "…"}</td>
            </tr>
          </tbody>
        </table>
        <p className="border-t border-line px-5 py-3 text-[12.5px] text-smoke">"Connected" means a key is present. It doesn't prove the key is valid or has credit — the first generation will tell you.</p>
      </section>

      <section className="panel space-y-2 p-5">
        <h2 className="font-semibold">Your account</h2>
        {user ? (
          <dl className="grid grid-cols-[140px_1fr] gap-y-1.5 text-sm">
            <dt className="text-smoke">Email</dt><dd>{user.email}</dd>
            <dt className="text-smoke">Roles</dt><dd>{config?.user?.roles.length ? config.user.roles.join(", ") : "none"}</dd>
            <dt className="text-smoke">Can generate</dt><dd>{config?.user?.canGenerate ? "Yes" : `No — needs one of: ${config?.generationRoles.join(", ")}`}</dd>
          </dl>
        ) : <p className="text-sm text-smoke">Not signed in.</p>}
        <p className="hint">Roles are managed in Netlify → Identity. A role change applies after the user signs out and back in.</p>
      </section>

      <section className="panel space-y-2 p-5">
        <h2 className="font-semibold">Credits and billing</h2>
        {config?.credits.enabled ? (
          <p className="text-sm">Credits are on. Balance: <b>{config.credits.balance ?? "unavailable"}</b>. Each generation reserves its estimated credits and refunds them automatically if it fails or is cancelled.</p>
        ) : (
          <p className="text-sm text-mist">Credits are off. Generations are limited to people with the admin or creator role, and provider charges go straight to the keys above.</p>
        )}
        <p className="text-sm text-mist">Payments aren't connected, so nobody can buy credits yet. See DEPLOYMENT.md for adding Paystack or Stripe.</p>
      </section>
    </div>
  )
}
