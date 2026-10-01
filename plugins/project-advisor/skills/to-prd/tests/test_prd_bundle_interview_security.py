"""Checks that the interview server rejects DNS rebinding, foreign pages, and large bodies."""

from __future__ import annotations

import json
import os
import stat

from support import SKILL_DIR  # noqa: F401  # puts the skill directory on sys.path

from interview_support import TOKEN_HEADER, InterviewTestCase, ServerFixture
from scripts.interview.server import MAX_BODY_BYTES

ROUND = {
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
        }
    ],
}

SUBMIT = {
    "round": "ROUND-01",
    "answers": [{"node": "NODE-03", "choice": "option", "selected": ["Registry"]}],
}

FORBIDDEN = (403, {"error": "forbidden"})


class InterviewSecurityTestCase(InterviewTestCase):
    def setUp(self) -> None:
        super().setUp()
        self.server = ServerFixture(self, self.session, ROUND)

    def round_state(self) -> str:
        return self.server.request("GET", "/api/round", token=self.server.token)[1]["state"]


class HostCheckTests(InterviewSecurityTestCase):
    def test_foreign_host_gets_no_page_and_no_session_data(self) -> None:
        for path in ("/", "/assets/interview/app.js", "/api/session", "/api/round"):
            with self.subTest(path):
                status, body = self.server.raw_request(
                    "GET", path, {"Host": "evil.example", TOKEN_HEADER: self.server.token}
                )

                self.assertEqual((status, body), FORBIDDEN)

    def test_foreign_host_cannot_submit_or_end(self) -> None:
        payload = json.dumps(SUBMIT).encode()
        for path in ("/api/answers", "/api/end"):
            with self.subTest(path):
                headers = self.server.submit_headers(
                    payload, Host=f"evil.example:{self.server.port}"
                )

                status, body = self.server.raw_request("POST", path, headers, payload)

                self.assertEqual((status, body), FORBIDDEN)
                self.assertEqual(self.round_state(), "open")

    def test_missing_host_is_forbidden(self) -> None:
        status, body = self.server.raw_request("GET", "/", {})

        self.assertEqual((status, body), FORBIDDEN)

    def test_host_with_another_port_is_forbidden(self) -> None:
        status, body = self.server.raw_request(
            "GET", "/", {"Host": f"127.0.0.1:{self.server.port + 1}"}
        )

        self.assertEqual((status, body), FORBIDDEN)

    def test_host_that_only_starts_with_a_loopback_name_is_forbidden(self) -> None:
        for host in ("localhost.evil.example", "127.0.0.1.evil.example", "127.0.0.10"):
            with self.subTest(host):
                status, body = self.server.raw_request("GET", "/", {"Host": host})

                self.assertEqual((status, body), FORBIDDEN)

    def test_loopback_names_with_and_without_port_load_the_page(self) -> None:
        port = self.server.port
        for host in ("127.0.0.1", f"127.0.0.1:{port}", "localhost", f"localhost:{port}"):
            with self.subTest(host):
                status, body = self.server.raw_request("GET", "/", {"Host": host})

                self.assertEqual(status, 200)
                self.assertIn("<script", body)

    def test_host_check_runs_before_the_body_checks(self) -> None:
        headers = self.server.submit_headers(b"", Host="evil.example")
        headers["Content-Length"] = str(MAX_BODY_BYTES + 1)

        status, body = self.server.raw_request("POST", "/api/answers", headers, b"")

        self.assertEqual((status, body), FORBIDDEN)


class OriginCheckTests(InterviewSecurityTestCase):
    def test_submit_from_foreign_origin_is_forbidden_and_round_stays_open(self) -> None:
        payload = json.dumps(SUBMIT).encode()
        for origin in ("http://evil.example", "null", f"http://127.0.0.1:{self.server.port + 1}"):
            with self.subTest(origin):
                headers = self.server.submit_headers(payload, Origin=origin)

                status, body = self.server.raw_request("POST", "/api/answers", headers, payload)

                self.assertEqual((status, body), FORBIDDEN)
                self.assertEqual(self.server.stored_answers(), [])
                self.assertEqual(self.round_state(), "open")

    def test_end_from_foreign_origin_is_forbidden_and_session_stays_active(self) -> None:
        headers = self.server.submit_headers(b"", Origin="http://evil.example")

        status, body = self.server.raw_request("POST", "/api/end", headers, b"")

        self.assertEqual((status, body), FORBIDDEN)
        self.assertEqual(self.round_state(), "open")

    def test_submit_from_server_origin_with_token_succeeds(self) -> None:
        payload = json.dumps(SUBMIT).encode()
        headers = self.server.submit_headers(payload, Origin=self.server.origin())

        status, body = self.server.raw_request("POST", "/api/answers", headers, payload)

        self.assertEqual((status, body), (200, {"state": "answered", "round": "ROUND-01"}))

    def test_submit_from_localhost_origin_with_token_succeeds(self) -> None:
        payload = json.dumps(SUBMIT).encode()
        headers = self.server.submit_headers(
            payload,
            Host=f"localhost:{self.server.port}",
            Origin=f"http://localhost:{self.server.port}",
        )

        status, body = self.server.raw_request("POST", "/api/answers", headers, payload)

        self.assertEqual((status, body), (200, {"state": "answered", "round": "ROUND-01"}))

    def test_submit_without_origin_with_host_and_token_succeeds(self) -> None:
        payload = json.dumps(SUBMIT).encode()

        status, body = self.server.raw_request(
            "POST", "/api/answers", self.server.submit_headers(payload), payload
        )

        self.assertEqual((status, body), (200, {"state": "answered", "round": "ROUND-01"}))

    def test_server_origin_does_not_replace_the_token(self) -> None:
        payload = json.dumps(SUBMIT).encode()
        headers = self.server.submit_headers(payload, Origin=self.server.origin())
        del headers[TOKEN_HEADER]

        status, body = self.server.raw_request("POST", "/api/answers", headers, payload)

        self.assertEqual((status, body), FORBIDDEN)
        self.assertEqual(self.server.stored_answers(), [])


