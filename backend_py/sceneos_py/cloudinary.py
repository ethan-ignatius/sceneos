from __future__ import annotations

import hashlib
import time
from urllib.parse import quote

import httpx

from .config import env


def _parse_cloudinary_url(url: str) -> tuple[str, str, str]:
    """Parse cloudinary://<api_key>:<api_secret>@<cloud_name> → (cloud, key, secret)."""
    if not url or not url.startswith("cloudinary://"):
        return "", "", ""
    try:
        rest = url[len("cloudinary://"):]
        creds, _, tail = rest.partition("@")
        api_key, _, api_secret = creds.partition(":")
        cloud = (tail or "").strip("/").split("/", 1)[0]
        return cloud, api_key, api_secret
    except Exception:
        return "", "", ""


def _cloudinary_creds() -> tuple[str, str, str]:
    """
    Resolve (cloud_name, api_key, api_secret) — preferring explicit env vars and
    falling back to CLOUDINARY_URL combined form. Either configuration works.
    """
    cloud = env("CLOUDINARY_CLOUD_NAME") or ""
    api_key = env("CLOUDINARY_API_KEY") or ""
    api_secret = env("CLOUDINARY_API_SECRET") or ""
    if not (cloud and api_key and api_secret):
        url_cloud, url_key, url_secret = _parse_cloudinary_url(env("CLOUDINARY_URL") or "")
        cloud = cloud or url_cloud
        api_key = api_key or url_key
        api_secret = api_secret or url_secret
    return cloud, api_key, api_secret


CLOUD = _cloudinary_creds()[0] or "demo"


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


_NORMALIZE = "c_fill,w_1920,h_1080"


def _clip_segments(clip: dict, normalize: bool = True) -> list[str]:
    out: list[str] = []
    if normalize:
        out.append(_NORMALIZE)
    if clip.get("colorGrade"):
        out.append(clip["colorGrade"])
    return out


def build_splice_url(
    clips: list[dict],
    audio_public_id: str | None = None,
    normalize: bool = True,
) -> str | None:
    """
    Cloudinary fl_splice URL builder.

    Mirrors backend/src/services/cloudinary.ts. Each clip is normalized to a
    common 1920x1080 frame before splicing so mixed provider outputs stitch
    cleanly. Mood color grade applied when provided per clip.
    """
    if not clips:
        return None
    base, *overlays = clips
    segments: list[str] = []
    segments.extend(_clip_segments(base, normalize))

    for clip in overlays:
        layer = f"l_video:{_layer_id(clip['publicId'])}"
        transforms = _clip_segments(clip, normalize)
        if transforms:
            segments.append(layer)
            segments.extend(transforms)
            segments.append("fl_layer_apply,fl_splice")
        else:
            segments.append(f"{layer},fl_splice")

    if audio_public_id:
        segments.append(f"l_audio:{_layer_id(audio_public_id)}")

    prefix = f"{'/'.join(segments)}/" if segments else ""
    return f"https://res.cloudinary.com/{CLOUD}/video/upload/{prefix}{base['publicId']}.mp4"


def build_thumbnail_url(public_id: str) -> str:
    return f"https://res.cloudinary.com/{CLOUD}/video/upload/so_auto/{public_id}.jpg"


def last_frame_url(public_id: str, cloud: str | None = None) -> str:
    """
    Extract the near-final frame of a video as a JPG.

    Cloudinary's `so_99p` seeks to 99% through the clip — close enough to the
    last frame for any duration, and reliable across keyframe layouts. This is
    the seed image that flows into the next beat's I2V generation when
    chainFromPrevious is true.
    """
    return f"https://res.cloudinary.com/{cloud or CLOUD}/video/upload/so_99p/{public_id}.jpg"


def sign_upload(folder: str = "sceneos/user-media") -> dict:
    cloud, api_key, api_secret = _cloudinary_creds()
    if not api_key or not api_secret or not cloud:
        raise RuntimeError("missing CLOUDINARY_CLOUD_NAME/CLOUDINARY_API_KEY/CLOUDINARY_API_SECRET (or CLOUDINARY_URL)")
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
    cloud, api_key, api_secret = _cloudinary_creds()
    if not api_key or not api_secret or not cloud:
        raise RuntimeError("missing Cloudinary credentials (set CLOUDINARY_URL or the three explicit vars)")
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


async def upload_image_from_bytes(content: bytes, public_id: str, mime: str = "image/png") -> dict:
    """Upload raw image bytes (e.g. from Imagen) to Cloudinary as a data URI."""
    import base64 as _base64

    cloud, api_key, api_secret = _cloudinary_creds()
    if not api_key or not api_secret or not cloud:
        raise RuntimeError("missing Cloudinary credentials (set CLOUDINARY_URL or the three explicit vars)")
    url = f"https://api.cloudinary.com/v1_1/{cloud}/image/upload"
    data_uri = f"data:{mime};base64,{_base64.b64encode(content).decode('ascii')}"
    async with httpx.AsyncClient(timeout=60) as client:
        res = await client.post(
            url,
            data={"file": data_uri, "public_id": public_id, "overwrite": "true"},
            auth=(api_key, api_secret),
        )
        res.raise_for_status()
    body = res.json()
    return {
        "publicId": body["public_id"],
        "url": body.get("secure_url"),
        "width": body.get("width"),
        "height": body.get("height"),
    }


def public_id_for_reference(project_id: str | None, beat_id: str | None, kind: str) -> str:
    return f"sceneos/{_sanitize(project_id or 'project')}/refs/{_sanitize(beat_id or 'beat')}/{_sanitize(kind)}"


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
