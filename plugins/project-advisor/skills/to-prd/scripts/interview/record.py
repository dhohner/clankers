"""Answer fields of the `answered` payload, with the design tree record for each answer.

The record fields follow `schema design_tree open_questions`: a settled node needs `answer`,
`source` and `rationale`, a pruned node needs `reason`, and a deferred node names an
`open_questions` id in `relates_to`.
"""

from __future__ import annotations

from typing import Any

from .rounds import Question, Round
from .session import QuestionAnswer, RoundAnswers

INSTRUCTIONS = (
    "Write each answer record to the design_tree node with the same NODE id. "
    "For a deferred node, add the open_question text as a new open_questions entry with a "
    "new id, and list that id in the node relates_to."
)
MULTI_SELECT_SEPARATOR = "; "


def answered_fields(round_: Round, answers: RoundAnswers) -> dict[str, Any]:
    questions = {question["node"]: question for question in round_["questions"]}
    return {
        "instructions": INSTRUCTIONS,
        "comment": answers["comment"],
        "answers": [_answer(questions[answer["node"]], answer) for answer in answers["answers"]],
    }


def _answer(question: Question, answer: QuestionAnswer) -> dict[str, Any]:
    return {
        "node": answer["node"],
        "label": question["label"],
        "choice": answer["choice"],
        "selected": answer["selected"],
        "written": answer["written"],
        "reason": answer["reason"],
        "note": answer["note"],
        "record": _record(question, answer),
    }


def _record(question: Question, answer: QuestionAnswer) -> dict[str, str]:
    match answer["choice"]:
        case "option":
            return _settled(
                MULTI_SELECT_SEPARATOR.join(answer["selected"]),
                _rationale(_option_descriptions(question, answer["selected"]), answer["note"]),
            )
        case "written":
            return _settled(answer["written"], _rationale("the written answer", answer["note"]))
        case "decide_later":
            return {
                "status": "deferred",
                "open_question": (
                    f"{_sentence(question['question'])} Blocker: {_sentence(answer['reason'])} "
                    "Owner: the user."
                ),
                "relates_to": "the id of the new open_questions entry",
            }
        case "out_of_scope":
            return {"status": "pruned", "reason": answer["reason"]}


def _settled(text: str, rationale: str) -> dict[str, str]:
    return {"status": "settled", "source": "user", "answer": text, "rationale": rationale}


def _option_descriptions(question: Question, selected: list[str]) -> str:
    descriptions = {option["label"]: option["description"] for option in question["options"]}
    texts = " ".join(_sentence(descriptions[label]) for label in selected)
    noun = "description" if len(selected) == 1 else "descriptions"
    return f"the option {noun}: {texts}"


def _rationale(source: str, note: str) -> str:
    return _sentence(f"Write it from the note and {source}" if note else f"Write it from {source}")


def _sentence(text: str) -> str:
    text = text.strip()
    return text if text.endswith((".", "?", "!")) else f"{text}."


__all__ = ["answered_fields"]
