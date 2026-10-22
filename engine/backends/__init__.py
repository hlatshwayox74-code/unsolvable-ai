"""Model backends. Each module exposes `create(spec, settings) -> Backend`.

Heavy libraries (torch, diffusers, kokoro) are imported inside the backends so the engine's API,
queue and tests run on machines without them.
"""
from __future__ import annotations

import importlib
from dataclasses import dataclass, field
from typing import Any, Callable, Protocol


@dataclass
class Output:
    data: bytes
    content_type: str
    meta: dict[str, Any] = field(default_factory=dict)


class Cancelled(Exception):
    """Raised inside a backend when the job was cancelled mid-run."""


@dataclass
class RunContext:
    prompt: str
    mode: str
    params: dict[str, Any]
    images: list[bytes]
    videos: list[bytes] = field(default_factory=list)
    audio: bytes | None = None
    # Report real progress (0..1). Returns False if the job was cancelled.
    progress: Callable[[float], bool] = lambda _p: True


class Backend(Protocol):
    loaded: bool

    def load(self) -> None: ...
    def unload(self) -> None: ...
    def run(self, ctx: RunContext) -> list[Output]: ...


def create(spec, settings) -> Backend:
    mod = importlib.import_module(f"engine.backends.{spec.backend}")
    return mod.create(spec, settings)
