from __future__ import annotations

import contextlib
import copy
import io
import json
import shlex
import subprocess
import sys
import tempfile
import textwrap
import threading
import unittest
from pathlib import Path
from typing import Any
from unittest import mock

from support import NO_BROWSER_ENV, SKILL_DIR, ThreadOutput, run_cli, thread_output

from interview_support import InterviewHarness, TimeLimitedTestCase
from scripts.cli import parse_args
from toon_reader import top_level_array, top_level_field, top_level_table

COMMANDS = ("ask", "open", "status", "end")

VALID_ROUND_YAML = """\
id: ROUND-01
questions:
  - node: NODE-03
    label: Storage
    question: "Where does the session keep answers?"
    multi_select: false
    options:
      - label: Session directory
        description: "Files next to the scratch prd.yaml."
        recommended: true
      - label: Registry
        description: One file for the user.
  - node: NODE-04
    label: Page parts
    question: Which parts does the page show?
    multi_select: true
    options:
      - label: History
        description: Earlier rounds, collapsed.
        recommended: true
      - label: Status lamp
        description: "Agent works, round open, and more."
        recommended: true
      - label: Keyboard shortcuts
        description: Faster answers.
"""


def valid_round() -> dict[str, Any]:
    return {
        "id": "ROUND-01",
        "questions": [
            {
                "node": "NODE-03",
                "label": "Storage",
                "question": "Where does the session keep answers?",
                "multi_select": False,
                "options": [
                    {
                        "label": "Session directory",
                        "description": "Files next to the scratch prd.yaml.",
                        "recommended": True,
                    },
                    {"label": "Registry", "description": "One file for the user."},
                ],
            },
            {
                "node": "NODE-04",
                "label": "Page parts",
                "question": "Which parts does the page show?",
                "multi_select": True,
                "options": [
                    {
                        "label": "History",
                        "description": "Earlier rounds, collapsed.",
                        "recommended": True,
                    },
                    {"label": "Status lamp", "description": "Round state.", "recommended": True},
                ],
            },
        ],
    }


class InterviewCliTestCase(TimeLimitedTestCase):
    def setUp(self) -> None:
        super().setUp()
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name).resolve()
        self.session = self.root / "session"
        self.session.mkdir()

    def write_round(self, content: str | dict[str, Any], name: str = "round.yaml") -> Path:
        path = self.root / name
        text = content if isinstance(content, str) else json.dumps(content)
        path.write_text(text, encoding="utf-8")
        return path

    def interview(
        self, command: str, session: Path, *extra: str
    ) -> subprocess.CompletedProcess[str]:
        if command == "ask" and not extra:
            extra = (str(self.write_round(VALID_ROUND_YAML, "valid-round.yaml")),)
        return run_cli("interview", command, str(session), *extra)

    def assert_toon_error(
        self,
        result: subprocess.CompletedProcess[str],
        code: str,
        exit_code: int = 1,
    ) -> list[dict[str, str]]:
        self.assertEqual(result.returncode, exit_code, result.stdout + result.stderr)
        self.assertEqual(result.stderr, "")
        self.assertEqual(top_level_field(result.stdout, "status"), "error")
        self.assertEqual(top_level_field(result.stdout, "code"), code)
        faults = top_level_table(result.stdout, "errors")
        self.assertTrue(faults, result.stdout)
        for fault in faults:
            self.assertTrue(fault["path"] and fault["message"] and fault["fix"], fault)
        self.assert_ends_with_next_commands(result.stdout)
        return faults

    def ended_session(self) -> Path:
        """Return a session that asked one round and ended, so ask returns without waiting."""
        session = self.root / "ended-session"
        session.mkdir()
        harness = InterviewHarness(self, self.root, session)
        harness.start_ask(self.write_round(VALID_ROUND_YAML, "ended-round.yaml")).wait_started()
        harness.end()
        return session

    def assert_ends_with_next_commands(self, output: str) -> None:
        self.assertTrue(output.rstrip("\n").splitlines()[-1].startswith("next["), output)
        commands = top_level_array(output, "next")
        self.assertTrue(commands, output)
        for command in commands:
            self.assertIn("scripts/__main__.py interview", command)


