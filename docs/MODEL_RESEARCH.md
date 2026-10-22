# Model research — Unsolvable.ai

Researched 22 October 2026 with Firecrawl against official provider documentation.
Every row is marked **Verified** (read on the official page that day), **Estimate**
(derived from verified numbers) or **Unknown**. No model has been benchmarked yet:
no provider credentials were available, so the benchmark in §5 is **blocked**, not passed.

## 1. Headline findings

1. **Runway's API is now a multi-model router.** One Runway key reaches Runway's own
   models *and* Veo 3.1, Kling 3.0/O3, Seedance 2/2.5, Wan 3, Hailuo 3, GPT Image 2,
   Gemini image models, ElevenLabs voices, Magnific upscaling and Aleph 2 video editing,
   all through the same task API (`POST /v1/<task>` → `GET /v1/tasks/{id}`).
   This is the single most valuable key for the platform. *(Verified — docs.dev.runwayml.com/api)*
2. **Google Veo 3.1 is still "preview"** (`veo-3.1-generate-preview`, `-fast-`, `-lite-`).
   Veo 3.0 is deprecated. Building on a preview model is acceptable for v1 but the
   router must be able to fall back to another video model. *(Verified — ai.google.dev/gemini-api/docs/veo)*
3. **Higgsfield itself sells an API** (`api.higgsfield.ai`, keys at open.higgsfield.ai)
   that serves Seedance, Kling, Wan, MiniMax and its own Genjutsu motion-transfer models.
   It is a legitimate third router option. *(Verified — open.higgsfield.ai/quick-start, docs.higgsfield.ai)*
4. **OpenAI image models:** `gpt-image-2` (sizes up to 3840 px, multi-reference edits,
   transparent backgrounds) plus newer `gpt-image-2.5-sunburst` / `-flare`.
   The Image API is synchronous and returns base64. *(Verified)*
5. **ElevenLabs:** `eleven_v4` is the new flagship expressive model (90+ languages);
   `eleven_v4_turbo` (~100 ms) for speed; `eleven_v3`, `eleven_multilingual_v2`,
   `eleven_flash_v2_5` remain. *(Verified — elevenlabs.io/docs/overview/models)*
6. **Talking-person video:** no single verified API gives *your chosen voice* + accurate
   lip sync in one call. Veo 3.1 generates native in-video dialogue (its own voice, lip-synced).
   Runway `act_two` transfers a recorded performance onto a character. A dedicated lip-sync
   provider is a Phase-2 item (see §6).

## 2. Comparison matrix

| Provider / model | Capabilities | Video controls | Quality | Cost (verified unless noted) | Access | Recommendation |
|---|---|---|---|---|---|---|
| **Runway `gen4.5`** | T2V, I2V | 2–10 s; 1280:720, 720:1280 (+4 more ratios for I2V); seed | 720p | 12 cr/s = **$0.12/s** | Runway dev key, $0.01/credit | Default cinematic model; strong prompt following, no native audio |
| **Runway `gen4_turbo`** | I2V | 2–10 s | 720p | 5 cr/s = **$0.05/s** | Runway key | Fast, cheap image-to-video drafts |
| **Runway `veo3.1` / `veo3.1_fast`** | T2V, I2V, native audio | 4/6/8 s | up to 1080p | 40 cr/s with audio ($0.40) / 15 cr/s fast ($0.15) | Runway key | Veo without a separate Google key |
| **Runway `seedance2`** | T2V, I2V, V2V | duration int | 480p–4K | 36 cr/s 720p ($0.36); 150 cr/s 4K | Runway key | Premium realism alternative |
| **Runway `kling3.0_pro`** | T2V, I2V | multi-shot (per Higgsfield) | up to 1080p (4K variant) | 12 cr/s silent / 17 cr/s audio | Runway key | Cheapest high-quality audio-capable option |
| **Runway `aleph2`** | **Video-to-video editing** (style, background, relight) | targetAspectRatio 16:9…21:9 | source res | 28 cr/s, 56 cr minimum | Runway key | Video edit workspace |
| **Runway `act_two`** | Character performance (drive a character with a recorded video) | ref video 3–30 s | 720p | 5 cr/s | Runway key | Spokesperson from a filmed performance |
| **Google `veo-3.1-generate-preview`** | T2V, I2V, ≤3 reference images, first+last frame, extension to 141 s, **native audio always on** | 4/6/8 s (8 s required for refs, 1080p, 4K); 16:9, 9:16 | 720p/1080p/4K | **$0.40/s** (720p/1080p), $0.60/s 4K | Gemini API key, paid tier; **Preview** | Hero shots, dialogue scenes, reference-locked product shots |
| **Google `veo-3.1-fast-generate-preview`** | as above | as above | as above | $0.10/s 720p, $0.12 1080p, $0.30 4K | Preview | Best price/quality for ads with sound |
| **Google `veo-3.1-lite-generate-preview`** | T2V, I2V, refs, first/last frame (no extension, no 4K) | 4/6/8 s | 720p/1080p | $0.05/s 720p, $0.08 1080p | Preview | Cheap drafts / storyboards |
| **Higgsfield API — Seedance 2.0** | T2V, I2V, refs, optional audio | ≤15 s | up to 4K | from $0.099/s (discounted; $0.141 list) | Higgsfield key | Alternative router; also gives Genjutsu motion transfer |
| **OpenAI `gpt-image-2`** | T2I, edits, multi-reference, transparent PNG/WebP | sizes 1024²…3840×2160, custom WxH ×16 | low/medium/high | ~$0.006–$0.211 per 1024² image by quality | OpenAI key | **Default image + product-photography model**; best text rendering |
| **Runway `gen4_image`** | T2I with reference images (tags) | 16 ratios | 720p/1080p | 5 cr (720p) / 8 cr (1080p) | Runway key | Character/product consistency via tagged references |
| **ElevenLabs `eleven_v4`** | Expressive TTS, 90+ languages, 10k chars | — | MP3/PCM | Plan-dependent (Estimate: Runway resells at 5 cr per 1k chars ≈ $0.05/1k) | ElevenLabs key | Default voiceover |
| **ElevenLabs `eleven_flash_v2_5`** | Low-latency TTS, 32 langs, 40k chars | — | — | Plan-dependent | ElevenLabs key | Long scripts, previews |
| **Gemini `gemini-2.5-flash-lite`** | Text + vision LLM | — | — | $0.10 / 1M input tokens | Gemini key | Creative director: prompt enhancement, briefs, product analysis |

