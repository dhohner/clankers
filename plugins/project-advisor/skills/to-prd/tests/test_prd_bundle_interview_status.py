"""`interview status` reports one session, and `status` lists the live sessions."""

from __future__ import annotations

import contextlib
import json
import os
from pathlib import Path
from typing import Any
from unittest import mock

from support import REGISTRY_ENV, SKILL_DIR, load_yaml, run_cli

from interview_support import InterviewHarness, InterviewTestCase, PortSquatter
from scripts.interview.registry import register
from toon_reader import top_level_field

ROUND_ONE = {
    "id": "ROUND-01",
    "questions": [
        {
            "node": "NODE-03",
            "label": "Storage",
            "question": "Where does the session keep answers?",
            "multi_select": False,
            "options": [
                {"label": "Session directory", "description": "Local.", "recommended": True},
                {"label": "Registry", "description": "One file for the user."},
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
        {
            "node": "NODE-06",
            "label": "Export",
            "question": "Does the page export the answers?",
            "multi_select": False,
            "options": [
                {"label": "No export", "description": "Answers stay local.", "recommended": True},
                {"label": "Markdown", "description": "A copyable summary."},
            ],
        },
    ],
}

ROUND_ONE_SUBMIT = {
    "round": "ROUND-01",
    "answers": [
        {"node": "NODE-03", "choice": "decide_later", "reason": "Needs the storage review."},
        {"node": "NODE-04", "choice": "option", "selected": ["History"]},
        {"node": "NODE-06", "choice": "out_of_scope", "reason": "Export is a later PRD."},
    ],
}

ROUND_TWO = {
    "id": "ROUND-02",
    "questions": [
        {
            "node": "NODE-05",
            "label": "Lifetime",
            "question": "When does the server stop?",
            "multi_select": False,
            "options": [
                {"label": "When idle", "description": "After a quiet period.", "recommended": True},
                {"label": "Never", "description": "It runs until the end."},
            ],
        },
    ],
}


def status_fields(output: str) -> dict[str, Any]:
    names = (
        "status",
        "state",
        "server_running",
        "rounds_asked",
        "rounds_answered",
        "questions_deferred",
    )
    return {name: top_level_field(output, name) for name in names}


class InterviewStatusTests(InterviewTestCase):
    time_limit_seconds = 2.0

    def setUp(self) -> None:
        super().setUp()
        environment = mock.patch.dict(
            os.environ, {REGISTRY_ENV: str(self.root / "interview-sessions.json")}
        )
        environment.start()
        self.addCleanup(environment.stop)
        self.harness = InterviewHarness(self, self.root, self.session)

    def answer_round_one(self) -> None:
        ask = self.harness.start_ask(self.write_round(ROUND_ONE, "round-one.json"))
        ask.wait_started()
        self.harness.submit(ROUND_ONE_SUBMIT)
        ask.finish()

    def test_directory_without_session_is_no_session_with_zero_counts(self) -> None:
        result = self.harness.run("status")

        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertEqual(
            status_fields(result.stdout),
            {
                "status": "ok",
                "state": "no_session",
                "server_running": "false",
                "rounds_asked": "0",
                "rounds_answered": "0",
                "questions_deferred": "0",
            },
        )

    def test_status_of_directory_without_session_creates_no_session_files(self) -> None:
        self.harness.run("status")

        self.assertEqual(list(self.session.iterdir()), [])

    def test_answered_round_with_deferred_question_and_open_round_are_counted(self) -> None:
        self.answer_round_one()
        self.harness.start_ask(self.write_round(ROUND_TWO, "round-two.json")).wait_started()

        result = self.harness.run("status")

        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertEqual(
            status_fields(result.stdout),
            {
                "status": "ok",
                "state": "round_open",
                "server_running": "true",
                "rounds_asked": "2",
                "rounds_answered": "1",
                "questions_deferred": "1",
            },
        )

    def test_session_whose_rounds_all_have_answers_is_round_answered(self) -> None:
        self.answer_round_one()

        result = self.harness.run("status")

        self.assertEqual(top_level_field(result.stdout, "state"), "round_answered")

    def test_ended_session_is_ended_without_running_server(self) -> None:
        self.answer_round_one()
        self.harness.end()

        result = self.harness.run("status")

        self.assertEqual(result.returncode, 0, result.stdout)
        fields = status_fields(result.stdout)
        self.assertEqual(
            (fields["state"], fields["server_running"], fields["rounds_asked"]),
            ("ended", "false", "1"),
        )

    def test_session_whose_server_stopped_reports_server_not_running(self) -> None:
        self.harness.start_ask(self.write_round(ROUND_ONE, "round-one.json")).wait_started()
        self.harness.kill_server()

        result = self.harness.run("status")

        fields = status_fields(result.stdout)
        self.assertEqual((fields["state"], fields["server_running"]), ("round_open", "false"))


class WorkspaceStatusTests(InterviewTestCase):
    time_limit_seconds = 2.0

    def setUp(self) -> None:
        super().setUp()
        self.registry = self.root / "interview-sessions.json"
        environment = mock.patch.dict(os.environ, {REGISTRY_ENV: str(self.registry)})
        environment.start()
        self.addCleanup(environment.stop)
        self.harness = InterviewHarness(self, self.root, self.session)

    def start_session(self, workspace: Path) -> None:
        """Start a server for the session from the workspace, with ROUND_ONE open."""
        with contextlib.chdir(workspace):
            self.harness.start_ask(self.write_round(ROUND_ONE)).wait_started()

    def workspace_status(self) -> dict[str, Any]:
        """Run `status` from the skill directory, the workspace of `run_cli`."""
        result = run_cli("status")
        self.assertEqual(result.returncode, 0, result.stderr)
        return load_yaml(result.stdout)

    def registered_sessions(self) -> list[str]:
        stored = json.loads(self.registry.read_text(encoding="utf-8"))["sessions"]
        return [entry["session"] for entry in stored]

    def test_status_lists_live_session_of_its_workspace_with_state(self) -> None:
        self.start_session(SKILL_DIR)

        payload = self.workspace_status()

        self.assertEqual(
            payload["interview_sessions"], [{"session": str(self.session), "state": "round_open"}]
        )

    def test_status_omits_live_session_of_other_workspace(self) -> None:
        self.start_session(self.root)

        payload = self.workspace_status()

        self.assertEqual(payload["interview_sessions"], [])

    def test_status_keeps_registry_entry_of_live_session_of_other_workspace(self) -> None:
        self.start_session(self.root)

        self.workspace_status()

        self.assertEqual(self.registered_sessions(), [str(self.session)])

    def test_status_drops_entry_of_crashed_server_from_registry(self) -> None:
        self.start_session(SKILL_DIR)
        self.harness.kill_server()

        payload = self.workspace_status()

        self.assertEqual(payload["interview_sessions"], [])
        self.assertEqual(self.registered_sessions(), [])

    def test_status_drops_entry_whose_server_does_not_answer(self) -> None:
        other = self.root / "other-session"
        other.mkdir()
        register(other, SKILL_DIR, 1)

        self.workspace_status()

        self.assertEqual(self.registered_sessions(), [])

    def test_status_drops_entry_that_names_another_port_than_the_session_server(self) -> None:
        self.start_session(SKILL_DIR)
        register(self.session, SKILL_DIR, self.harness.port() + 1)

        payload = self.workspace_status()

        self.assertEqual(payload["interview_sessions"], [])
        self.assertEqual(self.registered_sessions(), [])

    def test_status_sends_no_token_to_other_process_on_port_of_stopped_server(self) -> None:
        self.start_session(SKILL_DIR)
        port, token = self.harness.port(), self.harness.token()
        self.harness.kill_server()
        squatter = PortSquatter(self, port)

        self.workspace_status()

        self.assertNotIn(token.encode(), squatter.received())

    def test_status_without_registry_lists_no_session_and_creates_no_registry(self) -> None:
        payload = self.workspace_status()

        self.assertEqual(payload["interview_sessions"], [])
        self.assertFalse(self.registry.exists())
