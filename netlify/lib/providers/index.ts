import { PROVIDERS, type ProviderId } from "../../../shared/catalog.ts"
import { env } from "../util.ts"
import { elevenlabs } from "./elevenlabs.ts"
import { engine } from "./engine.ts"
import { google } from "./google.ts"
import { higgsfield } from "./higgsfield.ts"
import { openai } from "./openai.ts"
import { runway } from "./runway.ts"
import type { ProviderAdapter } from "./types.ts"

export const ADAPTERS: Record<ProviderId, ProviderAdapter> = { engine, runway, google, openai, elevenlabs, higgsfield }

/**
 * Paid third-party AI APIs are OFF unless the owner sets ALLOW_EXTERNAL_PROVIDERS=true.
 * With it off, only the self-hosted engine can generate, even if provider keys are present.
 */
export function externalAllowed(): boolean {
  return env("ALLOW_EXTERNAL_PROVIDERS") === "true"
}

export function providerUsable(id: ProviderId): boolean {
  return ADAPTERS[id].isConfigured() && (!PROVIDERS[id].external || externalAllowed())
}

export function adapterFor(id: ProviderId): ProviderAdapter {
  return ADAPTERS[id]
}

export function providerStatus(): Record<ProviderId, boolean> {
  return Object.fromEntries(Object.keys(ADAPTERS).map((k) => [k, providerUsable(k as ProviderId)])) as Record<ProviderId, boolean>
}
