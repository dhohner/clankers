"""An idle interview server stops itself, restarts on its port, and keeps the registry."""

from __future__ import annotations

import http.client
import json
import os
import socket
import stat
import subprocess
import sys
import time
from pathlib import Path
from typing import Any
from unittest import mock

from support import REGISTRY_ENV, SKILL_DIR

from interview_support import (
    STEP_SECONDS,
    TIME_SCALE,
    TOKEN_HEADER,
    InterviewHarness,
    InterviewTestCase,
    PortSquatter,
    wait_for_exit,
)
from scripts.interview import client
from toon_reader import top_level_field

GRACE_ENV = "TO_PRD_INTERVIEW_GRACE_SECONDS"
IDLE_ENV = "TO_PRD_INTERVIEW_IDLE_SECONDS"
GRACE_SECONDS = 0.05 * TIME_SCALE
IDLE_SECONDS = 0.2 * TIME_SCALE

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
    ],
}

ROUND_ONE_SUBMIT = {
    "round": "ROUND-01",
    "answers": [{"node": "NODE-03", "choice": "option", "selected": ["Registry"]}],
}


class PageConnection:
    """A simulated interview page that holds its connection to the server open."""

    def __init__(self, port: int, token: str) -> None:
        self._connection = http.client.HTTPConnection("127.0.0.1", port, timeout=STEP_SECONDS)
        self._connection.request("GET", "/api/presence", headers={TOKEN_HEADER: token})
        self.response = self._connection.getresponse()

    def close(self) -> None:
        self.response.close()
        self._connection.close()


def is_running(pid: int) -> bool:
    return not wait_for_exit_within(pid, 0)


def wait_for_exit_within(pid: int, seconds: float) -> bool:
    deadline = time.monotonic() + seconds
    while True:
        try:
            if os.waitpid(pid, os.WNOHANG)[0] == pid:
                return True
        except ChildProcessError:
            try:
                os.kill(pid, 0)
            except ProcessLookupError:
                return True
        if time.monotonic() >= deadline:
            return False
        time.sleep(0.002)


class InterviewLifetimeTestCase(InterviewTestCase):
    time_limit_seconds = 2.0

    def setUp(self) -> None:
        super().setUp()
        self.registry = self.root / "registry" / "interview-sessions.json"
        environment = mock.patch.dict(
            os.environ,
            {
                REGISTRY_ENV: str(self.registry),
                GRACE_ENV: str(GRACE_SECONDS),
                IDLE_ENV: str(IDLE_SECONDS),
            },
        )
        environment.start()
        self.addCleanup(environment.stop)
        self.harness = InterviewHarness(self, self.root, self.session)
        self.round_file = self.write_round(ROUND_ONE)

    def stop_idle_server(self) -> tuple[int, str, list[str]]:
        """Let the server stop after an unanswered round, and return its port, token and
        the browser calls so far."""
        self.harness.ask(self.round_file)
        self.assertTrue(wait_for_exit(self.harness.server_pid()), "the idle server still runs")
        return self.harness.port(), self.harness.token(), self.harness.browser_calls()

    def registry_entries(self) -> list[dict[str, Any]]:
        return json.loads(self.registry.read_text(encoding="utf-8"))["sessions"]


class InterviewRegistryTests(InterviewLifetimeTestCase):
    def test_server_start_records_session_workspace_and_port(self) -> None:
        self.harness.start_ask(self.round_file).wait_started()

        self.assertEqual(
            self.registry_entries(),
            [
                {
                    "session": str(self.session),
                    "workspace": str(Path.cwd().resolve()),
                    "port": self.harness.port(),
                }
            ],
        )

    def test_registry_file_has_mode_0600_and_holds_no_token(self) -> None:
        self.harness.start_ask(self.round_file).wait_started()

        self.assertEqual(stat.S_IMODE(self.registry.stat().st_mode), 0o600)
        self.assertNotIn(self.harness.token(), self.registry.read_text(encoding="utf-8"))

    def test_end_after_server_crash_removes_the_session_from_the_registry(self) -> None:
        self.harness.start_ask(self.round_file).wait_started()
        self.harness.kill_server()

        result = self.harness.end()

        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertEqual(self.registry_entries(), [])

    def test_end_run_again_after_crash_keeps_registry_without_session(self) -> None:
        self.harness.start_ask(self.round_file).wait_started()
        self.harness.kill_server()
        self.harness.end()

        result = self.harness.end()

        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertEqual(self.registry_entries(), [])

    def test_end_removes_the_session_from_the_registry(self) -> None:
        self.harness.start_ask(self.round_file).wait_started()

        self.harness.end()

        self.assertEqual(self.registry_entries(), [])


