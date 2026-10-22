"""Job queue and GPU worker.

One worker thread runs jobs in order (a single GPU can only do one heavy job well at a time).
The model manager keeps at most one GPU model resident and unloads it before loading another,
so a 24 GB card can serve image, video and voice models in turn. CPU-only models stay loaded.
"""
from __future__ import annotations

import json
import shutil
import threading
import time
import traceback
import uuid
from collections import deque
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from engine import qc, registry
from engine.backends import Backend, Cancelled, Output, RunContext, create
from engine.config import Settings

EXT = {"image/png": "png", "image/webp": "webp", "image/jpeg": "jpg", "video/mp4": "mp4", "audio/wav": "wav"}
TERMINAL = {"completed", "failed", "canceled"}


@dataclass
class Job:
    id: str
    model_id: str
    mode: str
    prompt: str
    params: dict[str, Any]
    images: list[bytes] = field(default_factory=list, repr=False)
    videos: list[bytes] = field(default_factory=list, repr=False)
    audio: bytes | None = field(default=None, repr=False)
    status: str = "queued"
    progress: float | None = None
    error: str | None = None
    created_at: float = field(default_factory=time.time)
    started_at: float | None = None
    finished_at: float | None = None
    outputs: list[dict[str, Any]] = field(default_factory=list)
    metrics: dict[str, Any] = field(default_factory=dict)
    quality: dict[str, Any] | None = None
    cancel_requested: bool = False

    def view(self) -> dict[str, Any]:
        spec = registry.get(self.model_id)
        return {
            "id": self.id,
            "model": self.model_id,
            "modelName": spec.name if spec else self.model_id,
            "modelVersion": spec.version if spec else None,
            "license": spec.license if spec else None,
            "mode": self.mode,
            "status": self.status,
            "progress": self.progress,
            "error": self.error,
            "createdAt": self.created_at,
            "startedAt": self.started_at,
            "finishedAt": self.finished_at,
            "outputs": [{"index": i, "contentType": o["contentType"], "meta": o["meta"], "bytes": o["bytes"]} for i, o in enumerate(self.outputs)],
            "metrics": self.metrics,
            "quality": self.quality,
        }


class ModelManager:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.backends: dict[str, Backend] = {}
        self.lock = threading.Lock()

    def get(self, spec: registry.ModelSpec) -> Backend:
        with self.lock:
            b = self.backends.get(spec.id)
            if b and b.loaded:
                return b
            if spec.min_vram_gb > 0:
                # Free the GPU: unload every other GPU model first.
                for mid, other in list(self.backends.items()):
                    o = registry.get(mid)
                    if other.loaded and o and o.min_vram_gb > 0 and mid != spec.id:
                        other.unload()
            b = b or create(spec, self.settings)
            b.load()
            self.backends[spec.id] = b
            return b

    def unload_all(self) -> None:
        with self.lock:
            for b in self.backends.values():
                if b.loaded:
                    b.unload()

    def loaded_ids(self) -> list[str]:
        return [k for k, b in self.backends.items() if b.loaded]


def gpu_info() -> dict[str, Any]:
    try:
        import torch

        if torch.cuda.is_available():
            p = torch.cuda.get_device_properties(0)
            return {"name": p.name, "vram_gb": round(p.total_memory / 1e9, 1), "cuda": True}
    except ImportError:
        pass
    return {"name": None, "vram_gb": 0, "cuda": False}


