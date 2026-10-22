"""Engine tests that run without a GPU.

- The API, queue, auth, licence gating, cancel and metrics run against the TEST-MODE test pattern.
- The ad assembler (ffmpeg) runs for real on synthetic clips and a synthetic voiceover track.
"""
from __future__ import annotations

import base64
import io
import json
import math
import struct
import subprocess
import time
import wave
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from engine import planner, qc, registry
from engine.backends import RunContext
from engine.backends.compose import Compose, ffmpeg_exe
from engine.config import Settings

TOKEN = "t" * 32


def make_settings(tmp: Path, **kw) -> Settings:
    (tmp / "outputs").mkdir(parents=True, exist_ok=True)
    base = dict(token=TOKEN, data_dir=tmp, licensed_models=[], enabled_models=[], gpu_hourly_usd=0.69,
                output_ttl_hours=48, max_queue=5, test_mode=True)
    base.update(kw)
    return Settings(**base)


@pytest.fixture()
def client(tmp_path):
    from engine.app import create_app

    with TestClient(create_app(make_settings(tmp_path))) as c:
        c.headers["Authorization"] = f"Bearer {TOKEN}"
        yield c


def wait(c: TestClient, job_id: str, timeout=20) -> dict:
    end = time.time() + timeout
    while time.time() < end:
        j = c.get(f"/v1/jobs/{job_id}").json()
        if j["status"] in ("completed", "failed", "canceled"):
            return j
        time.sleep(0.05)
    raise AssertionError("job did not finish")


# ── API + queue ──

def test_health_is_public_and_reports_no_gpu(tmp_path):
    from engine.app import create_app

    with TestClient(create_app(make_settings(tmp_path))) as c:
        h = c.get("/v1/health").json()
    assert h["ok"] and h["testMode"] is True and h["gpu"]["cuda"] is False


def test_auth_required(client):
    r = client.get("/v1/models", headers={"Authorization": "Bearer wrong"})
    assert r.status_code == 401


def test_models_list_licence_and_gpu_status(client):
    models = {m["id"]: m for m in client.get("/v1/models").json()["models"]}
    assert models["flux2-klein-4b"]["license"] == "Apache-2.0"
    assert models["flux2-klein-4b"]["available"] is False  # no GPU here
    assert "GB" in models["flux2-klein-4b"]["reason"]
    assert models["flux2-klein-9b"]["permitted"] is False  # non-commercial licence
    assert models["kokoro-82m"]["available"] is True and len(models["kokoro-82m"]["voices"]) == 12
    assert models["compose"]["available"] is True


def test_licensed_model_needs_explicit_licence():
    spec = registry.get("flux2-klein-9b")
    assert registry.permitted(spec, [], [])[0] is False
    assert registry.permitted(spec, ["flux2-klein-9b"], [])[0] is True
    assert registry.permitted(registry.get("flux2-klein-4b"), [], ["kokoro-82m"])[0] is False


def test_job_runs_with_progress_metrics_quality_and_provenance(client, tmp_path):
    r = client.post("/v1/jobs", json={"model": "test-pattern", "mode": "t2i", "prompt": "x", "params": {"width": 96, "height": 64}})
    assert r.status_code == 202
    j = wait(client, r.json()["id"])
    assert j["status"] == "completed" and j["progress"] == 1.0
    assert j["model"] == "test-pattern" and j["modelVersion"] == "test" and j["license"] == "n/a"
    assert j["outputs"][0]["meta"]["test_pattern"] is True
    assert j["metrics"]["seconds"] >= 0 and "estCostUsd" in j["metrics"]
    assert j["quality"]["passed"] is True
    img = client.get(f"/v1/jobs/{j['id']}/outputs/0")
    assert img.status_code == 200 and img.headers["content-type"] == "image/png"
    log = (tmp_path / "usage.jsonl").read_text().strip().splitlines()
    assert json.loads(log[-1])["id"] == j["id"]


def test_failure_is_reported_not_faked(client):
    r = client.post("/v1/jobs", json={"model": "test-pattern", "mode": "t2i", "prompt": "x", "params": {"fail": True}})
    j = wait(client, r.json()["id"])
    assert j["status"] == "failed" and "Requested failure" in j["error"] and j["outputs"] == []


def test_cancel_running_job(client):
    r = client.post("/v1/jobs", json={"model": "test-pattern", "mode": "t2i", "prompt": "x", "params": {"steps": 200, "delay": 0.02}})
    jid = r.json()["id"]
    time.sleep(0.2)
    client.delete(f"/v1/jobs/{jid}")
    assert wait(client, jid)["status"] == "canceled"


def test_rejects_unavailable_and_bad_input(client):
    assert client.post("/v1/jobs", json={"model": "flux2-klein-4b", "mode": "t2i", "prompt": "x"}).status_code == 409
    assert client.post("/v1/jobs", json={"model": "nope", "mode": "t2i", "prompt": "x"}).status_code == 404
    assert client.post("/v1/jobs", json={"model": "test-pattern", "mode": "t2v", "prompt": "x"}).status_code == 400
    assert client.post("/v1/jobs", json={"model": "test-pattern", "mode": "t2i", "prompt": " "}).status_code == 400
    assert client.post("/v1/jobs", json={"model": "compose", "mode": "compose", "videos": ["%%%"]}).status_code == 400