class InterviewRoundValidationTests(InterviewCliTestCase):
    def test_valid_round_passes_validation(self) -> None:
        harness = InterviewHarness(self, self.root, self.session)

        ask = harness.start_ask(self.write_round(VALID_ROUND_YAML))

        self.assertIn("ROUND-01", ask.wait_started())
        self.assertEqual(
            json.loads(harness.rounds_dir.joinpath("ROUND-01.json").read_text())["id"], "ROUND-01"
        )

    def test_each_invalid_round_reports_fault_path(self) -> None:
        def without_id(round_: dict[str, Any]) -> None:
            del round_["id"]

        def bad_id(round_: dict[str, Any]) -> None:
            round_["id"] = "first round"

        def no_questions(round_: dict[str, Any]) -> None:
            round_["questions"] = []

        def duplicate_node(round_: dict[str, Any]) -> None:
            round_["questions"][1]["node"] = "NODE-03"

        def bad_node_form(round_: dict[str, Any]) -> None:
            round_["questions"][0]["node"] = "node-3"

        def no_options(round_: dict[str, Any]) -> None:
            round_["questions"][0]["options"] = []

        def missing_options(round_: dict[str, Any]) -> None:
            del round_["questions"][0]["options"]

        def duplicate_option(round_: dict[str, Any]) -> None:
            round_["questions"][0]["options"][1]["label"] = "Session directory"

        def single_select_without_recommendation(round_: dict[str, Any]) -> None:
            round_["questions"][0]["options"][0]["recommended"] = False

        def single_select_with_two_recommendations(round_: dict[str, Any]) -> None:
            round_["questions"][0]["options"][1]["recommended"] = True

        def multi_select_without_recommendation(round_: dict[str, Any]) -> None:
            for option in round_["questions"][1]["options"]:
                option.pop("recommended")

        def missing_multi_select(round_: dict[str, Any]) -> None:
            del round_["questions"][0]["multi_select"]

        def text_multi_select(round_: dict[str, Any]) -> None:
            round_["questions"][0]["multi_select"] = "no"

        def missing_label(round_: dict[str, Any]) -> None:
            del round_["questions"][0]["label"]

        def blank_question(round_: dict[str, Any]) -> None:
            round_["questions"][0]["question"] = "  "

        def missing_description(round_: dict[str, Any]) -> None:
            del round_["questions"][0]["options"][1]["description"]

        def text_recommended(round_: dict[str, Any]) -> None:
            round_["questions"][0]["options"][0]["recommended"] = "yes"

        def round_id_with_trailing_newline(round_: dict[str, Any]) -> None:
            round_["id"] = "ROUND-01\n"

        def node_id_with_non_ascii_digit(round_: dict[str, Any]) -> None:
            round_["questions"][0]["node"] = "NODE-\u0663"

        def node_id_with_trailing_newline(round_: dict[str, Any]) -> None:
            round_["questions"][0]["node"] = "NODE-03\n"

        def unknown_field(round_: dict[str, Any]) -> None:
            round_["questions"][0]["multiselect"] = True

        cases = {
            "missing round id": (without_id, "id"),
            "bad round id form": (bad_id, "id"),
            "no questions": (no_questions, "questions"),
            "duplicate NODE id": (duplicate_node, "questions[1].node"),
            "bad NODE id form": (bad_node_form, "questions[0].node"),
            "question with empty options": (no_options, "questions[0].options"),
            "question without options": (missing_options, "questions[0].options"),
            "duplicate option label": (duplicate_option, "questions[0].options[1].label"),
            "single select with zero recommended": (
                single_select_without_recommendation,
                "questions[0].options",
            ),
            "single select with two recommended": (
                single_select_with_two_recommendations,
                "questions[0].options",
            ),
            "multi select without recommended": (
                multi_select_without_recommendation,
                "questions[1].options",
            ),
            "missing multi select flag": (missing_multi_select, "questions[0].multi_select"),
            "text multi select flag": (text_multi_select, "questions[0].multi_select"),
            "missing label": (missing_label, "questions[0].label"),
            "blank question": (blank_question, "questions[0].question"),
            "missing option description": (
                missing_description,
                "questions[0].options[1].description",
            ),
            "text recommended mark": (text_recommended, "questions[0].options[0].recommended"),
            "unknown field": (unknown_field, "questions[0].multiselect"),
            "round id with trailing newline": (round_id_with_trailing_newline, "id"),
            "NODE id with non-ASCII digit": (node_id_with_non_ascii_digit, "questions[0].node"),
            "NODE id with trailing newline": (node_id_with_trailing_newline, "questions[0].node"),
        }
        for name, (mutate, path) in cases.items():
            with self.subTest(name):
                round_ = copy.deepcopy(valid_round())
                mutate(round_)
                round_file = self.write_round(round_)

                result = self.interview("ask", self.session, str(round_file))

                faults = self.assert_toon_error(result, "round_invalid")
                self.assertEqual([fault["path"] for fault in faults], [path], result.stdout)
                self.assertIn(
                    f"interview ask {self.session} {round_file}",
                    top_level_array(result.stdout, "next")[0],
                )

    def test_round_that_is_not_a_mapping_is_invalid(self) -> None:
        result = self.interview("ask", self.session, str(self.write_round("- one\n- two\n")))

        faults = self.assert_toon_error(result, "round_invalid")
        self.assertEqual([fault["path"] for fault in faults], ["round"])

    def test_question_that_is_not_a_mapping_is_invalid(self) -> None:
        round_ = valid_round()
        round_["questions"].append("What else?")

        result = self.interview("ask", self.session, str(self.write_round(round_)))

        faults = self.assert_toon_error(result, "round_invalid")
        self.assertEqual([fault["path"] for fault in faults], ["questions[2]"])

    def test_round_with_several_faults_reports_every_fault(self) -> None:
        round_ = valid_round()
        del round_["id"]
        round_["questions"][0]["node"] = "NODE-x"
        round_["questions"][0]["options"][1]["label"] = "Session directory"
        round_["questions"][1]["options"] = []

        result = self.interview("ask", self.session, str(self.write_round(round_)))

        faults = self.assert_toon_error(result, "round_invalid")
        self.assertEqual(
            [fault["path"] for fault in faults],
            [
                "id",
                "questions[0].node",
                "questions[0].options[1].label",
                "questions[1].options",
            ],
        )
        self.assertEqual(top_level_field(result.stdout, "total_errors"), "4")

    def test_round_file_that_does_not_parse_is_an_error(self) -> None:
        result = self.interview("ask", self.session, str(self.write_round("id: [ROUND-01\n")))

        faults = self.assert_toon_error(result, "round_unparseable")
        self.assertEqual([fault["path"] for fault in faults], ["round"])

    def test_missing_round_file_is_an_error(self) -> None:
        result = self.interview("ask", self.session, str(self.root / "missing.yaml"))

        self.assert_toon_error(result, "round_not_found")

    def test_invalid_round_opens_no_round(self) -> None:
        round_ = valid_round()
        round_["questions"] = []

        result = self.interview("ask", self.session, str(self.write_round(round_)))

        self.assert_toon_error(result, "round_invalid")
        self.assertEqual(list(self.session.iterdir()), [])