Realism, instruction-following and failure rate are **Unknown until benchmarked**. Speed: one
public report measured a Veo 3.1 Lite clip at ~41 s (Estimate, third-party GitHub issue);
Vertex docs give 30 s–3 min for Veo.

## 3. Recommended stack (v1)

| Role | Primary | Fallback |
|---|---|---|
| Cinematic text→video | Runway `gen4.5` | Veo 3.1 Fast (Google) |
| Video with native sound / dialogue | Veo 3.1 Fast (Google) | Runway `veo3.1_fast` |
| Image→video (product, portrait) | Runway `gen4.5` | Runway `gen4_turbo` (draft) / Veo 3.1 |
| Reference-locked product video | Veo 3.1 with ≤3 reference images | Runway Seedance 2 |
| Video editing (v2v) | Runway `aleph2` | — |
| Images, product photography, ad backgrounds | OpenAI `gpt-image-2` | Runway `gen4_image` |
| Voiceover | ElevenLabs `eleven_v4` | ElevenLabs `eleven_multilingual_v2` |
| Creative director / product analysis | Gemini 2.5 Flash-Lite | OpenAI (configurable) |
| Text, prices, logos on ads | **Deterministic canvas layers** — never the image model | — |

Minimum useful set of keys: **Runway + OpenAI + ElevenLabs + Gemini**. With only a Runway key
the platform can still do video, images and voice (through Runway's router) — that adapter
path is listed as a v1.1 item because the Runway TTS request schema was not verifiable.

## 4. Cost estimates per output (provider cost, before markup)

| Output | Model | Estimate |
|---|---|---|
| 5 s cinematic clip | Runway gen4.5 | $0.60 |
| 8 s ad shot with sound, 1080p | Veo 3.1 Fast | $0.96 |
| 8 s hero shot with dialogue | Veo 3.1 | $3.20 |
| 30 s ad (6 × 5 s shots, gen4.5) + 70-word VO | mixed | ≈ $3.60 + VO |
| Product image, 1024², high | gpt-image-2 | ≈ $0.21 |
| 4 ad variations, medium | gpt-image-2 | ≈ $0.20–0.30 |

The app shows these estimates before every generation and labels them as estimates.

## 5. Benchmark — BLOCKED

Planned prompts (same assets across Runway gen4.5, Veo 3.1 Fast, Seedance 2, gpt-image-2):
1. Cinematic human scene · 2. Product ad from uploaded image · 3. Product moving through an
environment · 4. Talking person, short script · 5. Vertical social ad · 6. Product-preserving
image edit · 7. Prompt with 6 simultaneous instructions.
Score: realism, adherence, consistency, motion, text/logo accuracy, audio, time, cost, failure rate.

**Status:** not run — no API keys. To run: add keys (see `DEPLOYMENT.md`), sign in as admin,
use Studio → each tool with the prompts in `docs/benchmark-prompts.md`, and record results in
Library (every job stores model, duration, cost estimate and status).

## 6. Not yet covered (Phase 2)

- Lip-sync with a *chosen* ElevenLabs voice (candidates: Higgsfield lipsync/Kling Avatars, Runway
  `act_two` + recorded performance). Needs a verified API contract before building.
- Background removal (Runway/Bria `bria_fibo_edit_1_5` is listed in Runway's text_to_image enum — verify).
- Upscaling: Runway `magnific_precision_upscaler_v2` (image), `magnific_video_upscaler_creative` (video).
- Full MP4 assembly of multi-shot ads (ffmpeg.wasm or a Remotion render worker).

## Sources

- Runway API reference & pricing: https://docs.dev.runwayml.com/api/ , https://docs.dev.runwayml.com/guides/pricing/ , versioning `2024-11-06`
- Veo: https://ai.google.dev/gemini-api/docs/veo , pricing https://ai.google.dev/gemini-api/docs/pricing
- OpenAI images: https://developers.openai.com/api/docs/guides/image-generation
- ElevenLabs models: https://elevenlabs.io/docs/overview/models
- Higgsfield API: https://open.higgsfield.ai/quick-start , https://docs.higgsfield.ai/docs/llms.txt
