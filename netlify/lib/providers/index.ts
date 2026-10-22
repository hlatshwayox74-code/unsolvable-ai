import type { ProviderId } from "../../../shared/catalog.ts"
import { elevenlabs } from "./elevenlabs.ts"
import { google } from "./google.ts"
import { higgsfield } from "./higgsfield.ts"
import { openai } from "./openai.ts"
import { runway } from "./runway.ts"
import type { ProviderAdapter } from "./types.ts"

export const ADAPTERS: Record<ProviderId, ProviderAdapter> = { runway, google, openai, elevenlabs, higgsfield }

export function adapterFor(id: ProviderId): ProviderAdapter {
  return ADAPTERS[id]
}

export function providerStatus(): Record<ProviderId, boolean> {
  return Object.fromEntries(Object.entries(ADAPTERS).map(([k, a]) => [k, a.isConfigured()])) as Record<ProviderId, boolean>
}
