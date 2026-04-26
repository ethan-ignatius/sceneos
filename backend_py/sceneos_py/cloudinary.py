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


# Effects we trust to splice into a Cloudinary delivery URL. The editor agent
# is an LLM and can hallucinate effect names or inject characters that break
# the URL parser; this allowlist is the gate. Anything outside this set gets
# silently dropped at normalize time.
_ALLOWED_VIDEO_EFFECTS: set[str] = {
    "brightness", "contrast", "saturation", "vibrance", "hue", "gamma",
    "blue", "red", "green", "sepia", "blur", "sharpen", "noise",
    "vignette", "fade", "pixelate", "art", "grayscale", "negate",
}


def sanitize_color_grade(grade: str | None) -> str:
    """
    Validate a Cloudinary effect string before we paste it into a URL.

    Format: comma-separated `e_<name>:<int>` segments. Anything that doesn't
    match the shape — empty, unknown effect name, non-integer value, stray
    characters — is dropped from the output. Returns "" if nothing survives.

    Hard-blocks LLM hallucinations like `e_destroy_world:9999` or value
    injection like `e_brightness:5/fl_attachment:evil`.
    """
    if not grade or not isinstance(grade, str):
        return ""
    cleaned: list[str] = []
    for part in grade.split(","):
        part = part.strip()
        if not part.startswith("e_") or ":" not in part:
            continue
        name, _, value = part[2:].partition(":")
        name = name.strip().lower()
        value = value.strip()
        if name not in _ALLOWED_VIDEO_EFFECTS:
            continue
        try:
            int_value = int(float(value))
        except (TypeError, ValueError):
            continue
        # Cloudinary accepts wide ranges per effect; clamp to a sane band so
        # an out-of-range value never hard-fails. -100..100 covers every
        # effect we use.
        int_value = max(-100, min(100, int_value))
        cleaned.append(f"e_{name}:{int_value}")
    return ",".join(cleaned)


# Named look presets — picked by the editor agent as a single LUT-style choice
# applied across the whole cut. Mood color grades stay per-beat; this is the
# editor's global pass on top.
LOOK_PRESETS: dict[str, str] = {
    "neutral": "",
    "warm-archive": "e_brightness:-3,e_contrast:8,e_saturation:-8,e_sepia:20",
    "cool-modern": "e_brightness:-5,e_contrast:14,e_saturation:-18,e_blue:10",
    "high-contrast-mono": "e_brightness:-4,e_contrast:32,e_saturation:-100",
    "punchy-trailer": "e_brightness:0,e_contrast:24,e_saturation:14,e_vibrance:30",
    "soft-romance": "e_brightness:6,e_contrast:-4,e_saturation:6,e_blur:30",
}


def look_grade(look: str | None) -> str:
    return LOOK_PRESETS.get((look or "neutral").strip(), "")


def _escape_caption(text: str) -> str:
    """
    Encode caption text for the Cloudinary `l_text:` layer.

    Cloudinary's text-overlay parser is comma-and-slash-sensitive — those need
    to be URL-encoded inside the value itself, not just at the URL level.
    Newlines render as %0A.
    """
    return (
        text.replace("%", "%25")
        .replace(",", "%2C")
        .replace("/", "%2F")
        .replace("?", "%3F")
        .replace("#", "%23")
        .replace(" ", "%20")
        .replace("\n", "%0A")
    )


_NORMALIZE = "c_fill,w_1920,h_1080"


