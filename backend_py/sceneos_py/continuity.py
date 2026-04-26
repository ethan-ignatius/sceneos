"""Cross-beat visual and narrative continuity for generation.

`beatFacts` on each `markSufficient` call are LLM-extracted. Models sometimes
"re-interpret" the protagonist or world (e.g. astronaut in a desert → man in
a plaid shirt in a forest) even when the system prompt says not to. The
orchestrator and the agent normalizer call `merge_beat_facts_for_continuity`
so the **same** subject, character, and location strings established on the
earliest prior beat drive every downstream clip, while action / mood /
framing can still evolve within that locked world.
"""
from __future__ import annotations

from typing import Any


# Keys that define "who and where" for image/video — must not drift between beats.
# `setting` is the one-line place; it must not contradict the locked location.
_ANCHOR_KEYS = ("subject", "setting", "characterDescription", "locationDescription")


def memory_scene(beat: dict[str, Any]) -> dict[str, Any] | None:
    """Pick the scene that best represents a completed beat for cross-beat
    memory + continuity locking.

    Some clients append scenes across retries / regenerates / approvals,
    so the canonical data for a finished beat does NOT always live at
    scenes[0]. Prefer the newest scene that has beatFacts; then newest
    with summary/refinedPrompt; then newest. Used by both the agent's
    cross-beat memory block and the orchestrator's anchor lock so they
    never disagree on what beat 1 said.
    """
    scenes = beat.get("scenes") or []
    if not scenes:
        return None
    for scene in reversed(scenes):
        if scene.get("beatFacts"):
            return scene
    for scene in reversed(scenes):
        if scene.get("sceneSummary") or scene.get("refinedPrompt"):
            return scene
    return scenes[-1]


def established_visual_anchors(manifest: dict[str, Any], current_beat_id: str) -> dict[str, str]:
    """
    For each anchor key, take the value from the *earliest* prior beat (in
    story order) that has a non-empty string. That way beat 1's astronaut +
    desert lock beats 2–7 unless we later add an explicit "new location" flow.

    Scene selection per beat goes through `memory_scene`, the same picker the
    agent's memory block uses, so the agent and the orchestrator can never
    disagree on which scene of a prior beat is canonical.
    """
    beats = manifest.get("beats") or []
    idx = next((i for i, b in enumerate(beats) if b.get("beatId") == current_beat_id), -1)
    if idx <= 0:
        return {}

    filled: dict[str, str] = {k: "" for k in _ANCHOR_KEYS}
    for b in beats[:idx]:
        scene = memory_scene(b)
        if not scene:
            continue
        facts = scene.get("beatFacts") or {}
        for key in _ANCHOR_KEYS:
            if filled[key]:
                continue
            raw = facts.get(key)
            if not isinstance(raw, str):
                continue
            v = raw.strip()
            if v:
                filled[key] = v
        if all(filled[k] for k in _ANCHOR_KEYS):
            break
    return {k: v for k, v in filled.items() if v}


def merge_beat_facts_for_continuity(
    manifest: dict[str, Any],
    beat_id: str,
    beat_facts: dict[str, Any],
) -> dict[str, Any]:
    """
    Return a copy of `beat_facts` with subject + character + location
    descriptions overwritten by established anchors when any exist. Action,
    setting (beat-local environment detail), mood, framing, voiceLine, etc.
    are left as emitted for this beat.
    """
    anchors = established_visual_anchors(manifest, beat_id)
    if not anchors:
        return dict(beat_facts)
    out = dict(beat_facts)
    out.update(anchors)
    return out
