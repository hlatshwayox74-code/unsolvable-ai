# Reference blueprint — what we learned from Higgsfield

Unsolvable.ai is an **original** product. Higgsfield (higgsfield.ai) was studied for
information architecture, workflows and quality bar only. No Higgsfield logos, names,
copy, media, community content or account flows are reused, and the visual identity is
built from the UNSOLVABLE brand (black, signature yellow, white, charcoal — "BEYOND LIMITS.").

Researched 22 Oct 2026 with Firecrawl (homepage, /pricing, /ai/video, /marketing-studio,
open.higgsfield.ai/quick-start, docs.higgsfield.ai).

## Observed (from public pages)

**Navigation (top bar, dense):** Explore · Image · Video · Audio · MCP · API · featured
model links tagged "New" · Content factory · AI Influencer · Academy · Ads Studio · Effects ·
Cinema Studio · Marketing Studio · Edit · Community · Canvas · Pricing (with discount badge) ·
Enterprise · Login / Sign up. The nav is a feature catalogue rather than a hierarchy.

**Homepage order:** model/campaign carousel cards (video poster + title + one-line pitch) →
sign-up discount promo → row of quick tool tiles → full-bleed campaign hero for the newest
model → community preset grid ("Recreate" + count) → "Explore the inside of every project"
(project cards with creator) → per-model community galleries (video thumbnails with the full
prompt visible) → feature banners (agent, canvas) → long SEO link cloud → mega footer
(Create, Video Models, Image Models, Studios, Platform, Resources, Company, Community).

**Design tokens (Firecrawl branding extraction):** dark scheme, background `#0F1113`,
text `#F7F7F8`, accent lime `#D1FE17`, Inter body + Space Grotesk display, compact controls,
rounded cards, media-first.

**Generation workspace (/ai/video):** one prompt box with `@` mentions for references;
"Add references — image, video or audio"; model picker; chips for duration (5s), ratio
(16:9), resolution (1080p), quality; **credit cost shown on the Generate button (80)**.

**Marketing Studio:** two inputs — *Avatar* and *Product*; output presets UGC, Product shot,
Motion, Ads, Posters, Marketplace, TikTok; image/video toggle; framing (Closeup), ratio (3:4).

**Pricing:** credit-based. Free (0 credits), Starter $19, Plus $59 ($47 annual, 1,200 cr),
Ultra $129 ($99 annual, 3,000 cr), Team from $65/seat. Credits are consumed per model,
resolution and duration (e.g. ~7 credits per 5 s at 720p for one video model, up to ~110 for 4K
on another).

**Platform/API:** Higgsfield exposes its models over a REST API with submit → poll → cancel,
signed reference uploads, and terminal states completed/failed/nsfw/canceled.

## Inferred (not verified)

- Generation runs as async jobs with polling (consistent with their public API).
- Community galleries are curated from user generations with opt-in visibility.
- Login uses a hosted auth provider (a `hf-clerk-mode` meta tag is present).

## What we reproduce, improve, or do independently

| Idea | Decision |
|---|---|
| Cost on the Generate button | **Reproduce** — and show the dollar estimate + "estimate" label |
| One prompt box with references | **Reproduce** — drag-drop references, chips for settings |
| Model picker with per-model controls | **Reproduce** — controls come from a shared capability catalogue, so unsupported options never appear |
| Product + avatar ad studio | **Improve** — add product analysis, a creative brief, funnel stages, and a deterministic text/logo layer so prices and logos are never AI-hallucinated |
| Community gallery with prompts | **Defer** — no real community exists yet; we will not show invented creators or counts. Library shows the user's own work |
| Dense feature-catalogue nav | **Do differently** — five clear destinations (Image, Video, Voice, Ad Studio, Library) |
| Discount banners / scarcity | **Do not copy** — no fake urgency |
| Pricing tiers | **Do independently** — pass-through credit pricing, clearly labelled "proposed" until billing is connected |

## Unsolvable.ai sitemap (v1)

```
/                 Marketing home
/models           Model catalogue (from the shared capability catalogue)
/pricing          Credit pricing (proposed) + per-model cost table
/login /signup    Netlify Identity
/studio           Dashboard (recent jobs, provider status, quick start)
/studio/image     Image generator + editor (refs, variations)
/studio/video     Text→video, image→video, video edit (v2v)
/studio/voice     Voiceover (ElevenLabs)
/studio/ads       Ad Studio: product → analysis → brief → creatives → layout → export
/studio/library   History, downloads, retry
/studio/settings  Provider status, account, credits
/studio/help      Docs, onboarding, limits
```
