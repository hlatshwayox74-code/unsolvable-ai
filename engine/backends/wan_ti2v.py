"""Wan 2.2 TI2V-5B video backend (text-to-video and image-to-video) via diffusers.

Uses WanPipeline for text-to-video and WanImageToVideoPipeline for image-to-video, loading the
shared weights once. Resolutions 1280×704 / 704×1280, 24 fps (Wan 2.2 model card). The exact
TI2V call parameters should be confirmed on the first GPU run (see MODEL_BENCHMARKS.md).
"""
from __future__ import annotations

import io
import os
import tempfile

from engine.backends import Cancelled, Output, RunContext
from engine.backends._torch import device_and_dtype, free_cuda, seed_generator


class WanTI2V:
    def __init__(self, spec, settings):
        self.spec = spec
        self.settings = settings
        self.t2v = None
        self.pipes: dict = {}
        self.active: str | None = None
        self.loaded = False

    def load(self) -> None:
        import torch
        from diffusers import AutoencoderKLWan, WanPipeline

        device, dtype = device_and_dtype()
        vae = AutoencoderKLWan.from_pretrained(self.spec.repo, subfolder="vae", torch_dtype=torch.float32)
        self.t2v = WanPipeline.from_pretrained(self.spec.repo, vae=vae, torch_dtype=dtype)
        self.device = device
        self.big_gpu = device == "cuda" and torch.cuda.get_device_properties(0).total_memory / 1e9 >= 40
        self.loaded = True

    def _pipeline(self, mode: str):
        """Build the pipeline for this mode from the shared, already-loaded components (cached)."""
        from diffusers import WanImageToVideoPipeline

        t2v = self.t2v
        if mode not in self.pipes:
            self.pipes[mode] = t2v if mode == "t2v" else WanImageToVideoPipeline(
                tokenizer=t2v.tokenizer, text_encoder=t2v.text_encoder, vae=t2v.vae, scheduler=t2v.scheduler,
                transformer=t2v.transformer, transformer_2=getattr(t2v, "transformer_2", None),
                expand_timesteps=bool(t2v.config.get("expand_timesteps", True)),
            )
        pipe = self.pipes[mode]
        if self.device == "cuda" and self.active != mode:
            # Under 40 GB, stream modules between CPU and GPU (the Wan team's 24 GB recipe offloads too).
            # Offload hooks belong to one pipeline, so they are re-attached when the mode switches.
            pipe.to("cuda") if self.big_gpu else pipe.enable_model_cpu_offload()
        self.active = mode
        return pipe

    def unload(self) -> None:
        self.t2v, self.pipes, self.active = None, {}, None
        self.loaded = False
        free_cuda()

    def run(self, ctx: RunContext) -> list[Output]:
        from diffusers.utils import export_to_video
        from PIL import Image

        p = ctx.params
        width, height = int(p.get("width", 1280)), int(p.get("height", 704))
        if (width, height) not in self.spec.sizes:
            raise ValueError(f"{width}×{height} isn't supported; use 1280×704 or 704×1280.")
        fps = int(self.spec.defaults["fps"])
        seconds = float(p.get("duration", 5))
        frames = int(round(seconds * fps / 4)) * 4 + 1  # Wan expects 4n+1 frames
        steps = int(p.get("steps", self.spec.defaults["steps"]))

        def on_step(_pipe, step, _t, kwargs):
            if not ctx.progress((step + 1) / steps):
                _pipe._interrupt = True
            return kwargs

        common = dict(
            prompt=ctx.prompt,
            negative_prompt=p.get("negativePrompt") or None,
            height=height,
            width=width,
            num_frames=frames,
            num_inference_steps=steps,
            guidance_scale=float(p.get("guidance", self.spec.defaults["guidance"])),
            generator=seed_generator(self.device, p.get("seed")),
            callback_on_step_end=on_step,
        )
        if ctx.mode == "i2v":
            if not ctx.images:
                raise ValueError("Image-to-video needs a start image.")
            start = Image.open(io.BytesIO(ctx.images[0])).convert("RGB").resize((width, height))
            pipe = self._pipeline("i2v")
            result = pipe(image=start, **common)
        else:
            pipe = self._pipeline("t2v")
            result = pipe(**common)
        if getattr(pipe, "_interrupt", False):
            pipe._interrupt = False
            raise Cancelled()
        fd, path = tempfile.mkstemp(suffix=".mp4")
        os.close(fd)
        try:
            export_to_video(result.frames[0], path, fps=fps)
            with open(path, "rb") as f:
                data = f.read()
        finally:
            os.unlink(path)
        return [Output(data, "video/mp4", {"width": width, "height": height, "frames": frames, "fps": fps})]


def create(spec, settings):
    return WanTI2V(spec, settings)
