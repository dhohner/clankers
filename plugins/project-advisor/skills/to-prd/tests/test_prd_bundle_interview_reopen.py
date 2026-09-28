"""`interview ask` returns when no page is connected, and `interview open` opens it again."""

from __future__ import annotations

import http.client
import os
import time
from typing import Any
from unittest import mock

from support import SKILL_DIR  # noqa: F401  # puts the skill directory on sys.path

from interview_support import (
    STEP_SECONDS,
    TIME_SCALE,
    TOKEN_HEADER,
    InterviewHarness,
    InterviewTestCase,
    ServerFixture,
)
from scripts.cli import interview as interview_cli
from scripts.interview import client
from toon_reader import top_level_array, top_level_field

GRACE_ENV = "TO_PRD_INTERVIEW_GRACE_SECONDS"
GRACE_SECONDS = 0.2 * TIME_SCALE

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
        # The response holds the socket open until it closes as well.
        self.response.close()
        self._connection.close()


class InterviewReopenTestCase(InterviewTestCase):
    # A test waits for up to three grace periods besides its commands.
    time_limit_seconds = 2.0

    def setUp(self) -> None:
        super().setUp()
        self.harness = InterviewHarness(self, self.root, self.session)
        environment = mock.patch.dict(os.environ, {GRACE_ENV: str(GRACE_SECONDS)})
        environment.start()
        self.addCleanup(environment.stop)
        self.round_file = self.write_round(ROUND_ONE)

    def connect_page(self) -> PageConnection:
        page = PageConnection(self.harness.port(), self.harness.token())
        self.addCleanup(page.close)
        return page

    def finish_after_grace(self, command: Any) -> Any:
        return command.finish(STEP_SECONDS + GRACE_SECONDS)

    def fail_browser(self) -> list[str]:
        """Make the browser opener fail, and return the list of URLs it was given."""
        calls: list[str] = []

        def failing_opener(url: str) -> bool:
            calls.append(url)
            return False

        opener = mock.patch.object(interview_cli, "open_page", failing_opener)
        opener.start()
        self.addCleanup(opener.stop)
        return calls

    def page_url(self) -> str:
        return f"http://127.0.0.1:{self.harness.port()}/#token={self.harness.token()}"


class InterviewAskWithoutPageTests(InterviewReopenTestCase):
    def test_ask_without_page_returns_browser_disconnected_after_grace(self) -> None:
        started = time.monotonic()
        ask = self.harness.start_ask(self.round_file)
        ask.wait_started()

        result = self.finish_after_grace(ask)

        self.assertGreaterEqual(time.monotonic() - started, GRACE_SECONDS)
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertEqual(top_level_field(result.stdout, "status"), "browser_disconnected")
        self.assertEqual(top_level_field(result.stdout, "round"), "ROUND-01")

    def test_browser_disconnected_keeps_session_active_and_round_open(self) -> None:
        self.finish_after_grace(self.harness.start_ask(self.round_file))

        status, body = self.harness.request("GET", "/api/round", token=self.harness.token())

        self.assertEqual(self.harness.state()["state"], "active")
        self.assertEqual((status, body["state"], body["round"]["id"]), (200, "open", "ROUND-01"))

    def test_browser_disconnected_payload_ends_with_open_ask_and_end(self) -> None:
        result = self.finish_after_grace(self.harness.start_ask(self.round_file))

        session, round_file = str(self.session), str(self.round_file)
        self.assertTrue(result.stdout.rstrip("\n").splitlines()[-1].startswith("next["))
        next_steps = top_level_array(result.stdout, "next")
        self.assertEqual(len(next_steps), 3, next_steps)
        for step, expected in zip(
            next_steps,
            (
                f"interview open {session}",
                f"interview ask {session} {round_file}",
                f"interview end {session}",
            ),
            strict=True,
        ):
            self.assertTrue(step.endswith(expected), step)

    def test_browser_disconnected_message_offers_reopen_or_end_without_chat_round(self) -> None:
        result = self.finish_after_grace(self.harness.start_ask(self.round_file))

        message = top_level_field(result.stdout, "message")
        self.assertIn("Ask the user whether to open the page again or to end the session.", message)
        self.assertNotIn("in the chat", message)

    def test_ask_with_same_round_after_browser_disconnected_waits_for_submit(self) -> None:
        self.finish_after_grace(self.harness.start_ask(self.round_file))

        again = self.harness.start_ask(self.round_file)
        again.wait_started()
        self.harness.submit(ROUND_ONE_SUBMIT)
        result = again.finish()

        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertEqual(top_level_field(result.stdout, "status"), "answered")


class InterviewAskWithPageTests(InterviewReopenTestCase):
    def test_page_connected_within_grace_keeps_ask_blocked_until_submit(self) -> None:
        ask = self.harness.start_ask(self.round_file)
        ask.wait_started()
        self.connect_page()

        time.sleep(2 * GRACE_SECONDS)
        waiting = ask.is_waiting()
        self.harness.submit(ROUND_ONE_SUBMIT)
        result = ask.finish()

        self.assertTrue(waiting)
        self.assertEqual(top_level_field(result.stdout, "status"), "answered")

    def test_page_connection_that_ends_returns_browser_disconnected_after_grace(self) -> None:
        ask = self.harness.start_ask(self.round_file)
        ask.wait_started()
        page = self.connect_page()
        time.sleep(1.5 * GRACE_SECONDS)

        closed = time.monotonic()
        page.close()
        result = self.finish_after_grace(ask)

        self.assertGreaterEqual(time.monotonic() - closed, GRACE_SECONDS)
        self.assertEqual(top_level_field(result.stdout, "status"), "browser_disconnected")


