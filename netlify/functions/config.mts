import type { Config } from "@netlify/functions"
import { getUser } from "@netlify/identity"
import { creditsEnabled, generationRoles, toActor } from "../lib/auth.ts"
import { getBalance } from "../lib/credits.ts"
import { directorConfigured } from "../lib/director.ts"
import { providerStatus } from "../lib/providers/index.ts"
import { env, handleError, json } from "../lib/util.ts"

/** Public status: which providers are configured and what the signed-in user can do. Never returns secrets. */
export default async () => {
  try {
    let user = null
    try { user = await getUser() } catch { user = null }
    const actor = user ? toActor(user) : null
    const secret = env("MEDIA_SIGNING_SECRET")
    let balance: number | null = null
    if (actor && creditsEnabled()) {
      try { balance = await getBalance(actor.id) } catch { balance = null }
    }
    return json({
      providers: providerStatus(),
      director: directorConfigured(),
      storageReady: !!secret && secret.length >= 32,
      credits: { enabled: creditsEnabled(), balance },
      billing: { connected: false },
      generationRoles: generationRoles(),
      user: actor ? { id: actor.id, email: actor.email, roles: actor.roles, canGenerate: actor.canGenerate } : null,
    })
  } catch (e) {
    return handleError(e)
  }
}

export const config: Config = { path: "/api/config", method: "GET" }
