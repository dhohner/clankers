"""Checks on the server routes of the interview page: files, shared styles, and page states."""

from __future__ import annotations

import http.client
import socket
import threading
from typing import Any

from support import SOURCE_ASSETS

from interview_support import STEP_SECONDS, TOKEN_HEADER, InterviewTestCase, ServerFixture
from scripts.interview.rounds import validate_round
from scripts.interview.session import store_answers, store_round

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


def stored_round_answers(round_id: str) -> dict[str, Any]:
    return {
        "round": round_id,
        "answers": [
            {
                "node": "NODE-03",
                "choice": "written",
                "selected": [],
                "written": f"Answer of {round_id}",
                "reason": "",
                "note": "",
            }
        ],
        "comment": "",
    }


class PageStream:
    """A page connection that reads the lines the server writes on it."""

    def __init__(self, port: int, token: str) -> None:
        self._connection = http.client.HTTPConnection("127.0.0.1", port, timeout=STEP_SECONDS)
        self._connection.request("GET", "/api/presence", headers={TOKEN_HEADER: token})
        self.response = self._connection.getresponse()
        self.first_line = self.readline()

    def readline(self) -> str:
        return self.response.fp.readline().decode("utf-8")

    def next_data(self) -> str:
        """Return the value of the next `data:` line, skipping comments and blank lines."""
        while True:
            line = self.readline()
            if not line:
                raise AssertionError("the page stream closed without data")
            if line.startswith("data: "):
                return line.removeprefix("data: ").strip()

    def close(self) -> None:
        self.response.close()
        self._connection.close()


class InterviewPageTestCase(InterviewTestCase):
    def setUp(self) -> None:
        super().setUp()
        self.server = ServerFixture(self, self.session, ROUND_ONE)

    def get(self, path: str, token: str | None = None) -> http.client.HTTPResponse:
        connection = http.client.HTTPConnection("127.0.0.1", self.server.port, timeout=STEP_SECONDS)
        self.addCleanup(connection.close)
        headers = {} if token is None else {TOKEN_HEADER: token}
        connection.request("GET", path, headers=headers)
        response = connection.getresponse()
        response.body = response.read()
        return response

    def page_state(self) -> dict[str, Any]:
        status, body = self.server.request("GET", "/api/page", token=self.server.token)
        self.assertEqual(status, 200, body)
        return body

    def open_stream(self) -> PageStream:
        stream = PageStream(self.server.port, self.server.token)
        self.addCleanup(stream.close)
        return stream


class InterviewPageFileRouteTests(InterviewPageTestCase):
    def test_page_shell_links_the_shared_styles_and_page_files(self) -> None:
        shell = self.get("/").body.decode("utf-8")

        for reference in ("/assets/styles.css", "/page.css", "/page.js"):
            with self.subTest(reference):
                self.assertIn(f'"{reference}"', shell)

    def test_page_files_load_with_their_types_and_the_page_policy(self) -> None:
        for path, content_type in (
            ("/", "text/html"),
            ("/page.js", "text/javascript"),
            ("/page.css", "text/css"),
        ):
            with self.subTest(path):
                response = self.get(path)

                self.assertEqual(response.status, 200)
                self.assertTrue(response.getheader("Content-Type").startswith(content_type))
                self.assertIn("connect-src 'self'", response.getheader("Content-Security-Policy"))

    def test_shared_styles_and_fonts_load_from_the_bundle_assets(self) -> None:
        for path, source, content_type in (
            ("/assets/styles.css", "styles.css", "text/css"),
            ("/assets/favicon.svg", "favicon.svg", "image/svg+xml"),
            ("/assets/fonts/archivo-latin.woff2", "fonts/archivo-latin.woff2", "font/woff2"),
            (
                "/assets/fonts/martian-mono-latin.woff2",
                "fonts/martian-mono-latin.woff2",
                "font/woff2",
            ),
        ):
            with self.subTest(path):
                response = self.get(path)

                self.assertEqual(response.status, 200)
                self.assertTrue(response.getheader("Content-Type").startswith(content_type))
                self.assertEqual(response.body, (SOURCE_ASSETS / source).read_bytes())

    def test_other_bundle_asset_is_not_served(self) -> None:
        for path in ("/assets/app.js", "/assets/fonts/OFL-Archivo.txt", "/assets/../server.py"):
            with self.subTest(path):
                self.assertEqual(self.get(path).status, 403)


