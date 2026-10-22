"""HTTP API for the Unsolvable.ai creative engine.

Run:  uvicorn engine.app:app --host 0.0.0.0 --port 8000
Every route except /v1/health needs `Authorization: Bearer $ENGINE_TOKEN`.
"""
from __future__ import annotations

import base64
import binascii
import hmac
from contextlib import asynccontextmanager
from typing import Any

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from engine import __version__, planner, registry
from engine.config import Settings, load
from engine.jobs import JobQueue, gpu_info

MAX_INPUT_BYTES = 60 * 1024 * 1024  # all inputs of one job together


class JobIn(BaseModel):
    model: str
    mode: str
    prompt: str = Field(default="", max_length=4000)
    params: dict[str, Any] = Field(default_factory=dict)
    images: list[str] = Field(default_factory=list, max_length=4)  # base64
    videos: list[str] = Field(default_factory=list, max_length=12)  # base64 (compose only)
    audio: str | None = None  # base64 WAV/MP3 (compose only)
    # Or links the engine downloads itself (the website sends short-lived signed links).
    imageUrls: list[str] = Field(default_factory=list, max_length=4)
    videoUrls: list[str] = Field(default_factory=list, max_length=12)
    audioUrl: str | None = None


class BriefIn(BaseModel):
    product: str = Field(max_length=120)
    benefit: str = Field(default="", max_length=160)
    audience: str = Field(default="", max_length=120)
    cta: str = Field(default="", max_length=60)
    tone: str = "bold"
    platform: str = "tiktok"
    seconds: int = 15


def _b64(items: list[str], what: str) -> list[bytes]:
    out = []
    for s in items:
        if "," in s[:100] and s.startswith("data:"):
            s = s.split(",", 1)[1]
        try:
            out.append(base64.b64decode(s, validate=True))
        except (binascii.Error, ValueError):
            raise HTTPException(400, f"One of the {what} isn't valid base64.")
    return out


