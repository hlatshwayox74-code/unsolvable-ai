import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { describe, expect, it, vi } from "vitest"

vi.mock("@netlify/identity", () => ({
  getUser: async () => null, handleAuthCallback: async () => null, onAuthChange: () => () => {},
  login: vi.fn(), logout: vi.fn(), signup: vi.fn(), requestPasswordRecovery: vi.fn(), acceptInvite: vi.fn(),
}))
vi.stubGlobal("fetch", vi.fn(async () => Response.json({
  providers: { runway: false, google: false, openai: false, elevenlabs: false, higgsfield: false },
  director: null, storageReady: false, credits: { enabled: false, balance: null }, billing: { connected: false }, generationRoles: ["admin"], user: null,
})))
vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener() {}, removeEventListener() {} }))

const { AuthProvider } = await import("../src/lib/auth.tsx")
const { default: Home } = await import("../src/pages/Home.tsx")
const { default: Workspace } = await import("../src/pages/studio/Workspace.tsx")
const { contrastOn } = await import("../src/pages/studio/ads/Compositor.tsx")

const wrap = (ui: React.ReactNode, path = "/") => render(<MemoryRouter initialEntries={[path]}><AuthProvider>{ui}</AuthProvider></MemoryRouter>)

describe("marketing home", () => {
  it("leads with the product promise and a working prompt", async () => {
    wrap(<Home />)
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/Type the idea/)
    expect(screen.getByLabelText("Describe a shot")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Open in studio/ })).toBeInTheDocument()
    // Price table comes from the shared catalogue
    expect(screen.getAllByText(/Runway Gen-4.5/).length).toBeGreaterThan(0)
  })
})

describe("video workspace", () => {
  it("asks visitors to sign in and keeps Generate disabled", async () => {
    wrap(<Workspace kind="video" />, "/studio/video")
    expect(await screen.findByText(/Sign in to generate/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Generate/ })).toBeDisabled()
  })
  it("shows the cost on the Generate button", async () => {
    wrap(<Workspace kind="video" />, "/studio/video?prompt=hello")
    expect(await screen.findByRole("button", { name: /Generate.*90 credits.*0\.60/ })).toBeInTheDocument()
  })
  it("prefills the prompt from the link", () => {
    wrap(<Workspace kind="video" />, "/studio/video?prompt=a%20red%20car")
    expect(screen.getByLabelText("Prompt")).toHaveValue("a red car")
  })
})

describe("ad layout", () => {
  it("picks readable button text for the accent colour", () => {
    expect(contrastOn("#ffd100")).toBe("#000000")
    expect(contrastOn("#1a1a1a")).toBe("#ffffff")
  })
})