class InterviewPageStateTests(InterviewPageTestCase):
    def test_page_state_needs_the_token(self) -> None:
        for token in (None, "wrong"):
            with self.subTest(token):
                status, body = self.server.request("GET", "/api/page", token=token)

                self.assertEqual((status, body), (403, {"error": "forbidden"}))

    def test_open_round_is_round_open_with_the_round_and_no_history(self) -> None:
        state = self.page_state()

        self.assertEqual(state["state"], "round_open")
        self.assertEqual(state["round"]["id"], "ROUND-01")
        self.assertEqual(state["session"], str(self.session))
        self.assertEqual(state["history"], [])

    def test_stored_answers_that_no_ask_returned_are_round_submitted(self) -> None:
        self.server.submit(ROUND_ONE_SUBMIT)

        state = self.page_state()

        self.assertEqual((state["state"], state["round"]), ("round_submitted", None))
        self.assertEqual(
            [
                (item["round"]["id"], item["answers"]["answers"][0]["selected"])
                for item in state["history"]
            ],
            [("ROUND-01", ["Registry"])],
        )

    def test_answers_returned_to_an_ask_are_agent_works(self) -> None:
        self.server.submit(ROUND_ONE_SUBMIT)
        status, body = self.server.request(
            "GET", "/api/rounds/ROUND-01/result", token=self.server.token
        )
        self.assertEqual((status, body["state"]), (200, "answered"))

        self.assertEqual(self.page_state()["state"], "agent_works")

    def test_answers_for_an_ask_that_left_while_waiting_stay_round_submitted(self) -> None:
        ask = socket.create_connection(("127.0.0.1", self.server.port), timeout=STEP_SECONDS)
        ask.sendall(
            f"GET /api/rounds/ROUND-01/result HTTP/1.1\r\nHost: 127.0.0.1:{self.server.port}\r\n"
            f"{TOKEN_HEADER}: {self.server.token}\r\n\r\n".encode()
        )
        self.server.wait_for_waiters(1)
        ask.close()

        self.server.submit(ROUND_ONE_SUBMIT)
        self.server.wait_for_waiters(0)

        self.assertEqual(self.page_state()["state"], "round_submitted")

    def test_earlier_round_that_no_ask_returned_does_not_hold_later_rounds_submitted(self) -> None:
        self.server.submit(ROUND_ONE_SUBMIT)
        store_round(self.server.files, validate_round({**ROUND_ONE, "id": "ROUND-02"}))
        self.server.submit({**ROUND_ONE_SUBMIT, "round": "ROUND-02"})
        self.server.request("GET", "/api/rounds/ROUND-02/result", token=self.server.token)

        self.assertEqual(self.page_state()["state"], "agent_works")

    def test_answers_this_server_did_not_take_are_agent_works(self) -> None:
        store_answers(self.server.files, stored_round_answers("ROUND-01"))

        self.assertEqual(self.page_state()["state"], "agent_works")

    def test_history_lists_answered_rounds_newest_first_by_round_number(self) -> None:
        for round_id in ("ROUND-2", "ROUND-10"):
            store_round(self.server.files, validate_round({**ROUND_ONE, "id": round_id}))
            store_answers(self.server.files, stored_round_answers(round_id))
        store_answers(self.server.files, stored_round_answers("ROUND-01"))
        store_round(self.server.files, validate_round({**ROUND_ONE, "id": "ROUND-11"}))

        state = self.page_state()

        self.assertEqual((state["state"], state["round"]["id"]), ("round_open", "ROUND-11"))
        self.assertEqual(
            [
                (item["round"]["id"], item["answers"]["answers"][0]["written"])
                for item in state["history"]
            ],
            [
                ("ROUND-10", "Answer of ROUND-10"),
                ("ROUND-2", "Answer of ROUND-2"),
                ("ROUND-01", "Answer of ROUND-01"),
            ],
        )


class InterviewPageStreamTests(InterviewPageTestCase):
    def test_page_stream_says_changed_after_a_submit(self) -> None:
        stream = self.open_stream()

        self.server.submit(ROUND_ONE_SUBMIT)

        self.assertEqual((stream.first_line, stream.next_data()), (": connected\n", "changed"))

    def test_page_stream_says_changed_when_an_ask_waits_for_a_round(self) -> None:
        stream = self.open_stream()
        waiting = threading.Thread(
            target=self.server.request,
            args=("GET", "/api/rounds/ROUND-01/result"),
            kwargs={"token": self.server.token},
            daemon=True,
        )
        waiting.start()
        self.addCleanup(waiting.join, STEP_SECONDS)
        self.addCleanup(self.server.submit, ROUND_ONE_SUBMIT)

        self.assertEqual(stream.next_data(), "changed")

    def test_page_stream_says_ended_when_the_session_ends(self) -> None:
        stream = self.open_stream()

        self.server.request("POST", "/api/end", token=self.server.token)

        self.assertEqual(stream.next_data(), "ended")
