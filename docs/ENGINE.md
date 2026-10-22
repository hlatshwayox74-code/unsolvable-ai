# The Unsolvable engine — our own image, video and voice generation

The engine is a small Python server (`engine/`) that runs open-weight models on a GPU you control.
The website sends it jobs; it renders them and the website copies the results into your private
storage. **No third-party AI API is called and there is no per-generation fee** — you pay only for
the GPU machine while it's switched on.

| Job | Model | Licence | Needs |
|---|---|---|---|
| Images (text → image, edit with up to 4 product photos) | FLUX.2 [klein] 4B | Apache 2.0 | ~13 GB GPU memory |
| Video (text → video, photo → video), 720p 24 fps, 5 s | Wan 2.2 TI2V-5B | Apache 2.0 | 24 GB GPU (RTX 4090 / L4 / L40S) |
| Voiceover, 12 preset voices | Kokoro-82M | Apache 2.0 | CPU is fine |
| Finished ad: shots + voiceover + burned-in captions → one MP4 | FFmpeg (not AI) | LGPL/GPL tool | CPU |

Wan makes silent clips. The ad with sound comes from the assembler: Ad Studio → Create → make the
shots and the voiceover → **Export MP4 with sound**.

## What you need

- A machine with an NVIDIA GPU with **24 GB** of memory for video (16 GB is enough for images and
  voice only). Your own PC with an RTX 3090/4090 works, or rent one.
- Renting (prices checked October 2026, see INDEPENDENT_AI_STACK.md): RunPod RTX 4090 about
  $0.34–0.69/hour on demand. **Stop the pod when you're not using it** — a GPU left on 24/7 costs
  roughly $250–500 a month.
- About 60 GB of disk for the model weights (downloaded once on first use).

## Option A — rent a GPU on RunPod (easiest)

1. Create a RunPod account and add credit (you do this; I can't create accounts or pay for you).
2. Pods → Deploy → pick an **RTX 4090** (or L40S). Template: **RunPod PyTorch 2.x**.
   Container disk 30 GB, volume 80 GB mounted at `/workspace`. Expose **HTTP port 8000**.
3. Open the pod's web terminal and run:

   ```bash
   cd /workspace
   git clone https://github.com/hlatshwayox74-code/unsolvable-ai.git
   cd unsolvable-ai
   apt-get update && apt-get install -y espeak-ng fonts-dejavu-core
   pip install -r engine/requirements.txt
   export HF_HOME=/workspace/hf ENGINE_DATA_DIR=/workspace/engine-data
   export ENGINE_TOKEN=$(python -c "import secrets;print(secrets.token_urlsafe(32))")
   echo "Save this token: $ENGINE_TOKEN"
   nohup uvicorn engine.app:app --host 0.0.0.0 --port 8000 > /workspace/engine.log 2>&1 &
   ```

4. Your engine address is `https://<pod-id>-8000.proxy.runpod.net`. Check it:
   `https://<pod-id>-8000.proxy.runpod.net/v1/health` should show `"ok": true` and your GPU.
5. In Netlify → Project configuration → Environment variables add
   `ENGINE_URL` = that address, `ENGINE_TOKEN` = the token, then **Deploys → Trigger deploy**.
6. Studio → Settings should now say **Self-hosted engine: Online on NVIDIA GeForce RTX 4090**.

The first image downloads FLUX.2 klein (~8 GB) and the first video downloads Wan 2.2 (~30 GB), so
the first job of each kind takes several extra minutes. Later jobs start immediately.

## Option B — Docker on your own GPU machine

```bash
docker build -f engine/Dockerfile -t unsolvable-engine .
docker run --gpus all -p 8000:8000 -v unsolvable-data:/data \
  -e ENGINE_TOKEN=<32+ random characters> unsolvable-engine
```

The website must reach it over **https**. Put it behind Cloudflare Tunnel
(`cloudflared tunnel --url http://localhost:8000`) and use the https address it prints as `ENGINE_URL`.

## Settings

| Variable | Default | What it does |
|---|---|---|
| `ENGINE_TOKEN` | — (required) | Shared secret; the website sends it as `Authorization: Bearer …` |
| `ENGINE_DATA_DIR` | `./engine-data` | Outputs and `usage.jsonl` |
| `GPU_HOURLY_USD` | `0.69` | What your GPU costs per hour; used for each job's cost estimate |
| `OUTPUT_TTL_HOURS` | `48` | Finished outputs are deleted from the engine after this (the website keeps its own copy) |
| `ENGINE_MAX_QUEUE` | `20` | Jobs allowed to wait |
| `ENGINE_ENABLED_MODELS` | all permitted | Comma list to restrict which models load |
| `ENGINE_LICENSED_MODELS` | empty | Non-commercial models (e.g. `flux2-klein-9b`) load **only** if listed here — list one only once the business holds a written commercial licence for it |
| `ENGINE_TEST_MODE` | off | Test-pattern backend for CI. Never in production; Settings shows a red warning if on |

## How it works

- One GPU worker runs jobs in order. Before loading a big model it unloads the previous one, so a
  24 GB card can serve images, video and voice in turn. Out-of-memory errors free everything and
  retry once, then fail with a plain message.
- Progress is real: it comes from the model's denoising steps. Cancel stops at the next step.
- Every job records model, version, licence, seconds, GPU, peak GPU memory and estimated GPU cost.
  The Library shows this under each result, and `engine-data/usage.jsonl` keeps a log.
- Automatic checks after each job: file readable, right size and length, not a blank frame, not
  silent audio. They don't judge taste or product accuracy — look at the result.

## API

All routes except `/v1/health` need `Authorization: Bearer $ENGINE_TOKEN`.

| Method | Path | |
|---|---|---|
| GET | `/v1/health` | Version, GPU, queue length, loaded models |
| GET | `/v1/models` | Registry with licence, permitted/available and the reason if not |
| POST | `/v1/jobs` | `{model, mode, prompt, params, imageUrls?, videoUrls?, audioUrl?}` (or base64 `images`/`videos`/`audio`) → 202 |
| GET | `/v1/jobs/{id}` | Status, progress, metrics, quality, provenance |
| GET | `/v1/jobs/{id}/outputs/{n}` | The file |
| DELETE | `/v1/jobs/{id}` | Cancel |
| POST | `/v1/plan` | Rules-based ad plan (shots, script, captions) from a short brief |

## Benchmarks

On the GPU machine: `python -m engine.bench` prints rows for `docs/MODEL_BENCHMARKS.md` and saves
outputs to `bench-out/` for scoring by eye.

## Tests (no GPU needed)

```bash
pip install fastapi httpx pillow imageio-ffmpeg pytest
python -m pytest engine/tests -q
```

They cover the API, auth, licence gating, queue, cancel, metrics and logging (with a labelled test
pattern), and run the real FFmpeg assembler on synthetic clips with a voiceover track.

## Not yet verified

The FLUX.2 klein, Wan 2.2 and Kokoro backends follow the diffusers 0.41 / kokoro 0.9 interfaces but
have **not yet run on a GPU** — the build sandbox has none. The first run on the GPU machine is the
real test; `python -m engine.bench` exercises all three. Exact Wan image-to-video call details are
the most likely to need a small fix.