class InterviewSessionDirectoryTests(InterviewCliTestCase):
    def test_session_directory_inside_action_items_is_rejected(self) -> None:
        session = self.root / "repo" / "action-items" / "scratch"
        session.mkdir(parents=True)
        for command in COMMANDS:
            with self.subTest(command):
                result = self.interview(command, session)

                faults = self.assert_toon_error(result, "session_in_action_items")
                self.assertEqual(faults[0]["path"], "session_dir")

    def test_session_directory_reached_through_symlink_into_action_items_is_rejected(self) -> None:
        target = self.root / "repo" / "action-items" / "scratch"
        target.mkdir(parents=True)
        link = self.root / "scratch-link"
        link.symlink_to(target, target_is_directory=True)
        for command in COMMANDS:
            with self.subTest(command):
                self.assert_toon_error(self.interview(command, link), "session_in_action_items")

    def test_session_directory_named_like_action_items_prefix_is_accepted(self) -> None:
        session = self.root / "action-items-notes"
        session.mkdir()

        self.assert_toon_error(self.interview("status", session), "not_available")

    def test_missing_session_directory_is_rejected(self) -> None:
        for command in COMMANDS:
            with self.subTest(command):
                result = self.interview(command, self.root / "missing")

                self.assert_toon_error(result, "session_not_found")

    def test_session_path_that_is_a_file_is_rejected(self) -> None:
        path = self.root / "session.txt"
        path.write_text("x", encoding="utf-8")

        self.assert_toon_error(self.interview("status", path), "session_not_directory")

    def test_session_check_runs_before_round_validation(self) -> None:
        round_file = self.write_round("not: [valid\n")

        result = self.interview("ask", self.root / "missing", str(round_file))

        self.assert_toon_error(result, "session_not_found")


