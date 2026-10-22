"""FLUX.2 [klein] image backend (text-to-image and reference-image editing) via diffusers.

Pipeline signature verified against diffusers 0.41 (`Flux2KleinPipeline.__call__(image, prompt,
height, width, num_inference_steps, guidance_scale, num_images_per_prompt, generator,
callback_on_step_end, ...)`).
"""
from __future__ import annotations

import io

from engine.backends import Cancelled, Output, RunContext
from engine.backends._torch import device_and_dtype, free_cuda, seed_generator


class Flux2Klein:
    def __init__(self, spec, settings):
        self.spec = spec
        self.settings = settings
        self.pipe = None
        self.loaded = False

    def load(self) -> None:
        import torch
        from diffusers import Flux2KleinPipeline

        device, dtype = device_and_dtype()
        pipe = Flux2KleinPipeline.from_pretrained(self.spec.repo, torch_dtype=dtype)
        if device == "cuda":
            total_gb = torch.cuda.get_device_properties(0).total_memory / 1e9
            # Below ~16 GB keep weights in CPU RAM and stream them to the GPU per module.
            if total_gb < self.spec.min_vram_gb + 3:
                pipe.enable_model_cpu_offload()
            else:
                pipe.to("cuda")
        self.pipe, self.device, self.loaded = pipe, device, True

    def unload(self) -> None:
        self.pipe, self.loaded = None, False
        free_cuda()

    def run(self, ctx: RunContext) -> list[Output]:
        from PIL import Image

        p = ctx.params
        width, height = int(p.get("width", 1024)), int(p.get("height", 1024))
        if (width, height) not in self.spec.sizes:
            raise ValueError(f"{width}×{height} isn't a supported size for {self.spec.name}.")
        steps = int(p.get("steps", self.spec.defaults["steps"]))
        n = max(1, min(4, int(p.get("variations", 1))))
        refs = [Image.open(io.BytesIO(b)).convert("RGB") for b in ctx.images[:4]] if ctx.mode == "i2i" else None
        pipe = self.pipe

        def on_step(_pipe, step, _t, kwargs):
            if not ctx.progress((step + 1) / steps):
                _pipe._interrupt = True
            return kwargs

        result = pipe(
            prompt=ctx.prompt,
            image=refs if refs else None,
            width=width,
            height=height,
            num_inference_steps=steps,
            guidance_scale=float(p.get("guidance", self.spec.defaults["guidance"])),
            num_images_per_prompt=n,
            generator=seed_generator(self.device, p.get("seed")),
            callback_on_step_end=on_step,
        )
        if getattr(pipe, "_interrupt", False):
            pipe._interrupt = False
            raise Cancelled()
        outs = []
        for img in result.images:
            buf = io.BytesIO()
            fmt = "PNG" if p.get("transparent") else "WEBP"
            img.save(buf, format=fmt, quality=95)
            outs.append(Output(buf.getvalue(), "image/png" if fmt == "PNG" else "image/webp", {"width": img.width, "height": img.height}))
        return outs


def create(spec, settings):
    return Flux2Klein(spec, settings)
