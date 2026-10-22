import type { UserSignupEvent } from "@netlify/functions"
import { env } from "../lib/util.ts"

/**
 * Identity events. On signup, the workspace owner (OWNER_EMAIL) gets the admin role, which
 * lets them generate. Everyone else starts as "member" and can't spend provider credit until
 * an admin adds the "creator" role in Netlify → Identity, or credits are switched on.
 * Role changes apply on the user's next login or token refresh, not immediately.
 */
export default {
  userSignup(event: UserSignupEvent) {
    const owner = env("OWNER_EMAIL")?.trim().toLowerCase()
    const email = event.user.email?.trim().toLowerCase()
    const existing = (event.user.appMetadata?.roles as string[] | undefined) ?? []
    const roles = new Set([...existing, "member"])
    if (owner && email === owner) roles.add("admin")
    return { user: { ...event.user, appMetadata: { ...event.user.appMetadata, roles: [...roles] } } }
  },
}
