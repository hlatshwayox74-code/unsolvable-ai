# Model benchmarks — self-hosted engine

**Status: no runs yet.** These tables fill in automatically as the engine works: every job logs
model, version, GPU, generation seconds and peak GPU memory to `engine/data/usage.jsonl`, and the
Library shows the same numbers per output. Run `python -m engine.bench` on the GPU box to produce a
first set of rows (it uses the prompts in `docs/benchmark-prompts.md`).

## Images — FLUX.2 [klein] 4B

| GPU | Size | Steps | Seconds (median of 5) | Peak VRAM | Notes |
|---|---|---|---|---|---|
| _pending_ | 1024×1024 | 4 | | | |
| _pending_ | 1152×2048 | 4 | | | |
| _pending_ | 1024×1024 + 2 refs (edit) | 4 | | | |

## Video — Wan 2.2 TI2V-5B

| GPU | Size | Frames | Steps | Minutes | Peak VRAM | Notes |
|---|---|---|---|---|---|---|
| _pending_ | 1280×704 | 121 (5 s) | 50 | | | |
| _pending_ | 704×1280 (vertical) | 121 | 50 | | | |

## Voice — Kokoro-82M

| Hardware | Script length | Seconds | Real-time factor |
|---|---|---|---|
| _pending_ | 75 words | | |

## Quality scoring

For each benchmark prompt, score 1–5: prompt adherence, realism, product/person consistency,
artifacts, text/logo accuracy (where relevant). Record who scored it and the date.
