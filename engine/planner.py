"""Rules-based ad planner. Turns a short brief into shots, a voiceover script and timed captions.

No language model is involved: the output is a structured starting point the user edits. A local
LLM (for example a Qwen or Llama instruct model on the same GPU) can replace `plan()` later; the
return shape stays the same so the website doesn't change.
"""
from __future__ import annotations

import re
from typing import Any

PLATFORMS: dict[str, dict[str, Any]] = {
    "tiktok": {"size": (1080, 1920), "video": (704, 1280), "image": (1152, 2048), "label": "TikTok / Reels / Shorts"},
    "reels": {"size": (1080, 1920), "video": (704, 1280), "image": (1152, 2048), "label": "Instagram Reels"},
    "youtube": {"size": (1920, 1080), "video": (1280, 704), "image": (2048, 1152), "label": "YouTube"},
    "feed": {"size": (1080, 1350), "video": (704, 1280), "image": (1024, 1536), "label": "Instagram / Facebook feed"},
    "square": {"size": (1080, 1080), "video": (1280, 704), "image": (1024, 1024), "label": "Square"},
}

TONES = {
    "bold": "high-contrast lighting, deep blacks, punchy saturated accents, confident framing",
    "premium": "soft directional light, clean studio background, shallow depth of field, refined",
    "playful": "bright colourful set, natural daylight, energetic handheld feel",
    "street": "urban night street, wet asphalt reflections, neon and sodium light, gritty texture",
}

WORDS_PER_SECOND = 2.5  # comfortable ad voiceover pace


def _clean(s: Any, n: int) -> str:
    return re.sub(r"\s+", " ", str(s or "")).strip()[:n]


def plan(brief: dict[str, Any]) -> dict[str, Any]:
    product = _clean(brief.get("product"), 120) or "the product"
    benefit = _clean(brief.get("benefit"), 160)
    audience = _clean(brief.get("audience"), 120)
    cta = _clean(brief.get("cta"), 60) or "Shop now"
    tone_key = brief.get("tone") if brief.get("tone") in TONES else "bold"
    platform_key = brief.get("platform") if brief.get("platform") in PLATFORMS else "tiktok"
    seconds = int(brief.get("seconds") or 15)
    seconds = max(5, min(30, seconds))
    plat = PLATFORMS[platform_key]
    look = TONES[tone_key]

    n_shots = max(1, round(seconds / 5))
    beats = [
        ("Hook", f"Dramatic close-up reveal of {product}, slow push-in, {look}"),
        ("Detail", f"Macro detail shots of {product}: texture, materials and craft, slow orbit, {look}"),
        ("In use", f"A person {('from ' + audience + ' ') if audience else ''}using {product} naturally, medium shot, {look}"),
        ("Hero", f"Hero shot of {product} centred with empty space at the top for a headline, static camera, {look}"),
        ("Lifestyle", f"Lifestyle scene featuring {product}, wide shot, {look}"),
        ("End card", f"{product} on a clean background, gentle light sweep, {look}"),
    ]
    hero = beats[3]
    others = [b for b in beats if b is not hero]
    picks = others[: n_shots - 1] + [hero] if n_shots > 1 else [beats[0]]
    shots = [
        {
            "n": i + 1,
            "beat": name,
            "seconds": 5,
            "imagePrompt": f"{prompt}. Photorealistic advertising photograph, no text, no logos.",
            "motionPrompt": f"{prompt}. Smooth cinematic camera motion, 24 fps.",
        }
        for i, (name, prompt) in enumerate(picks)
    ]

    lines = [
        f"Meet {product}.",
        benefit + "." if benefit and not benefit.endswith(".") else benefit,
        f"Made for {audience}." if audience else "",
        f"{cta}.",
    ]
    lines = [l for l in lines if l]
    script = " ".join(lines)
    budget = int(seconds * WORDS_PER_SECOND)
    words = script.split()
    if len(words) > budget:
        script = " ".join(words[:budget]).rstrip(",.") + "."

    captions, t = [], 0.3
    for line in lines:
        dur = max(1.2, len(line.split()) / WORDS_PER_SECOND)
        if t >= seconds:
            break
        captions.append({"start": round(t, 2), "end": round(min(seconds, t + dur), 2), "text": line})
        t += dur + 0.2

    return {
        "platform": platform_key,
        "platformLabel": plat["label"],
        "output": {"width": plat["size"][0], "height": plat["size"][1]},
        "videoSize": {"width": plat["video"][0], "height": plat["video"][1]},
        "imageSize": {"width": plat["image"][0], "height": plat["image"][1]},
        "seconds": len(shots) * 5,
        "shots": shots,
        "voiceover": {"script": script, "words": len(script.split()), "voiceId": "af_heart" if tone_key != "street" else "am_fenrir"},
        "captions": captions,
        "plannedBy": "rules (no AI model)",
    }
