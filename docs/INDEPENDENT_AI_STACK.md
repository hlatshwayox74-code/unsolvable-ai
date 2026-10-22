# Independent AI stack — research and recommendation

Researched 22 October 2026 (Firecrawl + web search, official repositories and licence files where
available). Each fact is marked **V** (verified from the licence file, official model card or
vendor page that day) or **E** (estimate / third-party report). Nothing below has been run on a GPU
yet; real numbers go in `MODEL_BENCHMARKS.md` after the first deployment.

**Goal:** generate images, video and voice with models we run ourselves, so no paid AI API is called
per generation. We still pay for compute (GPU hours, electricity, storage, bandwidth).

---

## 1. Recommended first version (the "Independent Creative Engine" v1)

| Capability | Model | Licence | GPU memory | Why |
|---|---|---|---|---|
| **Images** (text→image and editing with reference images) | **FLUX.2 [klein] 4B** | Apache 2.0 (V) | 8.4 GB per BFL; ~13 GB per model card (V) | Commercially free, ~1.2 s per 1024² image on an A100 at 4 steps (V, third-party measurement), editing built into the same pipeline (V — `Flux2KleinPipeline(image=…)` in diffusers 0.41) |
| **Video** (text→video and image→video, 720p, 24 fps) | **Wan 2.2 TI2V-5B** | Apache 2.0 (V) | 24 GB (V) | One model does both modes; ~9 minutes per 5 s 720p clip on an RTX 4090 (V, Wan team) |
| **Voice** (narration) | **Kokoro-82M** | Apache 2.0 (V) | none needed — faster than real time on CPU (E) | Tiny, 54 voices / 8 languages (V); cannot clone voices |
| **Background removal** (product cut-outs) | **BiRefNet** | MIT, code and weights (V) | small; ~15 s per image on CPU (E) | Real alpha channel; commercial use allowed |
| **Prompt planning** | Rules-based planner now; **Qwen3** (Apache 2.0) via a local server later | Apache 2.0 (E — check the exact model size's card) | 8–24 GB depending on size | The planner never renders images; it turns a request into a structured plan |

**Hardware for v1:** one rented 24 GB GPU (RTX 4090) runs images and video; Kokoro runs on the same
box's CPU. 48 GB (L40S / A6000) is the comfortable step up when we add Qwen-Image-Edit or bigger video.

---

## 2. Candidate comparison

### Images

| Model | Repo / docs | Capabilities | Hardware | Speed | Licence & commercial use | Self-host | Fine-tune | Role |
|---|---|---|---|---|---|---|---|---|
| **FLUX.2 [klein] 4B** | huggingface.co/black-forest-labs/FLUX.2-klein-4B, bfl.ai/models/flux-2-klein | T2I, image editing, distilled 4-step | 8.4 GB (BFL) – 13 GB (card) (V) | ~1.2 s RTX 5090 (BFL, V); 1.22 s A100 bf16, 0.90 s optimised (V, JarvisLabs) | **Apache 2.0 — free commercial** (V) | Yes | Yes (a "base" non-distilled 4B exists for LoRA training) (V) | **Primary image model** |
| FLUX.2 [klein] 9B | same family | Higher quality | 19.6 GB (V) | ~2 s RTX 5090 (V) | **FLUX Non-Commercial** — paid licence needed (V) | Yes | Yes | Only with a written BFL licence |
| FLUX.1 [schnell] | github.com/black-forest-labs/flux | T2I, 4 steps | ~24 GB bf16 (E) | seconds on 24 GB (E) | **Apache 2.0** (V, licence file) | Yes | Limited (distilled) | Fallback image model |
| FLUX.1 [dev] / Kontext [dev] | bfl.ai | T2I / editing | 24 GB+ (E) | — | **Non-commercial** (V) | — | — | Not usable without a paid licence |
| Qwen-Image / Qwen-Image-Edit (first release) | github.com/QwenLM/Qwen-Image | Best open text rendering; strong editing | Edit: ~40 GB bf16, 16 GB FP8, ~17–23 GB 4-bit; 36 s on a 3090 with an 8-step LoRA (V/E) | slower | **Apache 2.0** (V, repo) | Yes | Yes (LoRA) | Phase 2 editor on a 48 GB GPU |
| Qwen-Image-2.1 | — | Newer | — | — | **Qwen Research Licence — non-commercial** (V, press report) | — | — | Not usable commercially |
| SDXL | stability.ai | T2I, huge LoRA ecosystem | 8–12 GB (E) | fast | CreativeML OpenRAIL++-M — commercial with use restrictions (E, check card) | Yes | Yes | Low-VRAM fallback |

### Video

| Model | Capabilities | Hardware | Speed | Licence | Role |
|---|---|---|---|---|---|
| **Wan 2.2 TI2V-5B** | T2V + I2V in one model, 1280×704, 24 fps | 24 GB (V) | ~9 min / 5 s 720p on RTX 4090 (V) | **Apache 2.0** (V) | **Primary video model** |
| Wan 2.2 A14B (T2V / I2V) | Higher quality MoE | FP8/GGUF + offload on 24 GB; comfortable on 80 GB (E) | 2–3 min on 8 GPUs (E) | Apache 2.0 (E) | Quality tier later |
| Wan 2.2 S2V / Animate | Speech-to-video, character animation | 24–80 GB (E) | — | Apache 2.0 (E) | Talking-person candidate |
| LTX-2.x | Fast T2V/I2V, audio | heavy (E) | very fast on high-end (E) | **LTX Community Licence — free under $10M annual revenue, paid above** (V) | Usable now; re-check if revenue grows |
| HunyuanVideo 1.5 | Strong realism, 8.3B | 24 GB with quantisation (E) | 12–20 min (E, older 13B) | **Tencent licence — not valid in EU, UK, South Korea** (V) | Usable in South Africa, but blocks EU/UK customers — avoid as default |
| Mochi 1 | T2V | 16 GB+ (E) | 5–8 min (E) | Apache 2.0 (E) | Backup |

### Voice and audio

| Model | Capabilities | Hardware | Licence | Role |
|---|---|---|---|---|
| **Kokoro-82M** | TTS, 54 voices, 8 languages, no cloning | CPU OK (E) | **Apache 2.0** (V) | **Primary narration** |
| Chatterbox (+ Turbo, Multilingual) | Expressive TTS, emotion control, cloning from ~5 s | GPU recommended (~1 GB weights) (E) | **MIT** (V, Resemble) | Expressive / consented cloning, phase 2 |
| Coqui XTTS v2 | Cloning | GPU | **CPML — non-commercial** (V) | Not usable |
| F5-TTS | Cloning | GPU | CC-BY-NC weights (E) | Not usable |
| Whisper / faster-whisper | Transcription → captions | CPU/GPU | MIT (E) | Captions in phase 2 |

### Talking person / lip sync

| Model | Licence | Notes | Role |
|---|---|---|---|
| **LatentSync 1.6** (ByteDance) | Apache 2.0 (V, per guide citing repo) | Diffusion lip-sync, 512 px, best close-up quality | Phase 3 primary |
| **MuseTalk 1.5** | Code MIT; model stated usable commercially (E) | Real-time 30 fps+ on V100 (E), 256 px | Fast drafts |
| InfiniteTalk | Check repo before use (E) | Head + body motion, heavier | Watch |
| Wav2Lip | **Non-commercial** (V, guide) | — | Not usable |

### Segmentation, upscaling, interpolation

| Tool | Licence | Role |
|---|---|---|
| **BiRefNet** | MIT code + weights (V) | Product cut-outs |
| SAM 2 | Apache 2.0 (V, withoutbg listing for SAM) | Click-to-select masks |
| RMBG-2.0 | **Non-commercial** (V) | Not usable |
| Real-ESRGAN | BSD-3 (E) | Image/video upscaling |
| RIFE | MIT (E) | Frame interpolation (smoother video) |

### Serving software

| Tool | Licence | Use |
|---|---|---|
| **diffusers + PyTorch** | Apache 2.0 / BSD | Model pipelines — used by our engine |
| FastAPI + Uvicorn | MIT / BSD | Engine HTTP API |
| ComfyUI | GPL-3.0 | Good for experiments; GPL obligations if we ever distribute it, so not in the core engine |
| Ollama / vLLM | MIT / Apache 2.0 | Local LLM for prompt planning (phase 2) |

---

## 3. Infrastructure and running costs

GPU prices seen on 9–21 October 2026 (V unless noted):

| Option | Price | Notes |
|---|---|---|
| RunPod RTX 4090 (24 GB) | $0.34/hr community – $0.89/hr on-demand; serverless flex $1.10/hr active | Cheapest way to run v1 |
| RunPod L40S (48 GB) | $0.79–1.09/hr | Fits Qwen-Image-Edit, bigger video |
| RunPod A100 80 GB | $1.19–1.79/hr | Wan A14B, training LoRAs |
| RunPod H100 | $1.99–3.99/hr; serverless ≈ $4.55/hr active | Only for heavy video |
| Modal L4 / L40S / H100 | ≈ $0.80 / $1.95 / $3.95 per hour, billed per second, scales to zero | Pay only while generating; cold starts |
| Own workstation, RTX 4090 | One-off hardware + electricity | Cheapest at high volume; you maintain it |

### Cost per output (estimates, E)

| Output | Time on RTX 4090 | Cost at $0.34–0.89/hr | Compare: paid API |
|---|---|---|---|
| 1024² image, FLUX.2 klein 4B | ~1.5–3 s incl. overhead | **$0.0002–0.0007** | $0.01–0.21 (GPT Image) |
| 5 s 720p clip, Wan 2.2 5B | ~9 min | **$0.05–0.13** | $0.25–2.00 (Veo / Runway) |
| 30 s voiceover, Kokoro | seconds on CPU | **≈ $0** | ≈ $0.05 (ElevenLabs) |

**The catch is idle time.** A pod costs money every hour it's switched on, whether anyone generates or
not: a 4090 left on 24/7 is roughly $245–640 per month. Three ways to handle it:

1. **Start/stop on demand (recommended for now):** switch the pod on when you're working, off when not.
2. **Serverless (RunPod Serverless or Modal):** pay only while a job runs, but each cold start
   (loading ~13 GB of weights) adds 20–60 s billed time (E).
3. **Own GPU:** no hourly bill; best once usage is steady.

Model downloads: FLUX.2 klein 4B ≈ 8–16 GB, Wan 2.2 TI2V-5B ≈ 34 GB (V), Kokoro < 1 GB. Keep them on a
persistent volume (~$0.07/GB/month on RunPod, V) so restarts don't re-download.

---

## 4. Fine-tuning and training plan (later, only where it pays off)

| Target | Method | Data | Compute (E) | Measure |
|---|---|---|---|---|
| Brand look (e.g. UNSOLVABLE style) | LoRA on **FLUX.2 klein base 4B** | 20–50 of the brand's own photos | 1–2 h on one A100 (~$2–4) | Side-by-side preference vs no LoRA |
| Product accuracy for one product | LoRA per product | 10–30 photos of that product | <1 h | Similarity to reference photos |
| Ad layouts | Not a model problem — deterministic templates in the compositor | — | — | — |

Rules: only train on images we own or have permission to use; record the source of every training
image; describe results honestly ("fine-tuned FLUX.2 klein 4B"), never as our own foundation model.
Training a foundation model from scratch is not practical at this stage (millions of dollars of compute).

---

## 5. What is not solved yet

- **Exact product fidelity in video:** open video models still drift on labels and fine detail. The
  compositor (original product cut-out over the AI scene) remains the reliable answer for images; for
  video, image-to-video from the real product photo is the best available, and needs a quality check.
- **Talking person with your chosen voice:** needs LatentSync/MuseTalk on a GPU — phase 3.
- **Speed of video:** ~9 minutes per 5 s clip on a 4090 is slow next to paid APIs (30 s – 3 min).
  Faster options (A14B on bigger GPUs, LTX-2) cost more per hour or carry licence conditions.

## 6. On permissions

Model licences are agreements between the model's publisher and whoever uses it. If the business
holds a written commercial licence for a restricted model (for example a BFL licence for FLUX.2 klein
9B), record it in the engine's registry (`ENGINE_LICENSED_MODELS`) and the engine will enable that model.
Without one, the engine only loads models whose licences allow commercial use.

## Sources

- FLUX licensing: https://help.bfl.ai/articles/9272590838-self-serve-dev-license-overview-pricing , https://bfl.ai/models/flux-2-klein , https://github.com/black-forest-labs/flux/blob/main/model_licenses/LICENSE-FLUX1-schnell
- FLUX.2 klein in diffusers and timings: https://docs.jarvislabs.ai/tutorials/running-flux2-klein
- Qwen-Image: https://github.com/QwenLM/Qwen-Image , https://huggingface.co/Qwen/Qwen-Image-Edit/discussions/6 , https://runtimewire.com/article/alibaba-qwen-image-2-1-transparent-editing-research-license
- Wan 2.2: https://huggingface.co/Wan-AI/Wan2.2-TI2V-5B , https://computingforgeeks.com/run-wan-video-generation-locally/
- LTX licence: https://ltx.io/model/license
- HunyuanVideo licence: https://github.com/Tencent-Hunyuan/HunyuanVideo-1.5/blob/main/LICENSE
- TTS: https://huggingface.co/hexgrad/Kokoro-82M , https://localaimaster.com/blog/kokoro-vs-xtts-vs-chatterbox , https://www.yaps.ai/blog/best-local-tts-models
- Lip sync: https://tomodahinata.com/en/blog/ai-lip-sync-talking-head-model-selection-guide-2026 , https://github.com/TMElyralab/MuseTalk
- Segmentation: https://www.backgroundless.io/licenses (BiRefNet MIT), https://github.com/Bria-AI/RMBG-2.0
- GPU pricing: https://www.runpod.io/pricing , https://www.runpod.io/articles/comparison/choosing-gpus , https://modal.com/pricing , https://northflank.com/blog/runpod-gpu-pricing
