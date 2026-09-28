"""Checks on the delivery record, which tells "round submitted" from "agent works"."""

from __future__ import annotations

import contextlib
import io
import json
import os
import socket
import stat
import subprocess
from pathlib import Path
from typing import Any
from unittest import mock

from support import BROWSER_LOG_ENV

from interview_support import (
    STEP_SECONDS,
    TOKEN_HEADER,
    InterviewHarness,
    InterviewTestCase,
    PageStream,
    PortSquatter,
    ServerFixture,
)
from scripts.cli import interview as interview_cli
from scripts.interview import client
from scripts.interview.rounds import validate_round
from scripts.interview.session import record_delivery, store_round
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
    ],
}

ROUND_ONE_SUBMIT = {
    "round": "ROUND-01",
    "answers": [{"node": "NODE-03", "choice": "option", "selected": ["Registry"]}],
}


def delivery_record(session: Path, round_id: str) -> Path:
    return session / "interview" / "delivered" / f"{round_id}.json"


class InterviewServerDeliveryTests(InterviewTestCase):
    def setUp(self) -> None:
        super().setUp()
        self.server = ServerFixture(self, self.session, ROUND_ONE)

    def result(self, round_id: str = "ROUND-01") -> dict[str, Any]:
        status, body = self.server.request(
            "GET", f"/api/rounds/{round_id}/result", token=self.server.token
        )
        self.assertEqual(status, 200, body)
        return body

    def page_state(self) -> dict[str, Any]:
        status, body = self.server.request("GET", "/api/page", token=self.server.token)
        self.assertEqual(status, 200, body)
        return body

    def test_result_request_that_returns_answers_writes_a_private_delivery_record(self) -> None:
        self.server.submit(ROUND_ONE_SUBMIT)

        self.result()

        record = delivery_record(self.session, "ROUND-01")
        self.assertEqual(json.loads(record.read_text(encoding="utf-8")), {"round": "ROUND-01"})
        self.assertEqual(stat.S_IMODE(record.stat().st_mode), 0o600)

    def test_failed_record_write_still_returns_answers_and_keeps_round_submitted(self) -> None:
        self.server.submit(ROUND_ONE_SUBMIT)
        # A file in place of the record directory makes every record write fail.
        delivery_record(self.session, "ROUND-01").parent.write_text("", encoding="utf-8")

        body = self.result()

        self.assertEqual(body["state"], "answered")
        self.assertEqual(self.page_state()["state"], "round_submitted")

    def test_record_written_outside_this_server_makes_the_round_agent_works(self) -> None:
        self.server.submit(ROUND_ONE_SUBMIT)

        record_delivery(self.server.files, "ROUND-01")

        self.assertEqual(self.page_state()["state"], "agent_works")

    def test_result_request_repeated_for_a_round_leaves_the_same_record(self) -> None:
        self.server.submit(ROUND_ONE_SUBMIT)
        self.result()
        first = delivery_record(self.session, "ROUND-01").read_bytes()

        self.result()

        self.assertEqual(delivery_record(self.session, "ROUND-01").read_bytes(), first)

    def test_ask_that_left_before_the_submit_gets_no_record(self) -> None:
        ask = socket.create_connection(("127.0.0.1", self.server.port), timeout=STEP_SECONDS)
        ask.sendall(
            f"GET /api/rounds/ROUND-01/result HTTP/1.1\r\nHost: 127.0.0.1:{self.server.port}\r\n"
            f"{TOKEN_HEADER}: {self.server.token}\r\n\r\n".encode()
        )
        self.server.wait_for_waiters(1)
        ask.close()

        self.server.submit(ROUND_ONE_SUBMIT)
        self.server.wait_for_waiters(0)

        self.assertFalse(delivery_record(self.session, "ROUND-01").exists())
        self.assertEqual(self.page_state()["state"], "round_submitted")


