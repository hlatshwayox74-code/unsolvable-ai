# Unsolvable.ai

An AI creative studio by UNSOLVABLE: images, video with sound, voiceovers and complete ad
campaigns from a prompt or a product photo. It routes each job to the best official API —
Runway, Google Veo, OpenAI GPT Image, ElevenLabs and the Higgsfield API — shows the cost before
anything is generated, and keeps every result in a private library.

**Stack:** React 19 + TypeScript + Vite + Tailwind 4 · Netlify Functions, Blobs and Identity ·
Anime.js for the one hero animation.

## What's here

| Area | Path |
|---|---|
| Marketing site (home, models, pricing, sign-in) | `src/pages/` |
| Studio (image, video, voice, Ad Studio, library, settings, help) | `src/pages/studio/` |
| Model catalogue — capabilities, validation, pricing (shared by UI and API) | `shared/catalog.ts` |
| API endpoints | `netlify/functions/` |
| Provider adapters | `netlify/lib/providers/` |
| Job orchestration, storage, auth, credits, creative director | `netlify/lib/` |
| Optional credit ledger migration | `db/migrations/` |
| Tests | `tests/` |

## Docs

- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — setup, keys, access, payments, troubleshooting
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — how it fits together, security, product preservation
- [`docs/MODEL_RESEARCH.md`](docs/MODEL_RESEARCH.md) — model comparison, costs, recommended stack
- [`docs/REFERENCE_BLUEPRINT.md`](docs/REFERENCE_BLUEPRINT.md) — what was learned from Higgsfield
- [`docs/PROJECT_STATUS.md`](docs/PROJECT_STATUS.md) — what works, what's verified, what's next

## Commands

```bash
npm install
npm test          # unit + integration tests (mocked providers, no keys needed)
npm run build     # typecheck + production build
npx netlify dev   # local site + functions
```