def _static_caption_overlay(text: str) -> str | None:
    """Build a Cloudinary l_text overlay for a per-clip caption.

    Used by the simple `build_splice_url` path (one caption per source clip,
    spans the whole clip's duration). For the timeline-anchored editor path
    see `_caption_overlay(text, start_at, duration, position)` further down.

    Visual: lower-third position, pure white text with a thin black stroke.
    Font: Arial bold at 52pt, ships on every Cloudinary cloud (no TTF upload).

    Caption legibility rules learned the hard way:
      - WHITE (`co_white`), not cream. Cream + a thick stroke produces a
        gray fringe on the letter edges that reads as muddy on dark frames.
      - Outline 2px (`e_outline:2:000000`), not 4px. A 4px stroke at 60pt
        bleeds adjacent letters into each other — looks like the text is
        overlapping itself. 2px is enough for a sea of sea-spray + storm.
      - Font 52pt, not 60pt. 60pt at 1080p is too dense for the lower-third
        and forces line-wrap on dialogue captions; 52pt fits tight cleanly.

    URL-syntax note (load-bearing): Cloudinary's text-overlay positioning
    (`g_<gravity>`, `x_`, `y_`) MUST live in the `fl_layer_apply` segment,
    not the `l_text:` opener. Putting `g_south,y_120` next to `l_text:`
    silently centers the caption on the canvas — the bug that made the
    first lighthouse bake unwatchable (text covering the keeper's chest
    and face for 6 seconds at a time). Splitting into two segments fixes it.
    """
    if not text or not text.strip():
        return None
    safe = text.strip().replace(",", " ").replace("/", " ").replace("\n", " ")
    safe = safe[:120]
    encoded = quote(safe, safe="")
    # Segment 1 — declare the text layer (font, color, stroke).
    # Segment 2 — apply the layer with positioning (gravity + offset).
    return (
        f"l_text:Arial_52_bold:{encoded},co_white,e_outline:2:000000"
        f"/fl_layer_apply,g_south,y_140"
    )


def _clip_segments(clip: dict, normalize: bool = True) -> list[str]:
    out: list[str] = []
    if normalize:
        out.append(_NORMALIZE)
    if clip.get("colorGrade"):
        out.append(clip["colorGrade"])
    caption_seg = _static_caption_overlay(clip.get("caption") or "")
    if caption_seg:
        out.append(caption_seg)
    return out


def build_splice_url(
    clips: list[dict],
    audio_public_id: str | None = None,
    normalize: bool = True,
    music_volume: int = -28,
) -> str | None:
    """
    Cloudinary fl_splice URL builder.

    Mirrors backend/src/services/cloudinary.ts. Each clip is normalized to a
    common 1920x1080 frame before splicing so mixed provider outputs stitch
    cleanly. Mood color grade applied when provided per clip. Captions baked
    in per-clip via l_text. Music ducked under the native clip audio so
    Veo 3's dialogue / SFX / ambient stay readable.

    Args:
      music_volume: dB attenuation for the music bed (negative = quieter).
        Default -28dB sits the music well underneath dialogue + SFX. Pass 0
        to leave music at full volume (legacy behavior).
    """
    if not clips:
        return None
    base, *overlays = clips
    segments: list[str] = []
    base_segs = _clip_segments(base, normalize)
    if base_segs:
        # Base clip transforms apply directly (no layer wrapping needed).
        # The caption helper emits its own /fl_layer_apply because l_text
        # IS its own layer over the base — that part is correct.
        segments.extend(base_segs)

    # Overlay clips for splicing. Cloudinary's canonical syntax:
    #   l_video:<id>,fl_splice / <transforms> / fl_layer_apply
    # The fl_splice flag MUST be in the same URL component as l_video:
    # (the layer opener), NOT in the fl_layer_apply component (the closer).
    # Putting fl_splice in the closer silently produces the base clip alone
    # (Cloudinary treats the overlay as a regular layer without splicing).
    for clip in overlays:
        layer = f"l_video:{_layer_id(clip['publicId'])},fl_splice"
        transforms = _clip_segments(clip, normalize)
        if transforms:
            segments.append(layer)
            segments.extend(transforms)
            segments.append("fl_layer_apply")
        else:
            segments.append(f"{layer}/fl_layer_apply")

    if audio_public_id:
        # e_volume ducks the music under the clip's native audio. Veo 3
        # already baked dialogue + ambient into each clip, so we want music
        # ~28dB below that, not on top of it.
        if music_volume:
            segments.append(
                f"l_audio:{_layer_id(audio_public_id)},e_volume:{music_volume}/fl_layer_apply"
            )
        else:
            segments.append(f"l_audio:{_layer_id(audio_public_id)}")

    prefix = f"{'/'.join(segments)}/" if segments else ""
    return f"https://res.cloudinary.com/{CLOUD}/video/upload/{prefix}{base['publicId']}.mp4"


