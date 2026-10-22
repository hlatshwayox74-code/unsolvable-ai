import { getUser, type User } from "@netlify/identity"
import { env, HttpError } from "./util.ts"

export interface Actor {
  id: string
  email?: string
  roles: string[]
  canGenerate: boolean
}

export function generationRoles(): string[] {
  return (env("GENERATION_ROLES") ?? "admin,creator").split(",").map((r) => r.trim()).filter(Boolean)
}

export function creditsEnabled(): boolean {
  return env("CREDITS_ENABLED") === "true"
}

export function toActor(user: User): Actor {
  const roles = user.roles ?? []
  const allowed = generationRoles()
  return {
    id: user.id,
    email: user.email,
    roles,
    // With credits on, any signed-in user may generate (balance is checked separately).
    canGenerate: creditsEnabled() || roles.some((r) => allowed.includes(r)),
  }
}

/** Resolve the signed-in Netlify Identity user or throw 401. */
export async function requireActor(): Promise<Actor> {
  let user: User | null = null
  try {
    user = await getUser()
  } catch {
    user = null
  }
  if (!user) throw new HttpError(401, "Sign in to continue.", "unauthenticated")
  return toActor(user)
}

export async function requireGenerator(): Promise<Actor> {
  const actor = await requireActor()
  if (!actor.canGenerate) {
    throw new HttpError(
      403,
      "Your account can't run generations yet. Ask the workspace owner to give you the creator role.",
      "forbidden",
    )
  }
  return actor
}
