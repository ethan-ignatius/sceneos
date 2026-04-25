from __future__ import annotations

import json
from typing import Any, Literal, TypedDict

from anthropic import Anthropic
from langgraph.graph import END, START, StateGraph

from .config import env
from .sufficiency import (
    MAX_QUESTIONS,
    MIN_USER_TURNS,
    next_question,
    refined_prompt_from_history,
    score,
)


class AgentState(TypedDict, total=False):
    request: dict[str, Any]
    beat: dict[str, Any]
    turns: list[dict[str, Any]]
    report: dict[str, Any]
    decision: Literal["ask", "sufficient"]
    response: dict[str, Any]


def _active_beat(manifest: dict[str, Any], beat_id: str) -> dict[str, Any]:
    for beat in manifest.get("beats", []):
        if beat.get("beatId") == beat_id:
            return beat
    raise ValueError(f"beatId not found: {beat_id}")


def _active_turns(beat: dict[str, Any], user_message: str | None) -> list[dict[str, Any]]:
    scenes = beat.get("scenes") or []
    scene = scenes[0] if scenes else {"conversation": []}
    turns = list(scene.get("conversation") or [])
    if user_message and user_message.strip():
        if not turns or turns[-1].get("role") != "user" or turns[-1].get("content", "").strip() != user_message.strip():
            turns.append({"role": "user", "content": user_message.strip()})
    return turns


def load_context(state: AgentState) -> AgentState:
    req = state["request"]
    beat = _active_beat(req["manifest"], req["beatId"])
    return {
        "beat": beat,
        "turns": _active_turns(beat, req.get("userMessage")),
    }


def score_sufficiency(state: AgentState) -> AgentState:
    report = score(state["turns"])
    return {
        "report": {
            "userTurnCount": report.user_turn_count,
            "covered": list(report.covered),
            "missing": list(report.missing),
            "sufficient": report.sufficient,
        }
    }


def route_decision(state: AgentState) -> AgentState:
    report = state["report"]
    if report["sufficient"]:
        return {"decision": "sufficient"}
    if report["userTurnCount"] >= MAX_QUESTIONS:
        # Hard cap: generate a best-effort prompt rather than trapping the user.
        return {"decision": "sufficient"}
    return {"decision": "ask"}


def produce_response(state: AgentState) -> AgentState:
    req = state["request"]
    manifest = req["manifest"]
    beat = state["beat"]
    turns = state["turns"]
    report = state["report"]

    api_key = env("ANTHROPIC_API_KEY")
    if api_key:
        response = _anthropic_response(api_key, manifest, beat, turns, report)
    elif state["decision"] == "sufficient":
        response = {
            "kind": "sufficient",
            "refinedPrompt": refined_prompt_from_history(beat, manifest["masterPrompt"], turns),
            "sceneSummary": f"{beat.get('beatName', 'Beat')}: {beat.get('archetype', {}).get('intent', '')}"[:180],
            "suggestedDuration": 5,
        }
    else:
        response = {
            "kind": "question",
            "question": next_question(beat, manifest["masterPrompt"], _report_obj(report)),
            "reasoning": "A required visual facet is still missing before this node can render.",
            "estimatedRemaining": max(1, MIN_USER_TURNS - int(report["userTurnCount"])),
        }

    if response["kind"] == "sufficient" and not report["sufficient"] and int(report["userTurnCount"]) < MIN_USER_TURNS:
        response = {
            "kind": "question",
            "question": next_question(beat, manifest["masterPrompt"], _report_obj(report)),
            "reasoning": "Minimum user answers have not been collected for this node.",
            "estimatedRemaining": 1,
        }

    return {"response": response}


def _report_obj(report: dict[str, Any]):
    from .sufficiency import SufficiencyReport

    return SufficiencyReport(
        user_turn_count=int(report["userTurnCount"]),
        covered=tuple(report["covered"]),
        missing=tuple(report["missing"]),
    )


def _anthropic_response(api_key: str, manifest: dict[str, Any], beat: dict[str, Any], turns: list[dict], report: dict[str, Any]) -> dict[str, Any]:
    client = Anthropic(api_key=api_key)
    user_content = {
        "masterPrompt": manifest["masterPrompt"],
        "videoType": manifest["videoType"],
        "beat": beat,
        "conversation": turns,
        "sufficiency": report,
    }
    tool = {
        "name": "emit_agent_response",
        "description": "Return either the next directorial question or a sufficient prompt.",
        "input_schema": {
            "type": "object",
            "required": ["kind"],
            "properties": {
                "kind": {"type": "string", "enum": ["question", "sufficient"]},
                "question": {"type": "string"},
                "reasoning": {"type": "string"},
                "estimatedRemaining": {"type": "integer", "minimum": 0, "maximum": MAX_QUESTIONS},
                "refinedPrompt": {"type": "string"},
                "sceneSummary": {"type": "string"},
                "suggestedDuration": {"type": "integer", "minimum": 3, "maximum": 10},
            },
        },
    }
    msg = client.messages.create(
        model=env("ANTHROPIC_AGENT_MODEL", "claude-opus-4-7"),
        max_tokens=1400,
        tools=[tool],
        tool_choice={"type": "tool", "name": "emit_agent_response"},
        system=(
            "You are SceneOS's directorial questionnaire agent. "
            "Ask one concise visual question until subject/action/setting/framing/mood are covered. "
            "Only mark sufficient when sufficiency.sufficient is true, unless the hard cap is reached."
        ),
        messages=[{"role": "user", "content": json.dumps(user_content)}],
    )
    block = next((b for b in msg.content if b.type == "tool_use"), None)
    if block is None:
        raise RuntimeError("Anthropic returned no tool_use")
    data = dict(block.input)
    if data.get("kind") == "sufficient":
        return {
            "kind": "sufficient",
            "refinedPrompt": str(data.get("refinedPrompt") or refined_prompt_from_history(beat, manifest["masterPrompt"], turns)),
            "sceneSummary": str(data.get("sceneSummary") or beat.get("beatName", "Scene")),
            "suggestedDuration": int(data.get("suggestedDuration") or 5),
        }
    return {
        "kind": "question",
        "question": str(data.get("question") or next_question(beat, manifest["masterPrompt"], _report_obj(report))),
        "reasoning": str(data.get("reasoning") or "More visual detail is required."),
        "estimatedRemaining": int(data.get("estimatedRemaining") or 1),
    }


def build_agent_graph():
    builder = StateGraph(AgentState)
    builder.add_node("load_context", load_context)
    builder.add_node("score_sufficiency", score_sufficiency)
    builder.add_node("route_decision", route_decision)
    builder.add_node("produce_response", produce_response)
    builder.add_edge(START, "load_context")
    builder.add_edge("load_context", "score_sufficiency")
    builder.add_edge("score_sufficiency", "route_decision")
    builder.add_edge("route_decision", "produce_response")
    builder.add_edge("produce_response", END)
    return builder.compile()


AGENT_GRAPH = build_agent_graph()


def run_agent_turn(request: dict[str, Any]) -> dict[str, Any]:
    result = AGENT_GRAPH.invoke({"request": request})
    return result["response"]