def build_thumbnail_url(public_id: str) -> str:
    return f"https://res.cloudinary.com/{CLOUD}/video/upload/so_auto/{public_id}.jpg"


# ── Editor URL builder (Stage 7) ────────────────────────────────────────────
#
# Extends build_splice_url with the full editor vocabulary:
#   - per-beat trim (so / eo on the layer)
#   - per-beat color grade (mood) + global look LUT
#   - cross-fade transitions between beats (e_fade:NNN before fl_splice)
#   - audio overlay with volume + optional ducking of the original clip audio
#   - per-beat captions placed by absolute timeline offset (so / du)
#   - watermark image overlay (lower-right corner)
#
# Everything is URL-derived. No render server, no ffmpeg job — Cloudinary's
# CDN evaluates the transform on-demand and caches the MP4. Same model as
# build_splice_url; this is just a wider transform vocabulary.


def _trim_segment(in_s: float | None, out_s: float | None) -> str:
    parts: list[str] = []
    if in_s is not None and in_s > 0:
        parts.append(f"so_{round(float(in_s), 2)}")
    if out_s is not None and out_s > 0:
        parts.append(f"eo_{round(float(out_s), 2)}")
    return ",".join(parts)


def _caption_overlay(text: str, start_at: float, duration: float, position: str = "south") -> str:
    """
    A single caption overlay timed to a specific window in the spliced timeline.

    `g_<position>` controls anchor (south = bottom-center, north = top-center).
    `y_140` lifts off the absolute edge so the text sits in the lower-third
    safe zone (broadcast convention). Arial bold 48pt with a 2px black
    outline on pure white reads cleanly on every frame without smushing
    adjacent letters together (which is what 4px did at 56pt).

    URL-syntax note (load-bearing): Cloudinary's text-overlay positioning
    (`g_*`, `x_`, `y_`) MUST be in the `fl_layer_apply` segment alongside
    `so_/du_`, NOT in the `l_text:` opener. Inline positioning silently
    falls back to canvas-center, which is what broke the first bake.
    """
    safe = _escape_caption(text)
    return (
        f"l_text:Arial_48_bold:{safe},co_white,e_outline:2:000000"
        f"/fl_layer_apply,g_{position},y_140,"
        f"so_{round(start_at, 2)},du_{round(duration, 2)}"
    )


def _audio_overlay(public_id: str, volume: int | None, fade_in_ms: int | None, fade_out_ms: int | None) -> str:
    bits = [f"l_audio:{_layer_id(public_id)}"]
    effects: list[str] = []
    if volume is not None:
        # Cloudinary clamps. Negative values lower volume (dB-ish), positive raise.
        effects.append(f"e_volume:{int(volume)}")
    if fade_in_ms:
        effects.append(f"e_fade:{int(fade_in_ms)}")
    if fade_out_ms:
        effects.append(f"e_fade:-{int(fade_out_ms)}")
    if effects:
        bits.append(",".join(effects))
    return "/".join(bits)


def _watermark_overlay(public_id: str) -> str:
    return f"l_{_layer_id(public_id)},g_south_east,x_24,y_24"


