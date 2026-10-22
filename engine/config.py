"""Engine configuration, read once from environment variables."""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path


def _csv(name: str) -> list[str]:
    return [x.strip() for x in os.environ.get(name, "").split(",") if x.strip()]


@dataclass(frozen=True)
class Settings:
    # Shared secret the website uses to call the engine. Required unless ENGINE_TEST_MODE=1.
    token: str = field(default_factory=lambda: os.environ.get("ENGINE_TOKEN", ""))
    data_dir: Path = field(default_factory=lambda: Path(os.environ.get("ENGINE_DATA_DIR", "./engine-data")))
    # Models whose licence is non-commercial may only load if the owner records a licence here.
    licensed_models: list[str] = field(default_factory=lambda: _csv("ENGINE_LICENSED_MODELS"))
    # Optional allow-list; empty means "every model whose licence permits it".
    enabled_models: list[str] = field(default_factory=lambda: _csv("ENGINE_ENABLED_MODELS"))
    # Used to estimate the compute cost of each job (what the GPU costs you per hour).
    gpu_hourly_usd: float = field(default_factory=lambda: float(os.environ.get("GPU_HOURLY_USD", "0.69")))
    output_ttl_hours: float = field(default_factory=lambda: float(os.environ.get("OUTPUT_TTL_HOURS", "48")))
    max_queue: int = field(default_factory=lambda: int(os.environ.get("ENGINE_MAX_QUEUE", "20")))
    # Test mode registers a clearly-labelled test-pattern backend and nothing else. Never use in production.
    test_mode: bool = field(default_factory=lambda: os.environ.get("ENGINE_TEST_MODE") == "1")


def load() -> Settings:
    s = Settings()
    if not s.test_mode and len(s.token) < 24:
        raise SystemExit("ENGINE_TOKEN must be set to a random string of at least 24 characters.")
    s.data_dir.mkdir(parents=True, exist_ok=True)
    (s.data_dir / "outputs").mkdir(exist_ok=True)
    return s