class InterviewCommandSurfaceTests(InterviewCliTestCase):
    def test_commands_without_later_behavior_state_not_available(self) -> None:
        for command in ("open", "status"):
            with self.subTest(command):
                result = self.interview(command, self.session)

                self.assert_toon_error(result, "not_available")
                self.assertEqual(top_level_field(result.stdout, "command"), f"interview {command}")

    def test_unknown_flag_gives_usage_error_in_toon(self) -> None:
        for command in COMMANDS:
            with self.subTest(command):
                result = self.interview(
                    command, self.session, *(() if command != "ask" else ("r.yaml",)), "--bogus"
                )

                faults = self.assert_toon_error(result, "usage_error", exit_code=2)
                self.assertIn("--bogus", faults[0]["message"])
                self.assertIn(
                    f"interview {command} --help",
                    top_level_array(result.stdout, "next")[0],
                )

    def test_format_flag_is_a_usage_error_for_interview_commands(self) -> None:
        result = self.interview("status", self.session, "--format", "yaml")

        self.assert_toon_error(result, "usage_error", exit_code=2)

    def test_missing_arguments_give_usage_error_in_toon(self) -> None:
        cases = {
            "no subcommand": ("interview",),
            "unknown subcommand": ("interview", "bogus"),
            "no session": ("interview", "status"),
            "no round file": ("interview", "ask", "session"),
            "extra argument": ("interview", "end", "session", "extra"),
        }
        for name, args in cases.items():
            with self.subTest(name):
                self.assert_toon_error(run_cli(*args), "usage_error", exit_code=2)

    def test_help_names_toon_output(self) -> None:
        for args in [("interview", "--help"), *(("interview", c, "--help") for c in COMMANDS)]:
            with self.subTest(args):
                result = run_cli(*args)

                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(result.stderr, "")
                self.assertIn("TOON", result.stdout)
                self.assertIn("usage:", result.stdout)

    def test_ask_help_describes_round_file_fields(self) -> None:
        result = run_cli("interview", "ask", "--help")

        for field in ("id:", "node:", "multi_select:", "recommended:", "description:"):
            self.assertIn(field, result.stdout)

    def test_ask_help_round_example_passes_validation(self) -> None:
        help_text = run_cli("interview", "ask", "--help").stdout
        example = help_text.split("The round file is YAML or JSON:\n\n", 1)[1].split("\n\n", 1)[0]
        round_file = self.write_round(textwrap.dedent(example))
        harness = InterviewHarness(self, self.root, self.session)

        ask = harness.start_ask(round_file)

        self.assertIn("ROUND-01", ask.wait_started())

    def test_format_flag_before_interview_is_a_usage_error_in_toon(self) -> None:
        result = run_cli("--format", "yaml", "interview", "status", str(self.session))

        faults = self.assert_toon_error(result, "usage_error", exit_code=2)
        self.assertIn("--format", faults[0]["message"])

    def test_parse_args_rejects_interview_group(self) -> None:
        with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as caught:
            parse_args(["interview"])

        self.assertEqual(caught.exception.code, 2)

    def test_top_level_help_lists_interview_group(self) -> None:
        result = run_cli("--help")

        self.assertEqual(result.returncode, 0)
        self.assertIn("interview", result.stdout)