class InterviewBrowserOpenerTests(InterviewReopenTestCase):
    def test_ask_with_browser_that_opens_prints_no_token(self) -> None:
        result = self.finish_after_grace(self.harness.start_ask(self.round_file))

        self.assertEqual(top_level_field(result.stdout, "status"), "browser_disconnected")
        self.assertEqual(self.harness.browser_calls(), [self.page_url()])
        self.assertNotIn(self.harness.token(), result.stdout + result.stderr)

    def test_ask_with_browser_that_fails_gives_link_in_final_payload_only(self) -> None:
        self.fail_browser()

        result = self.finish_after_grace(self.harness.start_ask(self.round_file))

        self.assertEqual(top_level_field(result.stdout, "status"), "browser_disconnected")
        self.assertEqual(top_level_field(result.stdout, "link"), self.page_url())
        self.assertNotIn(self.harness.token(), result.stderr)


class InterviewOpenTests(InterviewReopenTestCase):
    def disconnect(self) -> None:
        """Leave an active session with a running server and an open round."""
        self.finish_after_grace(self.harness.start_ask(self.round_file))

    def test_open_opens_page_once_with_token_in_fragment(self) -> None:
        self.disconnect()
        before = self.harness.browser_calls()

        result = self.harness.run("open")

        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertEqual(top_level_field(result.stdout, "status"), "opened")
        self.assertEqual(self.harness.browser_calls(), [*before, self.page_url()])
        self.assertNotIn(self.harness.token(), result.stdout + result.stderr)

    def test_open_with_browser_that_fails_returns_link_at_once(self) -> None:
        self.disconnect()
        calls = self.fail_browser()

        started = time.monotonic()
        result = self.harness.run("open")

        self.assertLess(time.monotonic() - started, GRACE_SECONDS)
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertEqual(calls, [self.page_url()])
        self.assertEqual(top_level_field(result.stdout, "link"), self.page_url())
        self.assertNotIn(self.harness.token(), result.stderr)

    def test_open_after_end_returns_ended_without_opening_browser(self) -> None:
        self.disconnect()
        self.harness.end()
        calls = self.fail_browser()

        result = self.harness.run("open")

        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertEqual(top_level_field(result.stdout, "status"), "ended")
        self.assertEqual(calls, [])

    def test_open_on_directory_without_session_gives_no_session(self) -> None:
        calls = self.fail_browser()

        result = self.harness.run("open")

        self.assertEqual(result.returncode, 1, result.stdout)
        self.assertEqual(top_level_field(result.stdout, "code"), "no_session")
        self.assertEqual(calls, [])
        self.assertFalse((self.session / "interview").exists())

    def test_open_next_lines_ask_the_open_round_again(self) -> None:
        self.disconnect()

        result = self.harness.run("open")

        stored = self.session / "interview" / "rounds" / "ROUND-01.json"
        next_steps = top_level_array(result.stdout, "next")
        self.assertTrue(next_steps[0].endswith(f"interview ask {self.session} {stored}"))
        self.assertTrue(next_steps[1].endswith(f"interview end {self.session}"))

    def test_open_after_server_stopped_starts_server_and_opens_its_page(self) -> None:
        self.disconnect()
        stopped = self.harness.kill_server()

        result = self.harness.run("open")

        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertNotEqual(self.harness.server_pid(), stopped)
        self.assertEqual(self.harness.browser_calls()[-1], self.page_url())

    def test_open_with_unresponsive_server_fails_and_opens_no_page(self) -> None:
        self.disconnect()
        self.harness.pause_server()
        calls = self.fail_browser()

        with mock.patch.object(client, "PING_SECONDS", 0.05):
            result = self.harness.run("open")

        self.assertEqual(result.returncode, 1, result.stdout)
        self.assertEqual(top_level_field(result.stdout, "code"), "server_unresponsive")
        self.assertEqual(calls, [])


class InterviewPresenceRouteTests(InterviewTestCase):
    def test_page_connection_without_token_is_forbidden_and_not_counted(self) -> None:
        server = ServerFixture(self, self.session, ROUND_ONE)

        status, body = server.request("GET", "/api/presence")

        self.assertEqual((status, body), (403, {"error": "forbidden"}))
        self.assertEqual(server.server.pages, 0)


class InterviewGraceOverrideTests(InterviewReopenTestCase):
    def test_ask_with_grace_override_that_is_not_positive_fails_to_start_server(self) -> None:
        for value in ("0", "-1", "nan", "soon"):
            with self.subTest(value), mock.patch.dict(os.environ, {GRACE_ENV: value}):
                result = self.harness.ask(self.round_file)

                self.assertEqual(result.returncode, 1, result.stdout)
                self.assertEqual(top_level_field(result.stdout, "code"), "server_start_failed")
