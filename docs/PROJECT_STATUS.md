# Project status — 22 October 2026

## Stage summary

| Stage | State |
|---|---|
| 1 Research (reference + models) | **Done** — `REFERENCE_BLUEPRINT.md`, `MODEL_RESEARCH.md` |
| 2 Architecture | **Done** — `ARCHITECTURE.md` |
| 3 Design system + app shell | **Done** |
| 4 Core generation (image, video, voice) | **Built and unit-tested with mocked providers. Not yet run against a live API** (no keys) |
| 5 Advanced tools (references, product preservation, Ad Studio, director) | **Built**; same caveat |
| 6 Projects and accounts | **Built** — Identity auth, private storage, library, roles; credits optional |
| 7 Quality | 45 automated tests pass; typecheck and production build pass. **Visual QA not done** (no browser available in the build sandbox) |
| 8 Deployment | Netlify project `unsolvable-ai` created with env vars; **not yet deployed** — the sandbox can't reach Netlify. See "Next steps" |

## What works (verified by tests)

- Shared model catalogue: validation for every model/mode, Veo's 8-second rule, reference limits,
  clip-length limits, voice settings; cost estimates match published rates (Runway, Veo).
- Provider request mapping for Runway (t2v, i2v, v2v, t2i with tagged refs), Veo (start frame,
  reference images, parameters), OpenAI images, Higgsfield; status mapping for each.
- Job lifecycle: submit → poll → copy output to private storage; provider rejections become
  failed jobs with the provider's reason; transient poll errors keep the job alive; 4-job cap;
  another user's uploads can't be used; invalid requests never reach a provider.
- Background worker for synchronous providers, protected by an HMAC token.
- Upload type detection from file bytes; signed media links (tamper and expiry checks).
- Auth headers are never forwarded on a cross-origin redirect when downloading outputs.
- UI: hero prompt, sign-in gating, cost on the Generate button, prompt prefill.

## Not verified yet (needs keys + a deploy)

- Any live generation. Field shapes taken from docs but never exercised:
  Veo `image.bytesBase64Encoded` / `referenceImages[].referenceType`, Runway
  `video_to_video.targetAspectRatio`, Higgsfield Seedance body fields, Gemini/OpenAI director JSON.
- Netlify Identity flows (signup, invite, confirmation) — Identity doesn't run locally.
- Real rendering on phone/tablet/desktop.
- `DIRECTOR_OPENAI_MODEL` default (`gpt-5-mini`) — model name not verified; Gemini path is the default.

## Not built (Phase 2)

- Lip-sync with a chosen ElevenLabs voice (needs a verified lip-sync API).
- One-click MP4 export of a multi-shot ad (shots + voiceover + captions are downloadable separately;
  preview plays them together).
- Background removal, upscaling (Runway Magnific), community gallery, payments.

## Credentials and actions needed from the owner

1. Create an empty private GitHub repo `unsolvable-ai` (no README) so the code can be pushed, then
   link it in Netlify → Build & deploy. *Or* deploy from your computer: `npx netlify deploy --build --prod`
   in the project folder.
2. Netlify → Identity → Enable; set registration to Invite only; invite yourself.
3. Add provider keys (at least `GEMINI_API_KEY` or `RUNWAY_API_KEY`), redeploy.
4. Check Netlify → Project → Access control: new projects on this team were created with
   "require Netlify team login" — turn it off when you want the public to see the site.

Already set on Netlify: `MEDIA_SIGNING_SECRET` (secret), `OWNER_EMAIL`, `GENERATION_ROLES`.

## Next concrete step

Deploy, sign in, add one key, then run the seven prompts in `benchmark-prompts.md` and record
results — that turns every "not verified" line above into a verified one or a bug to fix.
