import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import type { JobView } from "../../../shared/catalog.ts"
import { JobCard } from "../../components/studio-parts.tsx"
import { Notice, Segmented } from "../../components/ui.tsx"
import { useJobs } from "../../lib/api.ts"
import { useAuth } from "../../lib/auth.tsx"
import { usd } from "../../lib/format.ts"

type Filter = "all" | "image" | "video" | "audio"

export default function Library() {
  const { user } = useAuth()
  const { jobs, error } = useJobs(!!user)
  const [filter, setFilter] = useState<Filter>("all")
  const [q, setQ] = useState("")
  const nav = useNavigate()

  const shown = useMemo(
    () => jobs.filter((j) => (filter === "all" || j.kind === filter) && (!q || j.prompt.toLowerCase().includes(q.toLowerCase()) || j.modelLabel.toLowerCase().includes(q.toLowerCase()))),
    [jobs, filter, q],
  )
  const spent = jobs.filter((j) => j.status === "completed").reduce((s, j) => s + j.cost.usd, 0)

  function reuse(j: JobView) {
    const path = j.kind === "audio" ? "/studio/voice" : `/studio/${j.kind}`
    nav(`${path}?mode=${j.mode}&prompt=${encodeURIComponent(j.prompt)}`)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display text-5xl">Library</h1>
          <p className="mt-1 text-sm text-smoke">
            {jobs.length} generations · about {usd(spent)} in provider costs for completed work. Files are stored privately; only you can open them.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <input className="field w-64" type="search" placeholder="Search prompts or models" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
          <Segmented<Filter> label="Type" value={filter} onChange={setFilter} options={[
            { value: "all", label: "All" }, { value: "image", label: "Images" }, { value: "video", label: "Videos" }, { value: "audio", label: "Audio" },
          ]} />
        </div>
      </div>
      {!user && <Notice>Sign in to see your library.</Notice>}
      {error && user && <Notice tone="error">{error}</Notice>}
      {user && shown.length === 0 && <p className="text-sm text-smoke">{jobs.length ? "Nothing matches that search." : "Nothing here yet — your generations are saved automatically."}</p>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {shown.map((j) => <JobCard key={j.id} job={j} onRetry={reuse} />)}
      </div>
    </div>
  )
}
