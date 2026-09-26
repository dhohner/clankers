"""Round file validation for interview rounds.

`interview ask --help` documents the round file format.
"""

from __future__ import annotations

import re
from typing import Any, TypedDict

ROUND_ID_PATTERN = re.compile(r"ROUND-[0-9]+")
NODE_ID_PATTERN = re.compile(r"NODE-[0-9]+")
ROUND_FIELDS = ("id", "questions")
QUESTION_FIELDS = ("node", "label", "question", "multi_select", "options")
OPTION_FIELDS = ("label", "description", "recommended")


class Option(TypedDict):
    label: str
    description: str
    recommended: bool


class Question(TypedDict):
    node: str
    label: str
    question: str
    multi_select: bool
    options: list[Option]


class Round(TypedDict):
    id: str
    questions: list[Question]


class Fault(TypedDict):
    path: str
    message: str
    fix: str


class RoundError(ValueError):
    def __init__(self, faults: list[Fault]) -> None:
        super().__init__(f"round has {len(faults)} fault(s)")
        self.faults = faults


def validate_round(raw: Any) -> Round:
    """Return the normalized round, or raise RoundError with every fault found."""
    faults: list[Fault] = []
    if not isinstance(raw, dict):
        _fault(
            faults,
            "round",
            "must be a mapping with id and questions",
            "Write the round as a mapping with the keys id and questions.",
        )
        raise RoundError(faults)
    _unknown_fields(raw, ROUND_FIELDS, "", faults)
    round_id = _round_id(raw.get("id"), faults)
    questions = _questions(raw.get("questions"), faults)
    if faults:
        raise RoundError(faults)
    return {"id": round_id, "questions": questions}


def _round_id(value: Any, faults: list[Fault]) -> str:
    if value is None:
        _fault(faults, "id", "round id is missing", "Add id with a round id such as ROUND-01.")
        return ""
    if not isinstance(value, str) or not ROUND_ID_PATTERN.fullmatch(value):
        _fault(
            faults,
            "id",
            f"round id {value!r} is not in the form ROUND-<digits>",
            "Set id to a round id such as ROUND-01.",
        )
        return ""
    return value


def _questions(value: Any, faults: list[Fault]) -> list[Question]:
    if not isinstance(value, list) or not value:
        _fault(
            faults,
            "questions",
            "must be a list with at least one question",
            "Add at least one question under questions.",
        )
        return []
    questions: list[Question] = []
    seen_nodes: set[str] = set()
    for index, item in enumerate(value):
        path = f"questions[{index}]"
        if not isinstance(item, dict):
            _fault(
                faults,
                path,
                "must be a mapping",
                "Write the question as a mapping with node, label, question, multi_select, options.",
            )
            continue
        _unknown_fields(item, QUESTION_FIELDS, f"{path}.", faults)
        node = _node_id(item.get("node"), f"{path}.node", seen_nodes, faults)
        label = _text(item.get("label"), f"{path}.label", "question label", faults)
        question = _text(item.get("question"), f"{path}.question", "question text", faults)
        multi_select = _multi_select(item.get("multi_select"), f"{path}.multi_select", faults)
        options = _options(item.get("options"), f"{path}.options", multi_select, faults)
        questions.append(
            {
                "node": node,
                "label": label,
                "question": question,
                "multi_select": bool(multi_select),
                "options": options,
            }
        )
    return questions


def _node_id(value: Any, path: str, seen: set[str], faults: list[Fault]) -> str:
    if value is None:
        _fault(
            faults,
            path,
            "NODE id is missing",
            "Add node with the design tree NODE id this question settles, such as NODE-03.",
        )
        return ""
    if not isinstance(value, str) or not NODE_ID_PATTERN.fullmatch(value):
        _fault(
            faults,
            path,
            f"NODE id {value!r} is not in the form NODE-<digits>",
            "Use the design tree NODE id, such as NODE-03.",
        )
        return ""
    if value in seen:
        _fault(
            faults,
            path,
            f"NODE id {value} appears in an earlier question",
            "Ask about each NODE id in one question only.",
        )
        return value
    seen.add(value)
    return value


def _text(value: Any, path: str, name: str, faults: list[Fault]) -> str:
    if not isinstance(value, str) or not value.strip():
        _fault(
            faults, path, f"{name} is missing or empty", f"Provide the {name} as non-empty text."
        )
        return ""
    return value


def _multi_select(value: Any, path: str, faults: list[Fault]) -> bool | None:
    if not isinstance(value, bool):
        _fault(
            faults,
            path,
            "multi-select flag is missing or not true or false",
            "Set multi_select to true or false.",
        )
        return None
    return value


def _options(value: Any, path: str, multi_select: bool | None, faults: list[Fault]) -> list[Option]:
    if not isinstance(value, list) or not value:
        _fault(
            faults,
            path,
            "must be a list with at least one option",
            "Add at least one option with a label and a description.",
        )
        return []
    options: list[Option] = []
    labels: set[str] = set()
    marks_valid = True
    for index, item in enumerate(value):
        option_path = f"{path}[{index}]"
        if not isinstance(item, dict):
            _fault(
                faults,
                option_path,
                "must be a mapping",
                "Write the option as a mapping with label, description and recommended.",
            )
            marks_valid = False
            continue
        _unknown_fields(item, OPTION_FIELDS, f"{option_path}.", faults)
        label = _text(item.get("label"), f"{option_path}.label", "option label", faults)
        if label and label in labels:
            _fault(
                faults,
                f"{option_path}.label",
                f"option label {label!r} appears in an earlier option",
                "Give each option of the question a distinct label.",
            )
        labels.add(label)
        description = _text(
            item.get("description"), f"{option_path}.description", "option description", faults
        )
        recommended = item.get("recommended", False)
        if not isinstance(recommended, bool):
            _fault(
                faults,
                f"{option_path}.recommended",
                "recommended mark is not true or false",
                "Set recommended to true or false, or leave it out for false.",
            )
            marks_valid = False
            recommended = False
        options.append({"label": label, "description": description, "recommended": recommended})
    if marks_valid and multi_select is not None:
        _recommendations(options, path, multi_select, faults)
    return options


def _recommendations(
    options: list[Option], path: str, multi_select: bool, faults: list[Fault]
) -> None:
    count = sum(option["recommended"] for option in options)
    if multi_select and count == 0:
        _fault(
            faults,
            path,
            "multi-select question marks no option as recommended",
            "Set recommended: true on at least one option.",
        )
    if not multi_select and count != 1:
        _fault(
            faults,
            path,
            f"single-select question marks {count} options as recommended",
            "Set recommended: true on exactly one option.",
        )


def _unknown_fields(
    value: dict[str, Any], allowed: tuple[str, ...], prefix: str, faults: list[Fault]
) -> None:
    for key in value:
        if key not in allowed:
            _fault(
                faults,
                f"{prefix}{key}",
                f"unknown field {key!r}",
                f"Remove it, or use one of: {', '.join(allowed)}.",
            )


def _fault(faults: list[Fault], path: str, message: str, fix: str) -> None:
    faults.append({"path": path, "message": message, "fix": fix})


__all__ = ["Option", "Question", "Round", "RoundError", "validate_round"]
