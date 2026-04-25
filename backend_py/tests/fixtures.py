from __future__ import annotations

from copy import deepcopy


BASE_MANIFEST = {
    "projectId": "test-project",
    "videoType": "trailer",
    "masterPrompt": "A lonely astronaut discovers a living ocean under the ice of Europa.",
    "createdAt": "2026-04-25T00:00:00.000Z",
    "beats": [
        {
            "beatId": "beat-1",
            "beatName": "Establishing",
            "template": "trailer.establishing",
            "status": "questioning",
            "archetype": {
                "intent": "Reveal the world and the protagonist's isolation.",
                "mood": "wide-establish",
                "suggestedDuration": 5,
                "directorNotes": "Use wide, lonely framing and a precise camera move.",
            },
            "scenes": [
                {
                    "sceneId": "scene-1",
                    "conversation": [],
                    "approved": False,
                }
            ],
        }
    ],
}


def request_with_turns(turns: list[dict], user_message: str | None = None) -> dict:
    manifest = deepcopy(BASE_MANIFEST)
    manifest["beats"][0]["scenes"][0]["conversation"] = turns
    req = {"manifest": manifest, "beatId": "beat-1"}
    if user_message is not None:
        req["userMessage"] = user_message
    return req
