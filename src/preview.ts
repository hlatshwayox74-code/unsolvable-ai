/**
 * Design-preview build only (VITE_PREVIEW=1). There is no server behind the preview, so API
 * calls get the same answers a signed-out visitor gets from an unconfigured deployment.
 * Nothing here fakes a generation.
 */
export const IS_PREVIEW = import.meta.env.VITE_PREVIEW === "1"

export function installPreviewApi() {
  const real = window.fetch.bind(window)
  window.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
    const path = new URL(url, location.href).pathname
    if (path.endsWith("/api/config")) {
      return Response.json({
        providers: { engine: false, runway: false, google: false, openai: false, elevenlabs: false, higgsfield: false }, externalProviders: false,
        director: null, storageReady: true, credits: { enabled: false, balance: null },
        billing: { connected: false }, generationRoles: ["admin", "creator"], user: null,
      })
    }
    if (path.includes("/api/") || path.includes("/.netlify/")) {
      return Response.json({ error: "This is a design preview. Sign-in and generation work on the deployed site." }, { status: 401 })
    }
    return real(input, init)
  }
}
