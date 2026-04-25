from __future__ import annotations

import hashlib
import time
from urllib.parse import quote

import httpx

from .config import env


CLOUD = env("CLOUDINARY_CLOUD_NAME", "demo") or "demo"


def _layer_id(public_id: str) -> str:
    return public_id.replace("/", ":")


def _sanitize(segment: str) -> str:
    cleaned = "".join(c if c.isalnum() or c in "-_" else "-" for c in segment.strip())
    while "--" in cleaned:
        cleaned = cleaned.replace("--", "-")
    return cleaned.strip("-")[:80] or "unnamed"


def public_id_for_scene(project_id: str | None, beat_id: str | None, scene_id: str | None, fallback: str) -> str:
    return f"sceneos/{_sanitize(project_id or 'project')}/{_sanitize(beat_id or 'beat')}/{_sanitize(scene_id or fallback)}"


def color_grade_for(mood: str) -> str:
    return {
        "wide-establish": "e_brightness:-15,e_contrast:10,e_saturation:-12",
        "intimate-hook": "e_brightness:-5,e_contrast:8,e_saturation:0",
        "kinetic-rising": "e_brightness:0,e_contrast:22,e_saturation:8",
        "tense-climax": "e_brightness:-22,e_contrast:30,e_saturation:-15",
        "still-resolve": "e_brightness:-8,e_contrast:5,e_saturation:-5",
        "punchy-sting": "e_brightness:5,e_contrast:25,e_saturation:12",
    }.get(mood, "")


def build_splice_url(clips: list[dict], audio_public_id: str | None = None) -> str | None:
    if not clips:
        return None
    base, *overlays = clips
    segments: list[str] = []
    if base.get("colorGrade"):
        segments.append(base["colorGrade"])
    for clip in overlays:
        layer = f"l_video:{_layer_id(clip['publicId'])}"
        if clip.get("colorGrade"):
            segments.extend([layer, clip["colorGrade"], "fl_layer_apply,fl_splice"])
        else:
            segments.append(f"{layer},fl_splice")
    if audio_public_id:
        segments.append(f"l_audio:{_layer_id(audio_public_id)}")
    prefix = f"{'/'.join(segments)}/" if segments else ""
    return f"https://res.cloudinary.com/{CLOUD}/video/upload/{prefix}{base['publicId']}.mp4"


def build_thumbnail_url(public_id: str) -> str:
    return f"https://res.cloudinary.com/{CLOUD}/video/upload/so_auto/{public_id}.jpg"


def sign_upload(folder: str = "sceneos/user-media") -> dict:
    api_key = env("CLOUDINARY_API_KEY")
    api_secret = env("CLOUDINARY_API_SECRET")
    cloud = env("CLOUDINARY_CLOUD_NAME")
    if not api_key or not api_secret or not cloud:
        raise RuntimeError("missing CLOUDINARY_CLOUD_NAME/CLOUDINARY_API_KEY/CLOUDINARY_API_SECRET")
    timestamp = int(time.time())
    payload = f"folder={folder}&timestamp={timestamp}{api_secret}"
    signature = hashlib.sha1(payload.encode()).hexdigest()
    return {
        "timestamp": timestamp,
        "signature": signature,
        "apiKey": api_key,
        "cloudName": cloud,
        "folder": folder,
    }


async def upload_video_from_url(remote_url: str, public_id: str) -> dict:
    api_key = env("CLOUDINARY_API_KEY")
    api_secret = env("CLOUDINARY_API_SECRET")
    cloud = env("CLOUDINARY_CLOUD_NAME")
    if not api_key or not api_secret or not cloud:
        raise RuntimeError("missing Cloudinary credentials")
    url = f"https://api.cloudinary.com/v1_1/{cloud}/video/upload"
    async with httpx.AsyncClient(timeout=120) as client:
        res = await client.post(
            url,
            data={"file": remote_url, "public_id": public_id, "overwrite": "true"},
            auth=(api_key, api_secret),
        )
        res.raise_for_status()
    body = res.json()
    return {
        "publicId": body["public_id"],
        "url": body.get("secure_url"),
        "durationSeconds": body.get("duration", 0),
    }


def cutos_payload(manifest: dict) -> dict:
    beats = []
    for beat in manifest.get("beats", []):
        for scene in beat.get("scenes", []):
            if scene.get("approved") and scene.get("clipUrl"):
                beats.append(
                    {
                        "beat_id": beat["beatId"],
                        "prompt": scene.get("refinedPrompt", ""),
                        "duration": scene.get("durationSeconds", 5),
                        "clip_url": scene["clipUrl"],
                        "clip_storage_path": scene.get("clipPublicId"),
                    }
                )
    return {
        "projectName": f"SceneOS · {manifest.get('masterPrompt', '')[:40]}",
        "resolution": "1920x1080",
        "frameRate": 24,
        "beats": beats,
    }