class InterviewDeliveryNoticeTests(InterviewTestCase):
    def setUp(self) -> None:
        super().setUp()
        self.server = ServerFixture(self, self.session, ROUND_ONE)
        self.stream = PageStream(self.server.port, self.server.token)
        self.addCleanup(self.stream.close)

    def notice(self, round_id: str = "ROUND-01", **kwargs: Any) -> tuple[int, Any]:
        kwargs.setdefault("token", self.server.token)
        return self.server.request("POST", f"/api/rounds/{round_id}/delivered", **kwargs)

    def submit(self) -> None:
        """Submit ROUND-01 and read the page line the submit sends."""
        self.server.submit(ROUND_ONE_SUBMIT)
        self.assertEqual(self.stream.next_data(), "changed")

    def test_notice_for_an_answered_round_tells_pages_and_writes_no_record(self) -> None:
        self.submit()

        status, _ = self.notice()

        self.assertEqual(status, 200)
        self.assertEqual(self.stream.next_data(), "changed")
        self.assertFalse(delivery_record(self.session, "ROUND-01").exists())

    def test_notice_for_a_round_that_is_not_stored_is_not_found(self) -> None:
        self.submit()

        status, body = self.notice("ROUND-02")

        self.assertEqual((status, body), (404, {"error": "not_found"}))

    def test_notice_for_an_open_round_is_conflict(self) -> None:
        status, body = self.notice()

        self.assertEqual((status, body), (409, {"error": "round_open", "round": "ROUND-01"}))

    def test_repeated_notice_succeeds_and_tells_pages_again(self) -> None:
        self.submit()

        statuses = [self.notice()[0], self.notice()[0]]

        self.assertEqual(statuses, [200, 200])
        self.assertEqual([self.stream.next_data(), self.stream.next_data()], ["changed"] * 2)

    def test_notice_without_token_or_from_foreign_host_or_origin_is_forbidden(self) -> None:
        self.submit()
        headers = self.server.submit_headers(b"")
        del headers[TOKEN_HEADER]
        for name, rejected in (
            ("no token", headers),
            (
                "foreign host",
                self.server.submit_headers(b"", Host=f"evil.example:{self.server.port}"),
            ),
            ("foreign origin", self.server.submit_headers(b"", Origin="http://evil.example")),
        ):
            with self.subTest(name):
                status, body = self.server.raw_request(
                    "POST", "/api/rounds/ROUND-01/delivered", rejected
                )

                self.assertEqual((status, body), (403, {"error": "forbidden"}))
        # The end sends the next page line, so a rejected notice that told the pages shows
        # up here as `changed`.
        self.server.request("POST", "/api/end", token=self.server.token)

        self.assertEqual(self.stream.next_data(), "ended")
        self.assertFalse(delivery_record(self.session, "ROUND-01").exists())

    def test_notice_without_declared_length_is_rejected(self) -> None:
        self.submit()
        headers = self.server.submit_headers(b"")
        del headers["Content-Length"]

        status, body = self.server.raw_request("POST", "/api/rounds/ROUND-01/delivered", headers)

        self.assertEqual((status, body), (411, {"error": "length_required"}))


class InterviewReplayWithServerTests(InterviewTestCase):
    """Replays in the test process against a server on a thread of the test process."""

    def setUp(self) -> None:
        super().setUp()
        self.server = ServerFixture(self, self.session, ROUND_ONE)
        self.stream = PageStream(self.server.port, self.server.token)
        self.addCleanup(self.stream.close)
        self.round_file = self.write_round(ROUND_ONE)
        self.browser_log = self.root / "browser.log"

    def submit(self, body: dict[str, Any] = ROUND_ONE_SUBMIT) -> None:
        """Submit with no ask waiting, and read the page line the submit sends."""
        self.server.submit(body)
        self.assertEqual(self.stream.next_data(), "changed")

    def ask(self, round_file: Path | None = None) -> subprocess.CompletedProcess[str]:
        argv = ["ask", str(self.session), str(round_file or self.round_file)]
        stdout, stderr = io.StringIO(), io.StringIO()
        with (
            mock.patch.dict(os.environ, {BROWSER_LOG_ENV: str(self.browser_log)}),
            contextlib.redirect_stdout(stdout),
            contextlib.redirect_stderr(stderr),
        ):
            code = interview_cli.main(argv)
        return subprocess.CompletedProcess(argv, code, stdout.getvalue(), stderr.getvalue())

    def page_state(self) -> str:
        status, body = self.server.request("GET", "/api/page", token=self.server.token)
        self.assertEqual(status, 200, body)
        return body["state"]

    def test_replay_records_delivery_and_the_open_page_shows_agent_works(self) -> None:
        self.submit()

        result = self.ask()

        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertEqual(top_level_field(result.stdout, "status"), "answered")
        self.assertEqual(result.stderr, "")
        self.assertTrue(delivery_record(self.session, "ROUND-01").exists())
        self.assertEqual(self.stream.next_data(), "changed")
        self.assertEqual(self.page_state(), "agent_works")
        self.assertFalse(self.browser_log.exists())

    def test_failed_record_write_leaves_the_replay_output_and_the_round_submitted(self) -> None:
        self.submit()
        blocker = delivery_record(self.session, "ROUND-01").parent
        blocker.write_text("", encoding="utf-8")

        failed = self.ask()
        state = self.page_state()
        blocker.unlink()
        recorded = self.ask()

        self.assertEqual(
            (failed.returncode, failed.stdout, failed.stderr),
            (0, recorded.stdout, ""),
        )
        self.assertEqual(state, "round_submitted")

    def test_replay_of_an_earlier_round_leaves_the_newer_round_submitted(self) -> None:
        self.submit()
        store_round(self.server.files, validate_round({**ROUND_ONE, "id": "ROUND-02"}))
        self.submit({**ROUND_ONE_SUBMIT, "round": "ROUND-02"})

        self.ask()

        self.assertTrue(delivery_record(self.session, "ROUND-01").exists())
        self.assertEqual(self.page_state(), "round_submitted")


