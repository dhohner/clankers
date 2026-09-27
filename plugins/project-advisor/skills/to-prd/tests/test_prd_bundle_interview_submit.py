from __future__ import annotations

import copy
import json
import stat
import tempfile
import unittest
from collections.abc import Callable
from pathlib import Path
from typing import Any

import support  # noqa: F401  # puts the skill directory on sys.path

from scripts.interview.answers import SubmitError, validate_submit
from scripts.interview.rounds import Round, validate_round
from scripts.interview.session import write_json_atomic

ROUND: Round = validate_round(
    {
        "id": "ROUND-01",
        "questions": [
            {
                "node": "NODE-03",
                "label": "Storage",
                "question": "Where does the session keep answers?",
                "multi_select": False,
                "options": [
                    {"label": "Session directory", "description": "Files.", "recommended": True},
                    {"label": "Registry", "description": "One file."},
                ],
            },
            {
                "node": "NODE-04",
                "label": "Page parts",
                "question": "Which parts does the page show?",
                "multi_select": True,
                "options": [
                    {"label": "History", "description": "Earlier rounds.", "recommended": True},
                    {"label": "Status lamp", "description": "Round state."},
                ],
            },
        ],
    }
)


def valid_submit() -> dict[str, Any]:
    return {
        "round": "ROUND-01",
        "answers": [
            {"node": "NODE-03", "choice": "option", "selected": ["Registry"]},
            {"node": "NODE-04", "choice": "option", "selected": ["History"]},
        ],
    }


def with_answer(**answer: Any) -> Callable[[dict[str, Any]], None]:
    """Replace the NODE-03 answer."""

    def mutate(submit: dict[str, Any]) -> None:
        submit["answers"][0] = {"node": "NODE-03", **answer}

    return mutate