def build_editor_url(decisions: dict, cloud_name: str | None = None) -> str | None:
    """
    Build the final Cloudinary delivery URL for an EditDecisions object.

    decisions = {
      "clips": [
        {
          "publicId": "...",
          "durationSeconds": 5.0,         # the source clip's duration
          "trimStart": 0.0,               # optional: in-point on source
          "trimEnd":   5.0,               # optional: out-point on source
          "colorGrade": "<mood string>",  # optional per-beat grade
          "transitionMs": 300,            # cross-fade INTO this clip (ignored on first)
          "caption": "Hook"               # optional: per-beat caption (timeline-anchored)
        },
        ...
      ],
      "audio":     { "publicId": "...", "volume": -20, "fadeInMs": 800, "fadeOutMs": 1200 } | None,
      "duckOriginalAudioDb": -12,         # optional: lower clip audio under music
      "watermarkPublicId": "..."          | None,
      "look":      "warm-archive" | "cool-modern" | "high-contrast-mono" | "punchy-trailer" | "soft-romance" | "neutral",
      "captionPosition": "south" | "north"
    }

    Layered, in order:
      1. base normalize + base trim/grade
      2. for each subsequent clip: trim → grade → e_fade:N (transition) → fl_splice
      3. global look LUT
      4. global audio overlay
      5. captions, each anchored at its absolute timeline offset
      6. watermark
    """
    clips = decisions.get("clips") or []
    if not clips:
        return None

    base, *overlays = clips
    segments: list[str] = [_NORMALIZE]

    # 1. Base trim + grade
    base_trim = _trim_segment(base.get("trimStart"), base.get("trimEnd"))
    if base_trim:
        segments.append(base_trim)
    if base.get("colorGrade"):
        segments.append(base["colorGrade"])
    duck = decisions.get("duckOriginalAudioDb")
    if duck is not None:
        segments.append(f"e_volume:{int(duck)}")

    # 2. Splice each overlay clip with its own trim + grade + cross-fade.
    cumulative_duration = float(base.get("durationSeconds") or 0)
    if base_trim:
        # Trimming changes the contributed duration on the timeline.
        contributed = (base.get("trimEnd") or base.get("durationSeconds") or 0) - (base.get("trimStart") or 0)
        cumulative_duration = max(contributed, 0)

    for clip in overlays:
        # CRITICAL Cloudinary URL-syntax rule: `fl_splice` MUST live in the
        # OPENER (l_video:<id>,fl_splice), NOT the closer (fl_layer_apply,
        # fl_splice). Putting it in the closer silently produces the base
        # clip alone — Cloudinary treats the overlay as a regular layer
        # without splicing it onto the timeline. Same rule as
        # `build_splice_url` above; see the comment there for context.
        layer = f"l_video:{_layer_id(clip['publicId'])},fl_splice"
        transforms: list[str] = [_NORMALIZE]
        trim = _trim_segment(clip.get("trimStart"), clip.get("trimEnd"))
        if trim:
            transforms.append(trim)
        if clip.get("colorGrade"):
            transforms.append(clip["colorGrade"])
        transition = clip.get("transitionMs")
        if transition:
            # e_fade:NNN gives a cross-fade INTO this spliced layer.
            transforms.append(f"e_fade:{int(transition)}")
        segments.append(layer)
        segments.append(",".join(transforms))
        segments.append("fl_layer_apply")

        contributed = (clip.get("trimEnd") or clip.get("durationSeconds") or 0) - (clip.get("trimStart") or 0)
        cumulative_duration += max(contributed, 0)

    # 3. Global look LUT
    look = look_grade(decisions.get("look"))
    if look:
        segments.append(look)

    # 4. Audio
    audio = decisions.get("audio")
    if audio and audio.get("publicId"):
        segments.append(
            _audio_overlay(
                audio["publicId"],
                audio.get("volume"),
                audio.get("fadeInMs"),
                audio.get("fadeOutMs"),
            )
        )

    # 5. Captions — placed at absolute timeline offsets.
    caption_position = decisions.get("captionPosition") or "south"
    timeline_cursor = 0.0
    if base.get("caption"):
        beat_dur = (base.get("trimEnd") or base.get("durationSeconds") or 0) - (base.get("trimStart") or 0)
        segments.append(_caption_overlay(base["caption"], 0.0, max(beat_dur, 0.5), caption_position))
        timeline_cursor = max(beat_dur, 0)
    else:
        timeline_cursor = (base.get("trimEnd") or base.get("durationSeconds") or 0) - (base.get("trimStart") or 0)

    for clip in overlays:
        beat_dur = (clip.get("trimEnd") or clip.get("durationSeconds") or 0) - (clip.get("trimStart") or 0)
        if clip.get("caption"):
            segments.append(
                _caption_overlay(
                    clip["caption"],
                    max(timeline_cursor, 0.0),
                    max(beat_dur, 0.5),
                    caption_position,
                )
            )
        timeline_cursor += max(beat_dur, 0)

    # 6. Watermark — last, so it survives the look LUT.
    if decisions.get("watermarkPublicId"):
        segments.append(_watermark_overlay(decisions["watermarkPublicId"]))

    prefix = f"{'/'.join(segments)}/" if segments else ""
    cloud = cloud_name or CLOUD
    return f"https://res.cloudinary.com/{cloud}/video/upload/{prefix}{base['publicId']}.mp4"


