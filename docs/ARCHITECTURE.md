# Architecture — Unsolvable.ai

## Overview

```
Browser (React + Vite SPA)
   │  fetch /api/*  (Identity JWT cookie nf_jwt / Authorization header)
   ▼
Netlify Functions (TypeScript, v2)              Netlify Identity  — accounts, roles
   ├─ /api/config        provider + auth status  Netlify Blobs     — jobs + media (private)
   ├─ /api/upload        reference uploads       Netlify Database  — credit ledger (opt-in)
   ├─ /api/generate      validate → cost → submit
   ├─ /api/jobs[/:id]    list / poll / cancel
   ├─ /api/media/:id     authenticated media stream (signed links for providers)
   ├─ /api/director      LLM creative director (enhance, brief, storyboard, analyse)
   ├─ /api/voices        ElevenLabs voice list
   └─ run-job (background, 15 min) — synchronous providers (OpenAI images, ElevenLabs TTS)
           │
           ▼
   Provider adapters: runway · google-veo · openai-image · elevenlabs · higgsfield
```

Everything runs on Netlify, so the user's existing GitHub → Netlify workflow is the whole
deployment. No separate backend host is required.

## Why this shape

- **Long video jobs never block a request.** Runway, Veo and Higgsfield are asynchronous:
  `/api/generate` submits and returns a job in milliseconds; the browser polls `/api/jobs/:id`,
  which asks the provider for status at most once every few seconds.
- **Synchronous providers run in a background function.** OpenAI image generation can exceed a
  normal request; `/api/generate` records the job as `queued` and hands it to `run-job`
  (background, up to 15 min), which writes the result to Blobs.
- **Outputs are copied into our storage** when a job completes. Provider URLs expire
  (Higgsfield: ≥7 days; Veo files need the API key to download), so every output becomes a
  private blob served through `/api/media/:id` with an ownership check.
- **One capability catalogue** (`shared/catalog.ts`) is imported by both the UI and the
  functions. The UI only renders options a model supports; the server re-validates every
  request against the same catalogue and computes the cost estimate. Adding a model is one
  catalogue entry plus (if it is a new provider) one adapter.

## Provider adapter contract (`netlify/lib/providers/types.ts`)

```ts
interface ProviderAdapter {
  id: ProviderId
  isConfigured(): boolean
  submit(job: JobRecord, inputs: ResolvedInputs): Promise<SubmitResult> // async providers
  run?(job, inputs): Promise<Output[]>        // synchronous providers (background fn)
  poll?(job): Promise<PollResult>             // queued | processing | completed | failed
  cancel?(job): Promise<boolean>
}
```

Status vocabulary shown in the UI: `queued → processing → completed | failed | canceled`.
Progress percentages are shown **only** when a provider returns one (Runway `progress`);
otherwise the UI shows elapsed time and an honest "processing" state.

## Security

- Provider keys live only in Netlify environment variables (Functions scope). Nothing
  provider-related is in the client bundle.
- **Who can generate:** a signed-in Netlify Identity user whose role is in
  `GENERATION_ROLES` (default `admin,creator`). `OWNER_EMAIL` is given `admin` automatically at
  signup by the `identity` event function. Registration should be set to *Invite only* until
  billing exists — generation spends the owner's provider credit.
- When `CREDITS_ENABLED=true` (requires Netlify Database), any signed-in user with enough
  credits may generate; credits are reserved before submission and refunded on failure,
  idempotently keyed by job id.
- Uploads: images ≤ 4 MB (jpeg/png/webp), video ≤ 4 MB (mp4/webm/mov) in v1 because of the
  function payload limit; type sniffed from magic bytes, not trusted from the client.
- Media blobs are keyed `owner/<id>`; `/api/media/:id` checks ownership. Providers that must
  fetch a URL (Runway video-to-video) receive a short-lived HMAC-signed link
  (`MEDIA_SIGNING_SECRET`, 15 min).
- Function-level rate limit on `/api/generate` (per IP, 20/min) plus per-user concurrent job cap.
- Logs never include keys, signed URLs, or prompts.

## Data

**Blobs store `jobs`** — key `<ownerId>/<jobId>` → `JobRecord` JSON
(id, kind, modelId, provider, providerJobId, params, prompt, status, error, outputs[],
costEstimate {usd, credits}, createdAt, updatedAt, completedAt).

**Blobs store `media`** — key `<ownerId>/<assetId>` → bytes, metadata {contentType, kind,
source: upload|output, jobId, createdAt}.

**Database (optional; migration kept in `db/migrations` until credits are switched on, because
Netlify Database consumes Netlify credits)** — `credit_accounts`, `credit_ledger`
(unique `(job_id, reason)` for idempotency), `purchases` (billing boundary, unused until a
payment provider is connected).

## Product preservation (Ad Studio)

1. Upload product photo → `/api/director` (`analyse-product`) returns a structured
   description: shape, colours, materials, label text, distinctive details.
2. Brief: objective, audience, platform, offer, CTA → director writes 3 concepts and a
   creative brief per funnel stage (no invented reviews, discounts or claims).
3. Scene generation uses the product photo **as a reference input** (gpt-image-2 edits /
   Veo reference images) with the analysed details in the prompt.
4. **Deterministic layer:** the original product cut-out (user PNG) can be placed over the
   AI scene, and headline, price, CTA and logo are drawn by the canvas compositor — never by the
   image model — inside platform safe zones. Export is a PNG rendered client-side.
5. The user compares against the reference and regenerates only the scene, or only one shot.

## Billing boundary

No payment provider is connected. `/pricing` says payments aren't live. The `purchases` table
exists so a provider (Paystack is the natural fit for South Africa; Stripe elsewhere) can be
added without schema changes — see DEPLOYMENT.md §4. Nothing in the UI claims a subscription or
payment succeeded.
