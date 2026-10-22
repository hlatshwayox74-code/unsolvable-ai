"""Automatic output checks. These catch broken files and obvious failures (blank frames, wrong size,
silent audio, wrong length). They cannot judge taste, realism or product accuracy; each result says
what was checked so a person knows what still needs a human look."""
from __future__ import annotations

import io
import os
import tempfile
import wave
from typing import Any


def _check(name: str, passed: bool, detail: str) -> dict[str, Any]:
    return {"name": name, "passed": bool(passed), "detail": detail}


def check_image(data: bytes, want_w: int | None, want_h: int | None) -> list[dict]:
    from PIL import Image, ImageStat

    out = []
    try:
        img = Image.open(io.BytesIO(data))
        img.load()
    except Exception as e:  # noqa: BLE001
        return [_check("readable", False, f"Not a valid image: {e}")]
    out.append(_check("readable", True, f"{img.format} {img.width}×{img.height}"))
    if want_w and want_h:
        out.append(_check("size", (img.width, img.height) == (want_w, want_h), f"expected {want_w}×{want_h}"))
    std = max(ImageStat.Stat(img.convert("L")).stddev)
    out.append(_check("not_blank", std > 2.0, f"brightness spread {std:.1f} (a flat or black frame usually means the model failed)"))
    return out


def check_video(data: bytes, want_w: int | None, want_h: int | None, want_seconds: float | None) -> list[dict]:
    try:
        import imageio_ffmpeg
    except ImportError:
        return [_check("readable", True, "imageio-ffmpeg not installed; only the file size was checked")]
    fd, path = tempfile.mkstemp(suffix=".mp4")
    os.close(fd)
    try:
        with open(path, "wb") as f:
            f.write(data)
        try:
            reader = imageio_ffmpeg.read_frames(path)
            meta = next(reader)
            frames, means = 0, []
            for frame in reader:
                frames += 1
                if frames in (1, 12, 48, 96) or frames % 120 == 0:
                    means.append(sum(frame[::997]) / max(1, len(frame[::997])))
            reader.close()
        except Exception as e:  # noqa: BLE001
            return [_check("readable", False, f"Not a valid video: {e}")]
        w, h = meta.get("size", (0, 0))
        fps = meta.get("fps") or 0
        secs = frames / fps if fps else 0
        out = [_check("readable", frames > 0, f"{w}×{h}, {frames} frames at {fps:.0f} fps ({secs:.1f}s)")]
        if want_w and want_h:
            out.append(_check("size", (w, h) == (want_w, want_h), f"expected {want_w}×{want_h}"))
        if want_seconds:
            out.append(_check("length", abs(secs - want_seconds) <= 0.6, f"expected about {want_seconds:.1f}s"))
        out.append(_check("not_blank", any(m > 8 for m in means), "sampled frames are not all black"))
        return out
    finally:
        os.unlink(path)


def check_audio(data: bytes) -> list[dict]:
    try:
        with wave.open(io.BytesIO(data)) as w:
            n, rate, width = w.getnframes(), w.getframerate(), w.getsampwidth()
            raw = w.readframes(min(n, rate * 30))
    except Exception as e:  # noqa: BLE001
        return [_check("readable", False, f"Not a valid WAV file: {e}")]
    secs = n / rate if rate else 0
    peak = 0
    if width == 2 and raw:
        import array

        a = array.array("h", raw)
        peak = max(abs(x) for x in a[:: max(1, len(a) // 5000)])
    return [
        _check("readable", secs > 0.2, f"{secs:.1f}s at {rate} Hz"),
        _check("not_silent", peak > 300 or width != 2, "audio contains speech-level signal"),
    ]


def summarise(checks: list[dict]) -> dict:
    failed = [c for c in checks if not c["passed"]]
    return {
        "passed": not failed,
        "checks": checks,
        "note": "Automatic checks cover file validity, size, length, blank frames and silence. They don't judge quality or product accuracy.",
    }
