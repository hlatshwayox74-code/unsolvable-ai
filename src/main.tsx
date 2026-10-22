import { lazy, StrictMode, Suspense } from "react"
import { createRoot } from "react-dom/client"
import { BrowserRouter, Link, MemoryRouter, Outlet, Route, Routes, useLocation, useSearchParams } from "react-router-dom"
import { useEffect } from "react"
import { SiteFooter, SiteHeader } from "./components/site.tsx"
import { Spinner } from "./components/ui.tsx"
import { AuthProvider, useAuth } from "./lib/auth.tsx"
import Home from "./pages/Home.tsx"
import "./styles.css"
import { installPreviewApi, IS_PREVIEW } from "./preview.ts"

if (IS_PREVIEW) installPreviewApi()
const Router = IS_PREVIEW ? MemoryRouter : BrowserRouter

function PreviewBanner() {
  if (!IS_PREVIEW) return null
  return (
    <div role="note" className="bg-signal px-4 py-2 text-center text-[13px] font-semibold text-ink">
      Design preview. Sign-in and generation are switched off here; they work on the deployed site.
    </div>
  )
}

const Models = lazy(() => import("./pages/Models.tsx"))
const Pricing = lazy(() => import("./pages/Pricing.tsx"))
const Auth = lazy(() => import("./pages/Auth.tsx"))
const StudioLayout = lazy(() => import("./pages/studio/StudioLayout.tsx"))
const Dashboard = lazy(() => import("./pages/studio/Dashboard.tsx"))
const Workspace = lazy(() => import("./pages/studio/Workspace.tsx"))
const VoiceStudio = lazy(() => import("./pages/studio/VoiceStudio.tsx"))
const AdStudio = lazy(() => import("./pages/studio/ads/AdStudio.tsx"))
const Library = lazy(() => import("./pages/studio/Library.tsx"))
const Settings = lazy(() => import("./pages/studio/Settings.tsx"))
const Help = lazy(() => import("./pages/studio/Help.tsx"))

function Loading() {
  return <div className="grid min-h-[50vh] place-items-center text-smoke"><Spinner className="h-6 w-6" /></div>
}

function SiteShell() {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
  return (
    <>
      <SiteHeader />
      <main id="main"><Suspense fallback={<Loading />}><Outlet /></Suspense></main>
      <SiteFooter />
    </>
  )
}

function Voice() {
  const [q] = useSearchParams()
  return <VoiceStudio initialScript={q.get("prompt") ?? ""} />
}

/** Invite links land on "/": send the visitor to choose a password. */
function InviteRedirect() {
  const { inviteToken } = useAuth()
  const { pathname } = useLocation()
  if (inviteToken && pathname !== "/join") return <Auth mode="signup" />
  return null
}

function NotFound() {
  return (
    <div className="mx-auto grid min-h-[60vh] max-w-xl content-center px-5 py-20">
      <h1 className="display text-8xl">Not here.</h1>
      <p className="mt-3 text-mist">That page doesn't exist. It may have moved.</p>
      <Link to="/" className="btn btn-signal mt-8 self-start">Go home</Link>
    </div>
  )
}

function App() {
  const { inviteToken } = useAuth()
  if (inviteToken) {
    return <Suspense fallback={<Loading />}><SiteHeader /><InviteRedirect /></Suspense>
  }
  return (
    <Routes>
      <Route element={<SiteShell />}>
        <Route index element={<Home />} />
        <Route path="models" element={<Models />} />
        <Route path="pricing" element={<Pricing />} />
        <Route path="login" element={<Auth mode="login" />} />
        <Route path="signup" element={<Auth mode="signup" />} />
        <Route path="*" element={<NotFound />} />
      </Route>
      <Route path="studio" element={<Suspense fallback={<Loading />}><StudioLayout /></Suspense>}>
        <Route index element={<Suspense fallback={<Loading />}><Dashboard /></Suspense>} />
        <Route path="image" element={<Suspense fallback={<Loading />}><Workspace key="image" kind="image" /></Suspense>} />
        <Route path="video" element={<Suspense fallback={<Loading />}><Workspace key="video" kind="video" /></Suspense>} />
        <Route path="voice" element={<Suspense fallback={<Loading />}><Voice /></Suspense>} />
        <Route path="ads" element={<Suspense fallback={<Loading />}><AdStudio /></Suspense>} />
        <Route path="library" element={<Suspense fallback={<Loading />}><Library /></Suspense>} />
        <Route path="settings" element={<Suspense fallback={<Loading />}><Settings /></Suspense>} />
        <Route path="help" element={<Suspense fallback={<Loading />}><Help /></Suspense>} />
      </Route>
    </Routes>
  )
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Router>
      <PreviewBanner />
      <AuthProvider>
        <App />
      </AuthProvider>
    </Router>
  </StrictMode>,
)
