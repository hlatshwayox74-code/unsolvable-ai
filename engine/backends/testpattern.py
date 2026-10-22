"""TEST MODE ONLY. Produces a labelled test-pattern PNG so the queue and API can be tested on a
machine without a GPU. It is registered only when ENGINE_TEST_MODE=1, and every output carries
meta {"test_pattern": True}. It is not a generative model and must never serve real users."""
from __future__ import annotations

import io
import time

from engine.backends import Cancelled, Output, RunContext


class TestPattern:
    def __init__(self, spec, settings):
        self.spec = spec
        self.loaded = False

    def load(self) -> None:
        self.loaded = True

    def unload(self) -> None:
        self.loaded = False

    def run(self, ctx: RunContext) -> list[Output]:
        from PIL import Image, ImageDraw

        if ctx.params.get("fail"):
            raise RuntimeError("Requested failure for testing.")
        steps = int(ctx.params.get("steps", 3))
        for i in range(steps):
            time.sleep(float(ctx.params.get("delay", 0)))
            if not ctx.progress((i + 1) / steps):
                raise Cancelled()
        w, h = int(ctx.params.get("width", 64)), int(ctx.params.get("height", 64))
        img = Image.new("RGB", (w, h), (255, 209, 0))
        ImageDraw.Draw(img).text((4, 4), "TEST", fill=(0, 0, 0))
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return [Output(buf.getvalue(), "image/png", {"width": w, "height": h, "test_pattern": True})]


def create(spec, settings):
    return TestPattern(spec, settings)
