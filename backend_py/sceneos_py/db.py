"""
MongoDB Atlas integration. Async via motor.

Graceful no-op: when MONGODB_URI is unset the module exposes the same
collection handles but they are None. Every call site must guard with
`if col is not None:` — this keeps the app fully functional without
Mongo (same as before this module existed).
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, UTC
from typing import Any

from .config import env

logger = logging.getLogger(__name__)

_client = None
_db = None

projects_col = None
generations_col = None
characters_frames_col = None

_MONGODB_URI = env("MONGODB_URI")

if _MONGODB_URI:
    try:
        from motor.motor_asyncio import AsyncIOMotorClient

        _client = AsyncIOMotorClient(_MONGODB_URI)
        _db = _client.get_default_database(default="sceneos")
        projects_col = _db["projects"]
        generations_col = _db["generations"]
        characters_frames_col = _db["characters_and_frames"]
        logger.info("[db] MongoDB connected (database=%s)", _db.name)
    except Exception as exc:
        logger.warning("[db] MongoDB init failed — running without persistence: %s", exc)
        projects_col = None
        generations_col = None
        characters_frames_col = None
else:
    logger.info("[db] MONGODB_URI not set — running without persistence")


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


# ── Projects ────────────────────────────────────────────────────────────────


async def upsert_project(
    project_id: str,
    *,
    manifest: dict,
    status: str = "active",
    editor: dict | None = None,
) -> None:
    if projects_col is None:
        return
    try:
        now = _now_iso()
        doc: dict[str, Any] = {
            "$set": {
                "master_prompt": manifest.get("masterPrompt", ""),
                "video_type": manifest.get("videoType", ""),
                "mode": manifest.get("mode"),
                "status": status,
                "updated_at": now,
                "manifest": manifest,
                "editor": editor,
                "thumbnail_url": manifest.get("thumbnailUrl"),
            },
            "$setOnInsert": {
                "_id": project_id,
                "created_at": now,
            },
        }
        if status == "archived":
            doc["$set"]["archived_at"] = now
        await projects_col.update_one({"_id": project_id}, doc, upsert=True)
    except Exception:
        logger.exception("[db] upsert_project failed project=%s", project_id)


async def list_projects(limit: int = 50) -> list[dict]:
    if projects_col is None:
        return []
    try:
        cursor = projects_col.find().sort("updated_at", -1).limit(limit)
        return await cursor.to_list(length=limit)
    except Exception:
        logger.exception("[db] list_projects failed")
        return []


async def get_project(project_id: str) -> dict | None:
    if projects_col is None:
        return None
    try:
        return await projects_col.find_one({"_id": project_id})
    except Exception:
        logger.exception("[db] get_project failed project=%s", project_id)
        return None


async def delete_project(project_id: str) -> bool:
    if projects_col is None:
        return False
    try:
        result = await projects_col.delete_one({"_id": project_id})
        return result.deleted_count > 0
    except Exception:
        logger.exception("[db] delete_project failed project=%s", project_id)
        return False


# ── Generations ─────────────────────────────────────────────────────────────


async def upsert_generation(job_id: str, data: dict) -> None:
    if generations_col is None:
        return
    try:
        now = _now_iso()
        await generations_col.update_one(
            {"_id": job_id},
            {
                "$set": {**data, "updated_at": now},
                "$setOnInsert": {"_id": job_id, "created_at": now},
            },
            upsert=True,
        )
    except Exception:
        logger.exception("[db] upsert_generation failed job=%s", job_id)


# ── Characters & Frames ────────────────────────────────────────────────────


async def insert_character_or_frame(data: dict) -> None:
    if characters_frames_col is None:
        return
    try:
        data.setdefault("created_at", _now_iso())
        await characters_frames_col.insert_one(data)
    except Exception:
        logger.exception("[db] insert_character_or_frame failed")


# ── Fire-and-forget helper ──────────────────────────────────────────────────


def fire_and_forget(coro):
    """Schedule an async coroutine without awaiting. Logs exceptions.

    Safe to call from sync code running inside an async event loop (e.g.
    FastAPI route handlers). If no loop is running, silently drops the
    coroutine so the app never crashes because of Mongo persistence.
    """
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        # No event loop — close the coroutine to avoid ResourceWarning.
        coro.close()
        return None
    task = loop.create_task(coro)
    task.add_done_callback(
        lambda t: logger.error("[db] fire_and_forget error: %s", t.exception())
        if not t.cancelled() and t.exception()
        else None
    )
    return task
