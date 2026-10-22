"""Model registry: what each model is, what it may be used for, and what it needs to run.

Every entry records its licence. Models whose licence forbids commercial use are only loadable
when the owner lists them in ENGINE_LICENSED_MODELS (meaning: we hold a written licence).
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Literal

Task = Literal["image", "video", "audio", "segmentation"]
Mode = Literal["t2i", "i2i", "t2v", "i2v", "tts", "cutout", "compose"]


@dataclass(frozen=True)
class ModelSpec:
    id: str
    name: str
    version: str
    task: Task
    modes: tuple[Mode, ...]
    repo: str  # Hugging Face repo the weights come from
    license: str
    license_url: str
    commercial: Literal["allowed", "license-required", "revenue-threshold"]
    min_vram_gb: float  # 0 = runs on CPU
    backend: str  # module name in engine.backends
    sizes: tuple[tuple[int, int], ...] = ()
    defaults: dict = field(default_factory=dict)
    limits: str = ""
    use_for: str = ""


REGISTRY: tuple[ModelSpec, ...] = (
    ModelSpec(
        id="flux2-klein-4b",
        name="FLUX.2 [klein] 4B",
        version="FLUX.2-klein-4B",
        task="image",
        modes=("t2i", "i2i"),
        repo="black-forest-labs/FLUX.2-klein-4B",
        license="Apache-2.0",
        license_url="https://help.bfl.ai/articles/9272590838-self-serve-dev-license-overview-pricing",
        commercial="allowed",
        min_vram_gb=13,
        backend="flux2_klein",
        sizes=((1024, 1024), (1536, 1024), (1024, 1536), (1408, 784), (784, 1408), (1152, 2048), (2048, 1152)),
        defaults={"steps": 4, "guidance": 1.0},
        limits="Distilled 4-step model. Up to 4 megapixels; sides must be multiples of 16. Text rendering is weaker than Qwen-Image.",
        use_for="Product photography, ad backgrounds, edits that keep details from reference photos.",
    ),
    ModelSpec(
        id="flux2-klein-9b",
        name="FLUX.2 [klein] 9B",
        version="FLUX.2-klein-9B",
        task="image",
        modes=("t2i", "i2i"),
        repo="black-forest-labs/FLUX.2-klein-9B",
        license="FLUX Non-Commercial License",
        license_url="https://bfl.ai/legal/non-commercial-license-terms",
        commercial="license-required",
        min_vram_gb=20,
        backend="flux2_klein",
        sizes=((1024, 1024), (1536, 1024), (1024, 1536), (1152, 2048), (2048, 1152)),
        defaults={"steps": 4, "guidance": 1.0},
        limits="Needs a paid BFL commercial licence before use in the business.",
        use_for="Higher-quality images once licensed.",
    ),
    ModelSpec(
        id="wan22-ti2v-5b",
        name="Wan 2.2 TI2V-5B",
        version="Wan2.2-TI2V-5B-Diffusers",
        task="video",
        modes=("t2v", "i2v"),
        repo="Wan-AI/Wan2.2-TI2V-5B-Diffusers",
        license="Apache-2.0",
        license_url="https://huggingface.co/Wan-AI/Wan2.2-TI2V-5B",
        commercial="allowed",
        min_vram_gb=24,
        backend="wan_ti2v",
        sizes=((1280, 704), (704, 1280)),
        defaults={"steps": 50, "guidance": 5.0, "fps": 24, "frames": 121},
        limits="About 9 minutes per 5-second 720p clip on an RTX 4090. No audio.",
        use_for="Text-to-video and animating a product photo.",
    ),
    ModelSpec(
        id="kokoro-82m",
        name="Kokoro-82M",
        version="Kokoro-82M v1.0",
        task="audio",
        modes=("tts",),
        repo="hexgrad/Kokoro-82M",
        license="Apache-2.0",
        license_url="https://huggingface.co/hexgrad/Kokoro-82M",
        commercial="allowed",
        min_vram_gb=0,
        backend="kokoro_tts",
        defaults={"sample_rate": 24000},
        limits="Preset voices only (no cloning). Best in English.",
        use_for="Voiceovers and narration.",
    ),
)

COMPOSE = ModelSpec(
    id="compose",
    name="Ad assembler (ffmpeg)",
    version="ffmpeg via imageio-ffmpeg",
    task="video",
    modes=("compose",),
    repo="",
    license="FFmpeg (LGPL/GPL build) — software tool, not an AI model",
    license_url="https://ffmpeg.org/legal.html",
    commercial="allowed",
    min_vram_gb=0,
    backend="compose",
    sizes=((1080, 1920), (1920, 1080), (1080, 1080), (1080, 1350)),
    limits="Joins clips in order, adds the voiceover, burns in captions. No AI involved.",
    use_for="Turning separate shots and a voiceover into one finished ad video.",
)
REGISTRY = REGISTRY + (COMPOSE,)

# Kokoro v1.0 voices (first letter = language: a American English, b British English, …).
KOKORO_VOICES: dict[str, str] = {
    "af_heart": "Heart (US, female)", "af_bella": "Bella (US, female)", "af_nicole": "Nicole (US, female)",
    "af_sarah": "Sarah (US, female)", "af_sky": "Sky (US, female)", "am_adam": "Adam (US, male)",
    "am_michael": "Michael (US, male)", "am_fenrir": "Fenrir (US, male)", "bf_emma": "Emma (UK, female)",
    "bf_isabella": "Isabella (UK, female)", "bm_george": "George (UK, male)", "bm_lewis": "Lewis (UK, male)",
}


TEST_PATTERN = ModelSpec(
    id="test-pattern",
    name="TEST PATTERN (not a model)",
    version="test",
    task="image",
    modes=("t2i",),
    repo="",
    license="n/a",
    license_url="",
    commercial="allowed",
    min_vram_gb=0,
    backend="testpattern",
    limits="Exists only when ENGINE_TEST_MODE=1. Draws a yellow square with the word TEST.",
    use_for="Testing the queue and API on machines without a GPU.",
)

_extra: list[ModelSpec] = []


def enable_test_pattern() -> None:
    if TEST_PATTERN not in _extra:
        _extra.append(TEST_PATTERN)


def all_models() -> tuple[ModelSpec, ...]:
    return REGISTRY + tuple(_extra)


def get(model_id: str) -> ModelSpec | None:
    return next((m for m in all_models() if m.id == model_id), None)


def permitted(spec: ModelSpec, licensed: list[str], enabled: list[str]) -> tuple[bool, str]:
    """Whether the licence and the owner's configuration allow this model to load."""
    if enabled and spec.id not in enabled:
        return False, "Not enabled on this engine (ENGINE_ENABLED_MODELS)."
    if spec.commercial == "license-required" and spec.id not in licensed:
        return False, f"{spec.license}: add '{spec.id}' to ENGINE_LICENSED_MODELS only once you hold a commercial licence."
    return True, ""


def as_dict(spec: ModelSpec) -> dict:
    d = asdict(spec)
    d["sizes"] = [list(s) for s in spec.sizes]
    d["modes"] = list(spec.modes)
    return d