class InterviewCliProcessTests(InterviewCliTestCase):
    """Checks that need `python -m scripts interview` as its own process."""

    # Each test starts a server and runs every command as its own process.
    time_limit_seconds = 2.0

    def test_commands_do_not_read_terminal_input(self) -> None:
        session = self.ended_session()
        expected_exit = {"ask": 0, "open": 1, "status": 1, "end": 0}
        for command in COMMANDS:
            with self.subTest(command):
                args = [sys.executable, "-m", "scripts", "interview", command, str(session)]
                if command == "ask":
                    args.append(str(self.write_round(VALID_ROUND_YAML)))
                process = subprocess.Popen(
                    args,
                    cwd=SKILL_DIR,
                    env=NO_BROWSER_ENV,
                    stdin=subprocess.PIPE,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                )
                try:
                    exit_code = process.wait(timeout=20)
                finally:
                    if process.poll() is None:
                        process.kill()
                    for stream in (process.stdin, process.stdout, process.stderr):
                        if stream is not None:
                            stream.close()
                self.assertEqual(exit_code, expected_exit[command])

    def test_session_error_next_command_runs_once_session_is_filled_in(self) -> None:
        round_file = self.write_round(VALID_ROUND_YAML, "round with space.yaml")
        session = self.ended_session()
        for command in COMMANDS:
            with self.subTest(command):
                extra = (str(round_file),) if command == "ask" else ()
                failed = self.interview(command, self.root / "missing", *extra)
                retry = top_level_array(failed.stdout, "next")[0]
                argv = shlex.split(retry.replace("<session-dir>", shlex.quote(str(session))))

                result = subprocess.run(
                    argv,
                    check=False,
                    capture_output=True,
                    text=True,
                    cwd=SKILL_DIR,
                    env=NO_BROWSER_ENV,
                )

                if command in ("ask", "end"):
                    self.assertEqual(result.returncode, 0, result.stdout)
                    self.assertEqual(top_level_field(result.stdout, "status"), "ended")
                else:
                    self.assert_toon_error(result, "not_available")


class InProcessOutputTests(unittest.TestCase):
    def test_capture_leaves_output_of_other_capturing_thread_alone(self) -> None:
        captured, write, other_output = threading.Event(), threading.Event(), io.StringIO()

        def write_on_other_thread() -> None:
            buffer = sys.stdout.capture()
            captured.set()
            write.wait(1.0)
            print("other thread")
            other_output.write(buffer.getvalue())

        with mock.patch.object(sys, "stdout", ThreadOutput(sys.stdout)):
            other = threading.Thread(target=write_on_other_thread)
            other.start()
            captured.wait(1.0)
            with thread_output("stdout") as buffer:
                print("main thread")
                write.set()
                other.join(1.0)

        self.assertEqual(buffer.getvalue(), "main thread\n")
        self.assertEqual(other_output.getvalue(), "other thread\n")

    def test_capture_restores_stream_it_replaced(self) -> None:
        stream = io.StringIO()
        with mock.patch.object(sys, "stdout", stream):
            with thread_output("stdout") as buffer:
                print("captured")
            print("after")

        self.assertEqual(buffer.getvalue(), "captured\n")
        self.assertEqual(stream.getvalue(), "after\n")


if __name__ == "__main__":
    unittest.main()