def test_test_pattern_absent_outside_test_mode(tmp_path):
    registry._extra.clear()
    assert registry.get("test-pattern") is None


# ── Planner ──

def test_planner_builds_shots_script_and_captions():
    p = planner.plan({"product": "UNSOLVABLE black hoodie", "benefit": "Heavyweight cotton built to last",
                      "audience": "streetwear fans", "cta": "Shop the drop", "tone": "street", "platform": "tiktok", "seconds": 15})
    assert p["output"] == {"width": 1080, "height": 1920}
    assert len(p["shots"]) == 3 and p["shots"][-1]["beat"] == "Hero"
    assert "Shop the drop" in p["voiceover"]["script"]
    assert p["captions"] and all(c["end"] <= 15 for c in p["captions"])
    assert p["plannedBy"].startswith("rules")


# ── Real ffmpeg assembly ──

def _clip(path: Path, w: int, h: int, secs: float, colour: str) -> bytes:
    subprocess.run([ffmpeg_exe(), "-y", "-loglevel", "error", "-f", "lavfi", "-i", f"color=c={colour}:s={w}x{h}:r=24:d={secs}",
                    "-f", "lavfi", "-i", f"testsrc2=s={w // 2}x{h // 2}:r=24:d={secs}",
                    "-filter_complex", "[0:v][1:v]overlay=(W-w)/2:(H-h)/2", "-c:v", "libx264", "-pix_fmt", "yuv420p", str(path)], check=True)
    return path.read_bytes()


def _tone(secs: float, rate=24000) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(b"".join(struct.pack("<h", int(8000 * math.sin(2 * math.pi * 220 * i / rate))) for i in range(int(secs * rate))))
    return buf.getvalue()


def _probe(data: bytes, tmp: Path) -> str:
    f = tmp / "probe.mp4"
    f.write_bytes(data)
    return subprocess.run([ffmpeg_exe(), "-hide_banner", "-i", str(f)], capture_output=True, text=True).stderr


def test_compose_joins_shots_adds_voiceover_and_captions(tmp_path):
    shots = [_clip(tmp_path / "a.mp4", 1280, 704, 2, "black"), _clip(tmp_path / "b.mp4", 704, 1280, 2, "0xFFD100")]
    spec = registry.get("compose")
    out = Compose(spec, None).run(RunContext(
        prompt="", mode="compose", images=[], videos=shots, audio=_tone(3.0),
        params={"width": 1080, "height": 1920, "captions": [{"start": 0.2, "end": 1.8, "text": "BEYOND LIMITS."}]},
    ))[0]
    assert out.content_type == "video/mp4" and out.meta["voiceover"] is True
    info = _probe(out.data, tmp_path)
    assert "1080x1920" in info and "Audio: aac" in info and "Video: h264" in info
    checks = qc.check_video(out.data, 1080, 1920, 4.0)
    assert all(c["passed"] for c in checks), checks
    (tmp_path.parent / "compose-demo.mp4").write_bytes(out.data)


def test_qc_flags_blank_image():
    from PIL import Image

    buf = io.BytesIO()
    Image.new("RGB", (64, 64), (0, 0, 0)).save(buf, "PNG")
    res = qc.summarise(qc.check_image(buf.getvalue(), 64, 64))
    assert res["passed"] is False
    assert qc.check_audio(_tone(1.0))[1]["passed"] is True


def test_compose_through_api_downloads_inputs_from_links(client, tmp_path):
    """The website sends signed links; the engine downloads the shots and voiceover and returns one MP4."""
    import http.server
    import threading

    files = {"/a.mp4": _clip(tmp_path / "a.mp4", 704, 1280, 1, "black"), "/b.mp4": _clip(tmp_path / "b.mp4", 704, 1280, 1, "white"), "/vo.wav": _tone(1.5)}

    class H(http.server.BaseHTTPRequestHandler):
        def do_GET(self):  # noqa: N802
            data = files.get(self.path)
            self.send_response(200 if data else 404)
            self.end_headers()
            if data:
                self.wfile.write(data)

        def log_message(self, *a):
            pass

    srv = http.server.HTTPServer(("127.0.0.1", 0), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{srv.server_port}"
    try:
        r = client.post("/v1/jobs", json={"model": "compose", "mode": "compose", "prompt": "",
                                          "params": {"width": 1080, "height": 1920, "captions": [{"start": 0.1, "end": 1.0, "text": "BEYOND LIMITS."}]},
                                          "videoUrls": [f"{base}/a.mp4", f"{base}/b.mp4"], "audioUrl": f"{base}/vo.wav"})
        assert r.status_code == 202, r.text
        j = wait(client, r.json()["id"], timeout=60)
        assert j["status"] == "completed", j
        assert j["quality"]["passed"], j["quality"]
        assert j["license"].startswith("FFmpeg")
        assert "Audio: aac" in _probe(client.get(f"/v1/jobs/{j['id']}/outputs/0").content, tmp_path)
        bad = client.post("/v1/jobs", json={"model": "compose", "mode": "compose", "videoUrls": [f"{base}/missing.mp4"]})
        assert bad.status_code == 400
    finally:
        srv.shutdown()
