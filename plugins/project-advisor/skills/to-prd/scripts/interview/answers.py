"""Submit validation for one interview round.

A submit is JSON:

    {"round": "ROUND-01", "comment": "optional",
     "answers": [{"node": "NODE-03", "choice": "option", "selected": ["Label"], "note": "optional"},
                 {"node": "NODE-04", "choice": "written", "written": "text"},
                 {"node": "NODE-05", "choice": "decide_later", "reason": "text"},
                 {"node": "NODE-06", "choice": "out_of_scope", "reason": "text"}]}

The server checks the round id before it calls `validate_submit`.
"""

from __future__ import annotations

from typing import Any

from .rounds import Fault, Question, Round
from .session import QuestionAnswer, RoundAnswers

SUBMIT_FIELDS = ("round", "answers", "comment")
# The field each choice requires, besides node, choice and the optional note.
CHOICE_FIELDS = {
    "option": "selected",
    "written": "written",
    "decide_later": "reason",
    "out_of_scope": "reason",
}
ANSWER_FIELDS = ("node", "choice", "selected", "written", "reason", "note")


class SubmitError(ValueError):
    def __init__(self, faults: list[Fault]) -> None:
        super().__init__(f"submit has {len(faults)} fault(s)")
        self.faults = faults


def validate_submit(round_: Round, body: dict[str, Any]) -> RoundAnswers:
    """Return the answers in question order, or raise SubmitError with every fault found."""
    faults: list[Fault] = []
    for key in body:
        if key not in SUBMIT_FIELDS:
            _fault(faults, key, f"unknown field {key!r}", f"Use only: {', '.join(SUBMIT_FIELDS)}.")
    comment = _optional_text(body.get("comment"), "comment", faults)
    answers = _answers(round_, body.get("answers"), faults)
    if faults:
        raise SubmitError(faults)
    return {"round": round_["id"], "answers": answers, "comment": comment}


def _answers(round_: Round, value: Any, faults: list[Fault]) -> list[QuestionAnswer]:
    if not isinstance(value, list):
        _fault(faults, "answers", "must be a list", "Send one answer for each question.")
        return []
    questions = {question["node"]: question for question in round_["questions"]}
    by_node: dict[str, QuestionAnswer] = {}
    answered: set[str] = set()
    for index, item in enumerate(value):
        path = f"answers[{index}]"
        if not isinstance(item, dict):
            _fault(faults, path, "must be a mapping", "Send the answer as a mapping.")
            continue
        node = item.get("node")
        if not isinstance(node, str) or node not in questions:
            _fault(
                faults,
                f"{path}.node",
                f"NODE id {node!r} is not a question of the round",
                "Answer only the questions of the round.",
            )
            continue
        if node in answered:
            _fault(
                faults,
                f"{path}.node",
                f"{node} has an earlier answer",
                "Send exactly one answer for each question.",
            )
            continue
        answered.add(node)
        answer = _answer(questions[node], item, path, faults)
        if answer is not None:
            by_node[node] = answer
    missing = [node for node in questions if node not in answered]
    if missing:
        _fault(
            faults,
            "answers",
            f"no answer for {', '.join(missing)}",
            "Send exactly one answer for each question.",
        )
    return [by_node[node] for node in questions if node in by_node]


def _answer(
    question: Question, item: dict[str, Any], path: str, faults: list[Fault]
) -> QuestionAnswer | None:
    count = len(faults)
    for key in item:
        if key not in ANSWER_FIELDS:
            _fault(
                faults,
                f"{path}.{key}",
                f"unknown field {key!r}",
                f"Use only: {', '.join(ANSWER_FIELDS)}.",
            )
    choice = item.get("choice")
    if not isinstance(choice, str) or choice not in CHOICE_FIELDS:
        _fault(
            faults,
            f"{path}.choice",
            f"choice {choice!r} is not one of {', '.join(CHOICE_FIELDS)}",
            "Set choice to option, written, decide_later or out_of_scope.",
        )
        return None
    required = CHOICE_FIELDS[choice]
    for key in ("selected", "written", "reason"):
        if key != required and key in item:
            _fault(
                faults,
                f"{path}.{key}",
                f"{key} does not apply to the choice {choice}",
                f"Remove {key}, or send it with a choice that uses it.",
            )
    selected, written, reason = [], "", ""
    if choice == "option":
        selected = _selected(question, item.get("selected"), path, faults)
    elif choice == "written":
        written = _required_text(item.get("written"), f"{path}.written", "written answer", faults)
    else:
        reason = _required_text(item.get("reason"), f"{path}.reason", "reason", faults)
    note = _optional_text(item.get("note"), f"{path}.note", faults)
    if len(faults) > count:
        return None
    return {
        "node": question["node"],
        "choice": choice,
        "selected": selected,
        "written": written,
        "reason": reason,
        "note": note,
    }


def _selected(question: Question, value: Any, path: str, faults: list[Fault]) -> list[str]:
    path = f"{path}.selected"
    if not isinstance(value, list):
        _fault(faults, path, "must be a list of option labels", "Select at least one option.")
        return []
    labels = {option["label"] for option in question["options"]}
    selected: list[str] = []
    for index, label in enumerate(value):
        if not isinstance(label, str) or label not in labels:
            _fault(
                faults,
                f"{path}[{index}]",
                f"{label!r} is not an option of {question['node']}",
                "Select only the option labels of the question.",
            )
        elif label in selected:
            _fault(
                faults,
                f"{path}[{index}]",
                f"{label!r} is selected twice",
                "Select each option once.",
            )
        else:
            selected.append(label)
    if len(value) != len(selected):
        return selected
    if question["multi_select"] and not selected:
        _fault(faults, path, "selects no option", "Select at least one option.")
    if not question["multi_select"] and len(selected) != 1:
        _fault(
            faults,
            path,
            f"selects {len(selected)} options on a single-select question",
            "Select exactly one option.",
        )
    return selected


def _required_text(value: Any, path: str, name: str, faults: list[Fault]) -> str:
    if not isinstance(value, str) or not value.strip():
        _fault(faults, path, f"{name} is missing or empty", f"Provide the {name} as text.")
        return ""
    return value


def _optional_text(value: Any, path: str, faults: list[Fault]) -> str:
    if value is None:
        return ""
    if not isinstance(value, str):
        _fault(faults, path, "must be text", "Send text, or leave the field out.")
        return ""
    return value


def _fault(faults: list[Fault], path: str, message: str, fix: str) -> None:
    faults.append({"path": path, "message": message, "fix": fix})


__all__ = ["SubmitError", "validate_submit"]