class JobQueue:
    def __init__(self, settings: Settings, manager: ModelManager | None = None):
        self.settings = settings
        self.manager = manager or ModelManager(settings)
        self.jobs: dict[str, Job] = {}
        self.pending: deque[str] = deque()
        self.cv = threading.Condition()
        self.stopping = False
        self.worker = threading.Thread(target=self._loop, name="gpu-worker", daemon=True)
        self.out_dir = settings.data_dir / "outputs"
        self.usage_log = settings.data_dir / "usage.jsonl"

    def start(self) -> None:
        self.worker.start()

    def stop(self) -> None:
        with self.cv:
            self.stopping = True
            self.cv.notify_all()

    # ── public API ──
    def submit(self, model_id: str, mode: str, prompt: str, params: dict, images: list[bytes], videos: list[bytes], audio: bytes | None) -> Job:
        with self.cv:
            if len(self.pending) >= self.settings.max_queue:
                raise OverflowError(f"The queue is full ({self.settings.max_queue} jobs waiting). Try again shortly.")
            job = Job(uuid.uuid4().hex, model_id, mode, prompt, params, images, videos, audio)
            self.jobs[job.id] = job
            self.pending.append(job.id)
            self.cv.notify_all()
            return job

    def get(self, job_id: str) -> Job | None:
        return self.jobs.get(job_id)

    def cancel(self, job_id: str) -> Job | None:
        with self.cv:
            job = self.jobs.get(job_id)
            if not job or job.status in TERMINAL:
                return job
            if job.status == "queued":
                self.pending.remove(job.id)
                job.status, job.finished_at = "canceled", time.time()
                self._free_inputs(job)
            else:
                job.cancel_requested = True
            return job

    def position(self, job_id: str) -> int | None:
        try:
            return list(self.pending).index(job_id) + 1
        except ValueError:
            return None

    def output_path(self, job: Job, index: int) -> Path | None:
        if 0 <= index < len(job.outputs):
            return Path(job.outputs[index]["path"])
        return None

    # ── worker ──
    def _loop(self) -> None:
        while True:
            with self.cv:
                while not self.pending and not self.stopping:
                    self.cv.wait(timeout=60)
                    self._cleanup()
                if self.stopping:
                    return
                job = self.jobs[self.pending.popleft()]
                job.status, job.started_at, job.progress = "processing", time.time(), 0.0
            self._run(job)

    def _run(self, job: Job) -> None:
        spec = registry.get(job.model_id)
        t0 = time.time()
        torch_mod = _torch()
        try:
            if spec is None:
                raise ValueError("Unknown model.")
            if torch_mod and torch_mod.cuda.is_available():
                torch_mod.cuda.reset_peak_memory_stats()
            load_t = time.time()
            backend = self.manager.get(spec)
            load_seconds = time.time() - load_t

            def progress(p: float) -> bool:
                job.progress = max(0.0, min(1.0, float(p)))
                return not job.cancel_requested

            ctx = RunContext(job.prompt, job.mode, job.params, job.images, job.videos, job.audio, progress)
            try:
                outputs = backend.run(ctx)
            except Exception as e:  # noqa: BLE001
                if torch_mod and "out of memory" in str(e).lower():
                    # Free everything and retry once before giving up.
                    self.manager.unload_all()
                    backend = self.manager.get(spec)
                    outputs = backend.run(ctx)
                else:
                    raise
            job.outputs = self._save(job, outputs)
            job.quality = self._quality(job, spec, outputs)
            job.status = "completed"
        except Cancelled:
            job.status = "canceled"
        except Exception as e:  # noqa: BLE001
            job.status = "failed"
            msg = str(e) or e.__class__.__name__
            if "out of memory" in msg.lower():
                msg = f"The GPU ran out of memory for {spec.name if spec else 'this model'}. Use a smaller size or a GPU with more memory."
            job.error = msg[:500]
            traceback.print_exc()
        finally:
            job.finished_at = time.time()
            secs = job.finished_at - t0
            peak = None
            if torch_mod and torch_mod.cuda.is_available():
                peak = round(torch_mod.cuda.max_memory_allocated() / 1e9, 2)
            job.metrics = {
                "seconds": round(secs, 2),
                "loadSeconds": round(locals().get("load_seconds", 0.0), 2),
                "queueSeconds": round((job.started_at or t0) - job.created_at, 2),
                "peakVramGb": peak,
                "gpu": gpu_info()["name"],
                "estCostUsd": round(secs * self.settings.gpu_hourly_usd / 3600, 5),
                "costBasis": f"GPU time × ${self.settings.gpu_hourly_usd}/h (set GPU_HOURLY_USD)",
            }
            if job.status != "completed":
                job.progress = None
            self._free_inputs(job)
            self._log(job)

    def _save(self, job: Job, outputs: list[Output]) -> list[dict]:
        if not outputs:
            raise RuntimeError("The model returned no output.")
        folder = self.out_dir / job.id
        folder.mkdir(parents=True, exist_ok=True)
        saved = []
        for i, o in enumerate(outputs):
            path = folder / f"{i}.{EXT.get(o.content_type, 'bin')}"
            path.write_bytes(o.data)
            saved.append({"path": str(path), "contentType": o.content_type, "meta": o.meta, "bytes": len(o.data)})
        return saved

    def _quality(self, job: Job, spec: registry.ModelSpec, outputs: list[Output]) -> dict:
        checks: list[dict] = []
        p = job.params
        for o in outputs:
            if o.content_type.startswith("image/"):
                checks += qc.check_image(o.data, p.get("width"), p.get("height"))
            elif o.content_type.startswith("video/"):
                want = None if job.mode == "compose" else float(p.get("duration", 5))
                checks += qc.check_video(o.data, p.get("width"), p.get("height"), want)
            elif o.content_type == "audio/wav":
                checks += qc.check_audio(o.data)
        return qc.summarise(checks)

    def _free_inputs(self, job: Job) -> None:
        job.images, job.videos, job.audio = [], [], None

    def _log(self, job: Job) -> None:
        rec = {k: v for k, v in job.view().items() if k not in ("outputs",)}
        rec["promptChars"] = len(job.prompt)
        rec["outputs"] = len(job.outputs)
        try:
            with self.usage_log.open("a", encoding="utf-8") as f:
                f.write(json.dumps(rec) + "\n")
        except OSError:
            pass

    def _cleanup(self) -> None:
        cutoff = time.time() - self.settings.output_ttl_hours * 3600
        for jid, job in list(self.jobs.items()):
            if job.status in TERMINAL and (job.finished_at or 0) < cutoff:
                shutil.rmtree(self.out_dir / jid, ignore_errors=True)
                self.jobs.pop(jid, None)


def _torch():
    try:
        import torch

        return torch
    except ImportError:
        return None