class InterviewReplayProcessTests(InterviewTestCase):
    """Replays and restarts with the server as its own process."""

    time_limit_seconds = 2.0

    def setUp(self) -> None:
        super().setUp()
        self.harness = InterviewHarness(self, self.root, self.session)
        self.round_file = self.write_round(ROUND_ONE)

    def answer_without_waiting_ask(self) -> None:
        """Answer ROUND-01 after its ask stopped, so no ask got the answers."""
        stopped = self.harness.start_ask_process(self.round_file)
        stopped.wait_started()
        stopped.stop()
        status, body = self.harness.submit(ROUND_ONE_SUBMIT)
        self.assertEqual(status, 200, body)

    def test_replay_without_server_records_delivery_and_starts_nothing(self) -> None:
        self.answer_without_waiting_ask()
        pid = self.harness.kill_server()
        calls = self.harness.browser_calls()

        result = self.harness.ask(self.round_file)

        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertEqual(top_level_field(result.stdout, "status"), "answered")
        self.assertEqual(result.stderr, "")
        self.assertEqual(self.harness.browser_calls(), calls)
        self.assertEqual(self.harness.server_pid(), pid)
        self.assertTrue(delivery_record(self.session, "ROUND-01").exists())

    def test_replay_with_paused_server_prints_the_answers_and_records_delivery(self) -> None:
        self.answer_without_waiting_ask()
        self.harness.pause_server()

        with mock.patch.object(client, "NOTICE_SECONDS", 0.05):
            result = self.harness.ask(self.round_file)

        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertEqual(top_level_field(result.stdout, "status"), "answered")
        self.assertEqual(result.stderr, "")
        self.assertTrue(delivery_record(self.session, "ROUND-01").exists())

    def restart_server(self) -> str:
        """Stop the server, start it again with `interview open`, and return the page state."""
        self.harness.kill_server()
        opened = self.harness.run("open")
        self.assertEqual(top_level_field(opened.stdout, "status"), "opened", opened.stdout)
        status, body = self.harness.request("GET", "/api/page", token=self.harness.token())
        self.assertEqual(status, 200, body)
        return body["state"]

    def test_restart_keeps_a_round_that_no_ask_got_as_round_submitted(self) -> None:
        self.answer_without_waiting_ask()

        self.assertEqual(self.restart_server(), "round_submitted")

    def test_restart_keeps_a_round_that_its_waiting_ask_got_as_agent_works(self) -> None:
        ask = self.harness.start_ask(self.round_file)
        ask.wait_started()
        self.harness.submit(ROUND_ONE_SUBMIT)
        self.assertEqual(top_level_field(ask.finish().stdout, "status"), "answered")

        self.assertEqual(self.restart_server(), "agent_works")

    def test_status_keeps_its_fields_and_counts_once_a_delivery_record_exists(self) -> None:
        self.answer_without_waiting_ask()
        before = self.harness.run("status").stdout

        self.harness.ask(self.round_file)

        self.assertTrue(delivery_record(self.session, "ROUND-01").exists())
        self.assertEqual(self.harness.run("status").stdout, before)

    def test_replay_sends_no_token_to_a_process_on_the_stopped_server_port(self) -> None:
        self.answer_without_waiting_ask()
        port, token = self.harness.port(), self.harness.token()
        self.harness.kill_server()
        squatter = PortSquatter(self, port)

        result = self.harness.ask(self.round_file)

        self.assertEqual(top_level_field(result.stdout, "status"), "answered", result.stdout)
        self.assertNotIn(token.encode(), squatter.received())
