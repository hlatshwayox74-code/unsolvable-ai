"""Ad assembler: joins video shots, lays a voiceover under them and burns in captions with ffmpeg.

Not an AI model. Uses the ffmpeg binary bundled by the `imageio-ffmpeg` package (or one on PATH).
"""
from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
from pathlib import Path

from engine.backends import Cancelled, Output, RunContext


def ffmpeg_exe() -> str:
    try:
        import imageio_ffmpeg

        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        exe = shutil.which("ffmpeg")
        if not exe:
            raise RuntimeError("ffmpeg isn't installed on the engine. Install `imageio-ffmpeg`.")
        return exe


def _srt_time(t: float) -> str:
    ms = int(round(t * 1000))
    h, ms = divmod(ms, 3_600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1000)
    return f"{h:02}:{m:02}:{s:02},{ms:03}"


def write_srt(captions: list[dict], path: Path) -> None:
    lines = []
    for i, c in enumerate(captions, 1):
        text = str(c.get("text", "")).replace("\n", " ").strip()
        if not text:
            continue
        lines += [str(i), f"{_srt_time(float(c['start']))} --> {_srt_time(float(c['end']))}", text, ""]
    path.write_text("\n".join(lines), encoding="utf-8")


class Compose:
    def __init__(self, spec, settings):
        self.spec = spec
        self.loaded = False

    def load(self) -> None:
        ffmpeg_exe()
        self.loaded = True

    def unload(self) -> None:
        self.loaded = False

    def run(self, ctx: RunContext) -> list[Output]:
        if not ctx.videos:
            raise ValueError("Add at least one video shot to assemble.")
        p = ctx.params
        w, h = int(p.get("width", 1080)), int(p.get("height", 1920))
        if (w, h) not in self.spec.sizes:
            raise ValueError(f"{w}×{h} isn't a supported ad size.")
        fps = int(p.get("fps", 24))
        exe = ffmpeg_exe()
        with tempfile.TemporaryDirectory() as tmp:
            d = Path(tmp)
            args = [exe, "-y", "-loglevel", "error"]
            for i, v in enumerate(ctx.videos):
                f = d / f"shot{i}.mp4"
                f.write_bytes(v)
                args += ["-i", str(f)]
            has_audio = bool(ctx.audio)
            if has_audio:
                a = d / "voice.audio"
                a.write_bytes(ctx.audio)  # type: ignore[arg-type]
                args += ["-i", str(a)]
            # Scale each shot to fill the frame (crop overflow), normalise fps, then concatenate.
            parts = []
            for i in range(len(ctx.videos)):
                parts.append(
                    f"[{i}:v]scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},fps={fps},setsar=1,format=yuv420p[v{i}]"
                )
            concat_in = "".join(f"[v{i}]" for i in range(len(ctx.videos)))
            parts.append(f"{concat_in}concat=n={len(ctx.videos)}:v=1:a=0[vcat]")
            vout = "vcat"
            captions = p.get("captions") or []
            if captions:
                srt = d / "captions.srt"
                write_srt(captions, srt)
                style = "FontName=DejaVu Sans,Fontsize=14,Bold=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=2,Alignment=2,MarginV=60"
                parts.append(f"[vcat]subtitles={srt.as_posix()}:force_style='{style}'[vsub]")
                vout = "vsub"
            args += ["-filter_complex", ";".join(parts), "-map", f"[{vout}]"]
            if has_audio:
                args += ["-map", f"{len(ctx.videos)}:a", "-c:a", "aac", "-b:a", "192k"]
                # Default: video length wins and a short voiceover is padded with silence.
                args += ["-shortest"] if p.get("trimToVoice") else ["-af", "apad", "-shortest"]
            args += ["-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-movflags", "+faststart", str(d / "out.mp4")]
            if not ctx.progress(0.1):
                raise Cancelled()
            proc = subprocess.run(args, capture_output=True, text=True, timeout=900)
            if proc.returncode != 0:
                raise RuntimeError("Assembling the video failed: " + proc.stderr.strip()[-400:])
            ctx.progress(1.0)
            data = (d / "out.mp4").read_bytes()
        return [Output(data, "video/mp4", {"width": w, "height": h, "fps": fps, "shots": len(ctx.videos), "voiceover": has_audio})]


def create(spec, settings):
    return Compose(spec, settings)
