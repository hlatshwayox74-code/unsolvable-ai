"""Kokoro-82M text-to-speech backend (pip package `kokoro`, Apache 2.0). Runs on CPU or GPU."""
from __future__ import annotations

import io

from engine.backends import Cancelled, Output, RunContext
from engine.registry import KOKORO_VOICES


class KokoroTTS:
    def __init__(self, spec, settings):
        self.spec = spec
        self.settings = settings
        self.pipes: dict[str, object] = {}
        self.loaded = False

    def _pipe(self, lang: str):
        from kokoro import KPipeline

        if lang not in self.pipes:
            self.pipes[lang] = KPipeline(lang_code=lang)
        return self.pipes[lang]

    def load(self) -> None:
        self._pipe("a")
        self.loaded = True

    def unload(self) -> None:
        self.pipes.clear()
        self.loaded = False

    def run(self, ctx: RunContext) -> list[Output]:
        import numpy as np
        import soundfile as sf

        voice = str(ctx.params.get("voiceId", "af_heart"))
        if voice not in KOKORO_VOICES:
            raise ValueError(f"Unknown voice '{voice}'.")
        speed = float(ctx.params.get("speed", 1.0))
        pipe = self._pipe(voice[0])
        chunks = []
        total = max(1, len(ctx.prompt))
        done = 0
        for graphemes, _ps, audio in pipe(ctx.prompt, voice=voice, speed=speed):
            chunks.append(audio)
            done += len(graphemes)
            if not ctx.progress(min(0.99, done / total)):
                raise Cancelled()
        if not chunks:
            raise ValueError("Nothing to say: the script produced no audio.")
        wav = np.concatenate(chunks)
        buf = io.BytesIO()
        rate = int(self.spec.defaults["sample_rate"])
        sf.write(buf, wav, rate, format="WAV")
        return [Output(buf.getvalue(), "audio/wav", {"seconds": round(len(wav) / rate, 2)})]


def create(spec, settings):
    return KokoroTTS(spec, settings)
