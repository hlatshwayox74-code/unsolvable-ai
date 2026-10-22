# Deployment and setup

Everything runs on Netlify: the site, the API (Netlify Functions), private file storage
(Netlify Blobs) and sign-in (Netlify Identity). There is no second server to host.

## 1. First-time setup (about 10 minutes)

1. **Environment variables** — Netlify → *Project configuration → Environment variables*.
   Scope every variable to **Functions**. Copy names from `.env.example`.
   - `MEDIA_SIGNING_SECRET` — required. 32+ random characters:
     `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`
   - `OWNER_EMAIL` — your email; that account gets the `admin` role at signup.
   - At least one provider key (see below).
2. **Identity** — Netlify → *Project → Identity → Enable Identity*. Then:
   - *Registration preferences* → **Invite only** (recommended until billing exists — every
     generation spends your provider credit).
   - Invite yourself (*Identity → Invite users*), open the email, choose a password.
   - Already signed up before setting `OWNER_EMAIL`? Add the `admin` role to yourself in
     *Identity → your user → Edit settings → Roles*. Roles apply after you sign out and in again.
3. **Redeploy** after any environment change (*Deploys → Trigger deploy*). Values are frozen per deploy.
4. Open `/studio/settings` on the live site — every provider you added should say **Connected**.

## 2. Provider keys

| Variable | Where to get it | Unlocks |
|---|---|---|
| `RUNWAY_API_KEY` | https://dev.runwayml.com → API keys (prepaid credits, $0.01 each) | Gen-4.5, Gen-4 Turbo, Aleph 2 video editing, Gen-4 Image |
| `GEMINI_API_KEY` | https://aistudio.google.com/apikey — **enable billing**; Veo isn't on the free tier | Veo 3.1 / Fast / Lite, creative director |
| `OPENAI_API_KEY` | https://platform.openai.com/api-keys — organisation verification may be required for image models | GPT Image 2, creative-director fallback |
| `ELEVENLABS_API_KEY` | https://elevenlabs.io/app/settings/api-keys | Voiceovers |
| `HIGGSFIELD_API_KEY` | https://open.higgsfield.ai/api-keys — paste the whole key | Seedance 2.0 |

The cheapest useful start is **Gemini + ElevenLabs** (Veo 3.1 Lite drafts at $0.05/s, director,
voice). Add **Runway** for the strongest cinematic and image-to-video results, and **OpenAI** for
product photography.

## 3. Giving other people access

Credits off (default): invite them in Identity and add the role `creator`. They spend your
provider credit, so only invite people you trust.

Credits on (optional): every user needs a credit balance.
1. `npm i @netlify/database`
2. `mkdir -p netlify/database/migrations && cp db/migrations/*.sql netlify/database/migrations/`
3. Set `CREDITS_ENABLED=true`, commit, deploy. Netlify provisions Postgres and applies the migration.
   (Netlify Database uses your Netlify credits; check your plan.)
4. Grant credits with a migration, e.g.
   `INSERT INTO credit_accounts (user_id, balance) VALUES ('<identity-user-id>', 1000) ON CONFLICT (user_id) DO UPDATE SET balance = credit_accounts.balance + 1000;`

## 4. Taking payments (not built)

The `purchases` table is the boundary. To sell credits, add a payment provider
(**Paystack** suits South Africa — ZAR, cards, EFT; **Stripe** elsewhere), create a function that
verifies the provider's webhook signature, and in one transaction insert a `purchases` row and a
`credit_ledger` `purchase` row and add to `credit_accounts.balance`. Test in sandbox mode first.
Until then the site says plainly that payments aren't live.

## 5. Continuous deployment from GitHub

The repository is `github.com/hlatshwayox74-code/unsolvable-ai`. To deploy on every push:
Netlify → *Project configuration → Build & deploy → Link repository* → GitHub → `unsolvable-ai`.
Build command `npm run build`, publish directory `dist` (already in `netlify.toml`).

## 6. Local development

```bash
npm install
npm test              # 45 unit tests, no keys needed
npm run build
npx netlify dev       # site + functions on http://localhost:8888 (uses .env)
```
Sign-in (Identity) does not work under `netlify dev`; test auth on a Deploy Preview.

## 7. Limits to know

- Uploads ≤ 4 MB (Netlify's request limit). Large photos are resized in the browser automatically.
  Video-to-video therefore takes short or compressed clips.
- Synchronous functions stop after 60 s; that's why OpenAI images and voiceovers run in the
  `run-job` background function (15 min).
- Up to 4 running generations per user.

## Troubleshooting

| Symptom | Fix |
|---|---|
| "Sign-in isn't switched on" | Enable Identity (step 2) |
| "Storage isn't set up" | Add `MEDIA_SIGNING_SECRET` (32+ chars) and redeploy |
| "Your account can't run generations yet" | Give the user `admin` or `creator`; they must sign out and in |
| "<Provider> rejected the API key" | Key wrong or revoked; replace it and redeploy |
| "out of credit" / 402 from a provider | Top up with that provider |
| Veo: "safety filter removed the video" | Google filtered the output; change people/brands in the prompt |
| Image jobs stay "Queued" | The background worker didn't start — check *Logs → Functions → run-job*; usually a missing `MEDIA_SIGNING_SECRET` |