class InterviewIdleStopTests(InterviewLifetimeTestCase):
    def test_idle_server_stops_and_keeps_the_stored_round(self) -> None:
        ask = self.harness.ask(self.round_file)
        self.assertEqual(top_level_field(ask.stdout, "status"), "browser_disconnected")

        stopped = wait_for_exit(self.harness.server_pid())

        self.assertTrue(stopped, "the idle server still runs")
        self.assertEqual(
            [path.name for path in self.harness.rounds_dir.iterdir()], ["ROUND-01.json"]
        )

    def test_idle_stop_removes_the_registry_entry(self) -> None:
        self.harness.ask(self.round_file)

        wait_for_exit(self.harness.server_pid())

        self.assertEqual(self.registry_entries(), [])

    def test_connected_page_with_open_round_keeps_server_running(self) -> None:
        self.harness.ask(self.round_file)
        page = PageConnection(self.harness.port(), self.harness.token())
        self.addCleanup(page.close)

        time.sleep(IDLE_SECONDS * 2)

        self.assertTrue(is_running(self.harness.server_pid()))

    def test_idle_period_starts_when_the_page_of_the_open_round_leaves(self) -> None:
        self.harness.ask(self.round_file)
        page = PageConnection(self.harness.port(), self.harness.token())
        time.sleep(IDLE_SECONDS * 2)
        pid = self.harness.server_pid()

        page.close()

        self.assertFalse(wait_for_exit_within(pid, IDLE_SECONDS / 2), "the server stopped early")
        self.assertTrue(wait_for_exit(pid), "the idle server still runs")

    def test_idle_period_starts_when_a_waiting_ask_returns(self) -> None:
        with mock.patch.dict(os.environ, {GRACE_ENV: str(IDLE_SECONDS * 2)}):
            ask = self.harness.ask(self.round_file)
        self.assertEqual(top_level_field(ask.stdout, "status"), "browser_disconnected")

        self.assertFalse(
            wait_for_exit_within(self.harness.server_pid(), IDLE_SECONDS / 2),
            "the server stopped early",
        )

    def test_connected_page_without_open_round_does_not_keep_server_running(self) -> None:
        ask = self.harness.start_ask(self.round_file)
        ask.wait_started()
        page = PageConnection(self.harness.port(), self.harness.token())
        self.addCleanup(page.close)
        self.harness.submit(ROUND_ONE_SUBMIT)
        ask.finish()

        self.assertTrue(wait_for_exit(self.harness.server_pid()))

    def test_request_restarts_the_idle_period(self) -> None:
        self.harness.ask(self.round_file)
        pid = self.harness.server_pid()
        for _ in range(4):
            time.sleep(IDLE_SECONDS / 2)
            self.harness.request("GET", "/api/round", token=self.harness.token())

        self.assertTrue(is_running(pid))

    def test_ask_with_idle_override_that_is_not_positive_fails_to_start_server(self) -> None:
        for value in ("0", "-1", "inf", "soon"):
            with self.subTest(value), mock.patch.dict(os.environ, {IDLE_ENV: value}):
                result = self.harness.ask(self.round_file)

                self.assertEqual(result.returncode, 1, result.stdout)
                self.assertEqual(top_level_field(result.stdout, "code"), "server_start_failed")


class InterviewRestartTests(InterviewLifetimeTestCase):
    def test_ask_after_idle_stop_restarts_on_same_port_with_same_token(self) -> None:
        port, token, _ = self.stop_idle_server()

        self.harness.start_ask(self.round_file).wait_started()

        self.assertEqual((self.harness.port(), self.harness.token()), (port, token))

    def test_ask_after_idle_stop_opens_no_browser(self) -> None:
        _, _, calls = self.stop_idle_server()

        self.harness.start_ask(self.round_file).wait_started()

        self.assertEqual(self.harness.browser_calls(), calls)

    def test_ask_with_previous_port_taken_starts_on_other_port_and_opens_browser(self) -> None:
        port, token, calls = self.stop_idle_server()
        holder = socket.socket()
        self.addCleanup(holder.close)
        # The stopped server's connections may leave the port in TIME_WAIT.
        holder.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        holder.bind(("127.0.0.1", port))
        holder.listen()

        # The ask's check of the previous server waits on the holder, which never answers.
        with mock.patch.object(client, "PING_SECONDS", 0.05):
            self.harness.start_ask(self.round_file).wait_started()

        new_port = self.harness.port()
        self.assertNotEqual(new_port, port)
        self.assertEqual(
            self.harness.browser_calls(), [*calls, f"http://127.0.0.1:{new_port}/#token={token}"]
        )


class InterviewTokenSecrecyTests(InterviewLifetimeTestCase):
    """No command sends the token to another process on the port of a stopped server."""

    def test_ask_after_idle_stop_sends_no_token_to_process_on_previous_port(self) -> None:
        port, token, _ = self.stop_idle_server()
        squatter = PortSquatter(self, port)

        self.harness.start_ask(self.round_file).wait_started()

        self.assertNotIn(token.encode(), squatter.received())

    def test_open_after_idle_stop_sends_no_token_to_process_on_previous_port(self) -> None:
        port, token, _ = self.stop_idle_server()
        squatter = PortSquatter(self, port)

        result = self.harness.run("open")

        self.assertEqual(top_level_field(result.stdout, "status"), "opened", result.stdout)
        self.assertNotIn(token.encode(), squatter.received())

    def test_end_after_idle_stop_sends_no_token_to_process_on_previous_port(self) -> None:
        port, token, _ = self.stop_idle_server()
        squatter = PortSquatter(self, port)

        result = self.harness.end()

        self.assertEqual(top_level_field(result.stdout, "status"), "ended", result.stdout)
        self.assertNotIn(token.encode(), squatter.received())


class RegistryConcurrencyTests(InterviewTestCase):
    def test_servers_that_start_together_keep_both_entries(self) -> None:
        registry = self.root / "interview-sessions.json"
        sessions = [self.root / f"session-{index}" for index in range(8)]
        script = (
            "import sys; from pathlib import Path; "
            "from scripts.interview.registry import register; "
            "register(Path(sys.argv[1]), Path(sys.argv[1]), 1)"
        )
        environment = {**os.environ, REGISTRY_ENV: str(registry)}

        processes = [
            subprocess.Popen(
                [sys.executable, "-c", script, str(session)], cwd=SKILL_DIR, env=environment
            )
            for session in sessions
        ]
        for process in processes:
            process.wait(STEP_SECONDS)

        stored = json.loads(registry.read_text(encoding="utf-8"))["sessions"]
        self.assertEqual(sorted(entry["session"] for entry in stored), sorted(map(str, sessions)))