def edit_decisions_total_duration(decisions: dict) -> float:
    total = 0.0
    for clip in decisions.get("clips", []):
        in_s = float(clip.get("trimStart") or 0)
        out_s = float(clip.get("trimEnd") or clip.get("durationSeconds") or 0)
        total += max(out_s - in_s, 0.0)
    return round(total, 2)


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
    """Upload a video to Cloudinary by URL or data URI.

    The data-URI path is used by `vertex_veo._persist` to forward Veo's
    base64 response. A 1080p / 8s Veo 3.1 clip after base64 inflation can
    exceed 25 MB — that's a multi-second TLS upload, and 7 in parallel
    against a single Cloudinary endpoint will sometimes hit transient
    connection-reset / EOF errors. We:
      - Bump the timeout to 300s so a slow upload doesn't get cut.
      - Retry a small number of times on transport errors and 5xx, with
        backoff. 4xx (bad request, auth, public_id collision) is NOT
        retried — those are deterministic and won't get better.
    """
    cloud, api_key, api_secret = _cloudinary_creds()
    if not api_key or not api_secret or not cloud:
        raise RuntimeError("missing Cloudinary credentials (set CLOUDINARY_URL or the three explicit vars)")
    url = f"https://api.cloudinary.com/v1_1/{cloud}/video/upload"

    last_exc: Exception | None = None
    for attempt in range(3):
        try:
            async with httpx.AsyncClient(timeout=300) as client:
                res = await client.post(
                    url,
                    data={"file": remote_url, "public_id": public_id, "overwrite": "true"},
                    auth=(api_key, api_secret),
                )
            if res.status_code >= 500:
                last_exc = RuntimeError(
                    f"Cloudinary {res.status_code} (attempt {attempt + 1}/3): {res.text[:300]}"
                )
                await _httpx_backoff(attempt)
                continue
            res.raise_for_status()
            body = res.json()
            return {
                "publicId": body["public_id"],
                "url": body.get("secure_url"),
                "durationSeconds": body.get("duration", 0),
            }
        except (httpx.TransportError, httpx.TimeoutException) as exc:
            # Catches the full transient family: RemoteProtocolError, ReadError,
            # WriteError, ConnectError, PoolTimeout, ReadTimeout, WriteTimeout,
            # ConnectTimeout. We've actually observed WriteTimeout in the
            # 7-clip parallel rebake — that's what surfaces as `persist
            # error: WriteTimeout('')` in the Veo job log.
            last_exc = exc
            await _httpx_backoff(attempt)
            continue
    raise RuntimeError(
        f"Cloudinary video upload exhausted retries (public_id={public_id}): {last_exc!r}"
    )


async def _httpx_backoff(attempt: int) -> None:
    """Exponential backoff with a small jitter — 1.5s, 3s, 6s."""
    import asyncio as _asyncio
    import random as _random
    delay = 1.5 * (2 ** attempt) + _random.uniform(0, 0.5)
    await _asyncio.sleep(delay)


async def upload_audio_from_bytes(content: bytes, public_id: str, mime: str = "audio/mpeg") -> dict:
    """Upload raw audio bytes (e.g. ElevenLabs TTS output) to Cloudinary.

    Cloudinary stores audio files via the video upload endpoint with
    resource_type=video — its video pipeline handles audio-only files
    and exposes them at /video/upload/<public_id>.<ext>, which is what
    `l_audio:<public_id>` needs to overlay onto the splice URL.
    """
    import base64 as _base64

    cloud, api_key, api_secret = _cloudinary_creds()
    if not api_key or not api_secret or not cloud:
        raise RuntimeError("missing Cloudinary credentials (set CLOUDINARY_URL or the three explicit vars)")
    url = f"https://api.cloudinary.com/v1_1/{cloud}/video/upload"
    data_uri = f"data:{mime};base64,{_base64.b64encode(content).decode('ascii')}"
    async with httpx.AsyncClient(timeout=120) as client:
        res = await client.post(
            url,
            data={
                "file": data_uri,
                "public_id": public_id,
                "resource_type": "video",  # audio routes through the video pipeline
                "overwrite": "true",
            },
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
