"""Benchmark the self-hosted models on this machine and print Markdown rows for MODEL_BENCHMARKS.md.

    python -m engine.bench                # every model this GPU can run
    python -m engine.bench --only flux2-klein-4b --repeat 5

Outputs are saved to ./bench-out so a person can score quality (the numbers here are speed and
memory only). Nothing is faked: a model that can't load is reported as an error row.
"""
from __future__ import annotations

import argparse
import statistics
import time
from pathlib import Path

from engine import registry
from engine.backends import RunContext, create
from engine.config import Settings
from engine.jobs import EXT, gpu_info

CASES = {
    "flux2-klein-4b": [
        ("t2i", {"width": 1024, "height": 1024}, "Studio product photo of a black hoodie with a yellow logo on a concrete plinth, hard key light, photorealistic."),
        ("t2i", {"width": 1152, "height": 2048}, "Vertical streetwear ad photo, model in a black hoodie under neon light on a wet street at night."),
    ],
    "wan22-ti2v-5b": [
        ("t2v", {"width": 704, "height": 1280, "duration": 5}, "Slow orbit around a black hoodie on a mannequin, a single hard key light sweeping across it, dust in the air."),
    ],
    "kokoro-82m": [
        ("tts", {"voiceId": "af_heart"}, "Meet the new UNSOLVABLE hoodie. Heavyweight cotton, built to last, made for the street. Beyond limits. Shop the drop today."),
    ],
}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", nargs="*")
    ap.add_argument("--repeat", type=int, default=3)
    ap.add_argument("--out", default="bench-out")
    a = ap.parse_args()
    out = Path(a.out)
    out.mkdir(exist_ok=True)
    settings = Settings()
    gpu = gpu_info()
    print(f"GPU: {gpu['name'] or 'none (CPU)'} {gpu['vram_gb']} GB\n")
    print("| Model | Mode | Size/params | Load s | Median s | Peak VRAM GB | Notes |\n|---|---|---|---|---|---|---|")
    for mid, cases in CASES.items():
        if a.only and mid not in a.only:
            continue
        spec = registry.get(mid)
        if spec.min_vram_gb > gpu["vram_gb"]:
            print(f"| {spec.name} | — | — | — | — | — | skipped: needs ~{spec.min_vram_gb:g} GB |")
            continue
        try:
            import torch
        except ImportError:
            torch = None
        backend = create(spec, settings)
        t = time.time()
        try:
            backend.load()
        except Exception as e:  # noqa: BLE001
            print(f"| {spec.name} | — | — | — | — | — | load failed: {str(e)[:80]} |")
            continue
        load_s = time.time() - t
        for i, (mode, params, prompt) in enumerate(cases):
            times, peak = [], None
            if torch is not None and torch.cuda.is_available():
                torch.cuda.reset_peak_memory_stats()
            note = ""
            for r in range(a.repeat):
                t = time.time()
                try:
                    res = backend.run(RunContext(prompt, mode, dict(params, seed=1000 + r), []))
                except Exception as e:  # noqa: BLE001
                    note = f"error: {str(e)[:80]}"
                    break
                times.append(time.time() - t)
                f = out / f"{mid}-{i}-{r}.{EXT.get(res[0].content_type, 'bin')}"
                f.write_bytes(res[0].data)
            if torch is not None and torch.cuda.is_available():
                peak = round(torch.cuda.max_memory_allocated() / 1e9, 1)
            size = f"{params.get('width')}×{params.get('height')}" if "width" in params else ", ".join(f"{k}={v}" for k, v in params.items())
            med = f"{statistics.median(times):.1f}" if times else "—"
            print(f"| {spec.name} | {mode} | {size} | {load_s:.0f} | {med} | {peak if peak is not None else '—'} | {note or f'n={len(times)}'} |")
        backend.unload()
    print(f"\nSaved outputs to {out.resolve()} for quality scoring.")


if __name__ == "__main__":
    main()