def _download(urls: list[str], what: str, allow_http: bool, budget: list[int]) -> list[bytes]:
    """Fetch inputs from https links, within the per-job size budget. Only the authenticated website calls this."""
    import urllib.request

    out = []
    for url in urls:
        if not (url.startswith("https://") or (allow_http and url.startswith("http://"))):
            raise HTTPException(400, f"Input links for {what} must be https.")
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "unsolvable-engine"}), timeout=60) as r:
                data = r.read(budget[0] + 1)
        except Exception:  # noqa: BLE001
            raise HTTPException(400, f"Couldn't download one of the {what}. The link may have expired.")
        budget[0] -= len(data)
        if budget[0] < 0:
            raise HTTPException(413, "The inputs are too large (60 MB limit per job).")
        out.append(data)
    return out


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or load()
    if settings.test_mode:
        registry.enable_test_pattern()
    queue = JobQueue(settings)

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        queue.start()
        yield
        queue.stop()

    app = FastAPI(title="Unsolvable.ai engine", version=__version__, lifespan=lifespan)
    app.state.queue = queue
    app.state.settings = settings

    def auth(request: Request) -> None:
        header = request.headers.get("authorization", "")
        given = header[7:] if header.lower().startswith("bearer ") else ""
        if settings.test_mode and not settings.token:
            return
        if not given or not hmac.compare_digest(given.encode(), settings.token.encode()):
            raise HTTPException(401, "Missing or wrong engine token.")

    def model_view(spec: registry.ModelSpec) -> dict:
        ok, reason = registry.permitted(spec, settings.licensed_models, settings.enabled_models)
        gpu = gpu_info()
        fits = spec.min_vram_gb == 0 or gpu["vram_gb"] >= spec.min_vram_gb
        d = registry.as_dict(spec)
        d.update(
            permitted=ok,
            reason=reason or (None if fits else f"Needs a GPU with about {spec.min_vram_gb:g} GB of memory."),
            available=ok and fits,
        )
        if spec.id == "kokoro-82m":
            d["voices"] = [{"id": k, "name": v} for k, v in registry.KOKORO_VOICES.items()]
        return d

    @app.get("/v1/health")
    def health() -> dict:
        return {
            "ok": True,
            "version": __version__,
            "gpu": gpu_info(),
            "testMode": settings.test_mode,
            "queued": len(queue.pending),
            "loaded": queue.manager.loaded_ids(),
        }

    @app.get("/v1/models", dependencies=[Depends(auth)])
    def models() -> dict:
        return {"models": [model_view(m) for m in registry.all_models()]}

    @app.post("/v1/plan", dependencies=[Depends(auth)])
    def plan(brief: BriefIn) -> dict:
        return planner.plan(brief.model_dump())

    @app.post("/v1/jobs", dependencies=[Depends(auth)], status_code=202)
    def submit(body: JobIn) -> dict:
        spec = registry.get(body.model)
        if not spec:
            raise HTTPException(404, "Unknown model.")
        if body.mode not in spec.modes:
            raise HTTPException(400, f"{spec.name} doesn't support '{body.mode}'.")
        view = model_view(spec)
        if not view["available"]:
            raise HTTPException(409, view["reason"] or "This model isn't available on this engine.")
        if spec.task in ("image", "video") and body.mode != "compose" and not body.prompt.strip():
            raise HTTPException(400, "Write a prompt.")
        if body.mode == "tts" and not body.prompt.strip():
            raise HTTPException(400, "Write the script to read.")
        budget = [MAX_INPUT_BYTES]
        allow_http = settings.test_mode
        images = _b64(body.images, "images") + _download(body.imageUrls, "images", allow_http, budget)
        videos = _b64(body.videos, "videos") + _download(body.videoUrls, "shots", allow_http, budget)
        audio = _b64([body.audio], "audio")[0] if body.audio else None
        if body.audioUrl and audio is None:
            audio = _download([body.audioUrl], "voiceover", allow_http, budget)[0]
        if body.mode == "compose" and not videos:
            raise HTTPException(400, "Add at least one shot to assemble.")
        total = sum(map(len, images)) + sum(map(len, videos)) + (len(audio) if audio else 0)
        if total > MAX_INPUT_BYTES:
            raise HTTPException(413, "The inputs are too large (60 MB limit per job).")
        if body.mode in ("i2i", "i2v") and not images:
            raise HTTPException(400, "Add a reference image.")
        try:
            job = queue.submit(spec.id, body.mode, body.prompt, body.params, images, videos, audio)
        except OverflowError as e:
            raise HTTPException(429, str(e))
        return job.view() | {"position": queue.position(job.id)}

    @app.get("/v1/jobs/{job_id}", dependencies=[Depends(auth)])
    def status(job_id: str) -> dict:
        job = queue.get(job_id)
        if not job:
            raise HTTPException(404, "Job not found (finished jobs are kept for a limited time).")
        return job.view() | {"position": queue.position(job.id)}

    @app.get("/v1/jobs/{job_id}/outputs/{index}", dependencies=[Depends(auth)])
    def output(job_id: str, index: int):
        job = queue.get(job_id)
        if not job or job.status != "completed":
            raise HTTPException(404, "No output.")
        path = queue.output_path(job, index)
        if not path or not path.exists():
            raise HTTPException(404, "No output.")
        return FileResponse(path, media_type=job.outputs[index]["contentType"])

    @app.delete("/v1/jobs/{job_id}", dependencies=[Depends(auth)])
    def cancel(job_id: str) -> dict:
        job = queue.cancel(job_id)
        if not job:
            raise HTTPException(404, "Job not found.")
        return job.view()

    return app


def __getattr__(name: str):
    # `uvicorn engine.app:app` builds the app lazily so importing this module in tests has no side effects.
    if name == "app":
        globals()["app"] = create_app()
        return globals()["app"]
    raise AttributeError(name)