class SubmitValidationTests(unittest.TestCase):
    def test_valid_submit_gives_answers_in_question_order_with_empty_optional_fields(self) -> None:
        submit = valid_submit()
        submit["answers"].reverse()

        answers = validate_submit(ROUND, submit)

        self.assertEqual(
            answers,
            {
                "round": "ROUND-01",
                "comment": "",
                "answers": [
                    {
                        "node": "NODE-03",
                        "choice": "option",
                        "selected": ["Registry"],
                        "written": "",
                        "reason": "",
                        "note": "",
                    },
                    {
                        "node": "NODE-04",
                        "choice": "option",
                        "selected": ["History"],
                        "written": "",
                        "reason": "",
                        "note": "",
                    },
                ],
            },
        )

    def test_each_choice_keeps_its_text_note_and_comment(self) -> None:
        cases = {
            "written": {"choice": "written", "written": "A queue."},
            "decide later": {"choice": "decide_later", "reason": "Needs numbers."},
            "out of scope": {"choice": "out_of_scope", "reason": "Another task."},
        }
        for name, answer in cases.items():
            with self.subTest(name):
                submit = valid_submit()
                with_answer(**answer, note="A note.")(submit)
                submit["comment"] = "Thanks."

                result = validate_submit(ROUND, submit)

                stored = result["answers"][0]
                self.assertEqual(
                    (stored["choice"], stored["written"], stored["reason"], stored["note"]),
                    (
                        answer["choice"],
                        answer.get("written", ""),
                        answer.get("reason", ""),
                        "A note.",
                    ),
                )
                self.assertEqual(result["comment"], "Thanks.")

    def test_multi_select_accepts_several_options(self) -> None:
        submit = valid_submit()
        submit["answers"][1]["selected"] = ["History", "Status lamp"]

        answers = validate_submit(ROUND, submit)

        self.assertEqual(answers["answers"][1]["selected"], ["History", "Status lamp"])

    def test_each_invalid_submit_reports_fault_path(self) -> None:
        def not_a_list(submit: dict[str, Any]) -> None:
            submit["answers"] = {"NODE-03": "Registry"}

        def item_not_mapping(submit: dict[str, Any]) -> None:
            submit["answers"][1] = "History"

        def missing_question(submit: dict[str, Any]) -> None:
            del submit["answers"][1]

        def duplicate_question(submit: dict[str, Any]) -> None:
            submit["answers"].append(copy.deepcopy(submit["answers"][0]))

        def unknown_node(submit: dict[str, Any]) -> None:
            submit["answers"].append({"node": "NODE-09", "choice": "written", "written": "x"})

        def unknown_submit_field(submit: dict[str, Any]) -> None:
            submit["draft"] = True

        def comment_not_text(submit: dict[str, Any]) -> None:
            submit["comment"] = 3

        def two_options_on_multi_with_one_unknown(submit: dict[str, Any]) -> None:
            submit["answers"][1]["selected"] = ["History", "Search"]

        def empty_multi_select(submit: dict[str, Any]) -> None:
            submit["answers"][1]["selected"] = []

        cases: dict[str, tuple[Callable[[dict[str, Any]], None], str | list[str]]] = {
            "answers not a list": (not_a_list, "answers"),
            "answer not a mapping": (item_not_mapping, ["answers[1]", "answers"]),
            "question without answer": (missing_question, "answers"),
            "question answered twice": (duplicate_question, "answers[2].node"),
            "unknown NODE id": (unknown_node, "answers[2].node"),
            "unknown submit field": (unknown_submit_field, "draft"),
            "comment not text": (comment_not_text, "comment"),
            "missing choice": (with_answer(selected=["Registry"]), "answers[0].choice"),
            "unknown choice": (with_answer(choice="skip"), "answers[0].choice"),
            "option without selection": (with_answer(choice="option"), "answers[0].selected"),
            "unknown option label": (
                with_answer(choice="option", selected=["Cloud"]),
                "answers[0].selected[0]",
            ),
            "single select with two options": (
                with_answer(choice="option", selected=["Registry", "Session directory"]),
                "answers[0].selected",
            ),
            "single select with no option": (
                with_answer(choice="option", selected=[]),
                "answers[0].selected",
            ),
            "multi select with no option": (empty_multi_select, "answers[1].selected"),
            "multi select with unknown option": (
                two_options_on_multi_with_one_unknown,
                "answers[1].selected[1]",
            ),
            "option selected twice": (
                with_answer(choice="option", selected=["Registry", "Registry"]),
                "answers[0].selected[1]",
            ),
            "written without text": (with_answer(choice="written"), "answers[0].written"),
            "written with blank text": (
                with_answer(choice="written", written="  "),
                "answers[0].written",
            ),
            "decide later without reason": (
                with_answer(choice="decide_later"),
                "answers[0].reason",
            ),
            "decide later with blank reason": (
                with_answer(choice="decide_later", reason="\n"),
                "answers[0].reason",
            ),
            "out of scope without reason": (
                with_answer(choice="out_of_scope"),
                "answers[0].reason",
            ),
            "reason on an option choice": (
                with_answer(choice="option", selected=["Registry"], reason="Because."),
                "answers[0].reason",
            ),
            "selection on a written choice": (
                with_answer(choice="written", written="x", selected=["Registry"]),
                "answers[0].selected",
            ),
            "note not text": (
                with_answer(choice="option", selected=["Registry"], note=["a"]),
                "answers[0].note",
            ),
            "unknown answer field": (
                with_answer(choice="option", selected=["Registry"], draft=True),
                "answers[0].draft",
            ),
        }
        for name, (mutate, paths) in cases.items():
            with self.subTest(name):
                submit = valid_submit()
                mutate(submit)

                with self.assertRaises(SubmitError) as caught:
                    validate_submit(ROUND, submit)

                expected = paths if isinstance(paths, list) else [paths]
                self.assertEqual([fault["path"] for fault in caught.exception.faults], expected)

    def test_submit_with_several_faults_reports_every_fault(self) -> None:
        submit = valid_submit()
        submit["answers"] = [
            {"node": "NODE-03", "choice": "decide_later"},
            {"node": "NODE-04", "choice": "written", "written": ""},
        ]

        with self.assertRaises(SubmitError) as caught:
            validate_submit(ROUND, submit)

        self.assertEqual(
            [fault["path"] for fault in caught.exception.faults],
            ["answers[0].reason", "answers[1].written"],
        )


class AtomicWriteTests(unittest.TestCase):
    def setUp(self) -> None:
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.path = Path(temporary.name) / "answers" / "ROUND-01.json"

    def test_write_creates_private_file_with_complete_json(self) -> None:
        write_json_atomic(self.path, {"round": "ROUND-01"})

        self.assertEqual(json.loads(self.path.read_text()), {"round": "ROUND-01"})
        self.assertEqual(oct(stat.S_IMODE(self.path.stat().st_mode)), oct(0o600))

    def test_failed_write_keeps_previous_file_and_leaves_no_temporary_file(self) -> None:
        write_json_atomic(self.path, {"round": "ROUND-01"})

        with self.assertRaises(TypeError):
            write_json_atomic(self.path, {"round": "ROUND-01", "answers": [object()]})

        self.assertEqual(json.loads(self.path.read_text()), {"round": "ROUND-01"})
        self.assertEqual([entry.name for entry in self.path.parent.iterdir()], ["ROUND-01.json"])


if __name__ == "__main__":
    unittest.main()
