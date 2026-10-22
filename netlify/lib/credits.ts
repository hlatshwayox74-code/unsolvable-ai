import { creditsEnabled } from "./auth.ts"
import { HttpError } from "./util.ts"

/**
 * Credit accounting on Netlify Database. Inactive unless CREDITS_ENABLED=true, in which case
 * every generation reserves its estimated credits before the provider is called and gets an
 * idempotent refund if the job fails. The unique (job_id, reason) index makes retries safe.
 */

type Pool = { connect(): Promise<Client> }
type Client = { query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>; release(): void }

// Netlify Database is opt-in (it consumes Netlify credits). Enabling credits means:
// `npm i @netlify/database`, move db/migrations/* to netlify/database/migrations/, set
// CREDITS_ENABLED=true, deploy. See docs/DEPLOYMENT.md. The specifier is held in a variable
// so the bundle doesn't require the package while credits are off.
const DB_MODULE = "@netlify/database"
let poolPromise: Promise<Pool> | null = null
async function pool(): Promise<Pool> {
  poolPromise ??= (import(/* @vite-ignore */ DB_MODULE) as Promise<{ getDatabase(): { pool: unknown } }>)
    .then((m) => m.getDatabase().pool as Pool)
    .catch(() => {
      poolPromise = null
      throw new HttpError(503, "Credits are switched on but Netlify Database isn't set up. See DEPLOYMENT.md.", "not_configured")
    })
  return poolPromise
}

async function tx<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const c = await (await pool()).connect()
  try {
    await c.query("BEGIN")
    const out = await fn(c)
    await c.query("COMMIT")
    return out
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {})
    throw e
  } finally {
    c.release()
  }
}

export async function getBalance(userId: string): Promise<number | null> {
  if (!creditsEnabled()) return null
  return tx(async (c) => {
    await c.query("INSERT INTO credit_accounts (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING", [userId])
    const r = await c.query("SELECT balance FROM credit_accounts WHERE user_id = $1", [userId])
    return Number(r.rows[0]?.balance ?? 0)
  })
}

/** Returns credits charged (0 when credits are disabled). Throws 402 if the balance is too low. */
export async function reserveCredits(userId: string, jobId: string, credits: number): Promise<number> {
  if (!creditsEnabled() || credits <= 0) return 0
  return tx(async (c) => {
    await c.query("INSERT INTO credit_accounts (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING", [userId])
    const upd = await c.query(
      "UPDATE credit_accounts SET balance = balance - $1, updated_at = NOW() WHERE user_id = $2 AND balance >= $1 RETURNING balance",
      [credits, userId],
    )
    if (!upd.rowCount) throw new HttpError(402, `This needs ${credits} credits and your balance is too low.`, "insufficient_credits")
    await c.query("INSERT INTO credit_ledger (user_id, delta, reason, job_id) VALUES ($1, $2, 'reserve', $3)", [userId, -credits, jobId])
    return credits
  })
}

/** Refund a failed/cancelled job exactly once. */
export async function refundCredits(userId: string, jobId: string, credits: number, note: string): Promise<void> {
  if (!creditsEnabled() || credits <= 0) return
  await tx(async (c) => {
    const ins = await c.query(
      "INSERT INTO credit_ledger (user_id, delta, reason, job_id, note) VALUES ($1, $2, 'refund', $3, $4) ON CONFLICT DO NOTHING",
      [userId, credits, jobId, note.slice(0, 200)],
    )
    if (ins.rowCount) await c.query("UPDATE credit_accounts SET balance = balance + $1, updated_at = NOW() WHERE user_id = $2", [credits, userId])
  })
}
