import type { CostEstimate } from "../../shared/catalog.ts"

export function usd(n: number): string {
  if (n === 0) return "$0"
  if (n < 0.01) return "<$0.01"
  return "$" + (n < 1 ? n.toFixed(3).replace(/0$/, "") : n.toFixed(2))
}

export function costLabel(c: CostEstimate): string {
  return `${c.credits} credit${c.credits === 1 ? "" : "s"} · ≈${usd(c.usd)}`
}

export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000))
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h ago`
  return new Date(iso).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })
}

export function elapsed(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000))
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`
}