class TokenCheckTests(InterviewSecurityTestCase):
    def test_data_request_without_or_with_wrong_token_is_forbidden(self) -> None:
        for name, token in (("no token", None), ("wrong token", "not-the-token")):
            for path in ("/api/session", "/api/round", "/api/rounds/ROUND-01/result"):
                with self.subTest(name, path=path):
                    headers = {"Host": self.server.host()}
                    if token is not None:
                        headers[TOKEN_HEADER] = token

                    status, body = self.server.raw_request("GET", path, headers)

                    self.assertEqual((status, body), FORBIDDEN)


class BodyCapTests(InterviewSecurityTestCase):
    def test_submit_above_cap_gets_413_before_body_is_read_and_round_stays_open(self) -> None:
        # The body is short of its declared length, so a server that reads it would block
        # until the request times out.
        payload = json.dumps(SUBMIT).encode()
        headers = self.server.submit_headers(payload, **{"Content-Length": str(MAX_BODY_BYTES + 1)})

        status, body = self.server.raw_request("POST", "/api/answers", headers, payload)

        self.assertEqual((status, body), (413, {"error": "body_too_large"}))
        self.assertEqual(self.server.stored_answers(), [])
        self.assertEqual(self.round_state(), "open")

    def test_submit_of_exactly_the_cap_is_accepted(self) -> None:
        compact = json.dumps(SUBMIT).encode()
        payload = compact + b" " * (MAX_BODY_BYTES - len(compact))

        status, body = self.server.raw_request(
            "POST", "/api/answers", self.server.submit_headers(payload), payload
        )

        self.assertEqual((status, body), (200, {"state": "answered", "round": "ROUND-01"}))

    def test_submit_without_declared_length_is_rejected_and_stores_nothing(self) -> None:
        payload = json.dumps(SUBMIT).encode()
        headers = self.server.submit_headers(payload)
        del headers["Content-Length"]
        headers["Transfer-Encoding"] = "chunked"
        chunked = f"{len(payload):x}\r\n".encode() + payload + b"\r\n0\r\n\r\n"

        status, body = self.server.raw_request("POST", "/api/answers", headers, chunked)

        self.assertEqual((status, body), (411, {"error": "length_required"}))
        self.assertEqual(self.server.stored_answers(), [])
        self.assertEqual(self.round_state(), "open")

    def test_submit_without_length_or_transfer_encoding_is_rejected(self) -> None:
        headers = self.server.submit_headers(b"")
        del headers["Content-Length"]

        status, body = self.server.raw_request("POST", "/api/answers", headers)

        self.assertEqual((status, body), (411, {"error": "length_required"}))
        self.assertEqual(self.server.stored_answers(), [])

    def test_submit_with_length_too_long_to_convert_gets_413(self) -> None:
        # Python refuses to convert a decimal string of more than 4300 digits to an int.
        payload = json.dumps(SUBMIT).encode()
        headers = self.server.submit_headers(payload, **{"Content-Length": "9" * 4301})

        status, body = self.server.raw_request("POST", "/api/answers", headers, payload)

        self.assertEqual((status, body), (413, {"error": "body_too_large"}))
        self.assertEqual(self.server.stored_answers(), [])
        self.assertEqual(self.round_state(), "open")

    def test_submit_with_leading_zeros_in_length_is_measured_by_value(self) -> None:
        payload = json.dumps(SUBMIT).encode()
        answered = (200, {"state": "answered", "round": "ROUND-01"})
        too_large = (413, {"error": "body_too_large"})
        for name, length, expected in (
            ("within cap", "0" * 4301 + str(len(payload)), answered),
            ("above cap", "0" * 4301 + str(MAX_BODY_BYTES + 1), too_large),
        ):
            with self.subTest(name):
                headers = self.server.submit_headers(payload, **{"Content-Length": length})

                status, body = self.server.raw_request("POST", "/api/answers", headers, payload)

                self.assertEqual((status, body), expected)

    def test_submit_with_malformed_length_is_rejected_and_stores_nothing(self) -> None:
        payload = json.dumps(SUBMIT).encode()
        for length in ("-1", "12abc", "1, 1"):
            with self.subTest(length):
                headers = self.server.submit_headers(payload, **{"Content-Length": length})

                status, body = self.server.raw_request("POST", "/api/answers", headers, payload)

                self.assertEqual((status, body), (400, {"error": "bad_length"}))
                self.assertEqual(self.server.stored_answers(), [])

    def test_submit_with_long_note_and_comment_is_accepted(self) -> None:
        submit = {
            **SUBMIT,
            "answers": [{**SUBMIT["answers"][0], "note": "n" * 100_000}],
            "comment": "c" * 100_000,
        }
        payload = json.dumps(submit).encode()

        status, body = self.server.raw_request(
            "POST", "/api/answers", self.server.submit_headers(payload), payload
        )

        self.assertEqual((status, body), (200, {"state": "answered", "round": "ROUND-01"}))


class SessionFileTests(InterviewSecurityTestCase):
    def test_session_state_file_with_token_has_mode_0600(self) -> None:
        state = json.loads(self.server.files.state.read_text())

        self.assertIn("token", state)
        self.assertEqual(oct(stat.S_IMODE(os.stat(self.server.files.state).st_mode)), oct(0o600))

    def test_server_socket_address_is_loopback(self) -> None:
        self.assertEqual(self.server.server.socket.getsockname()[0], "127.0.0.1")
