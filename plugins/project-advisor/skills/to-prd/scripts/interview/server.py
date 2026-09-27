"""Background HTTP server for one interview session.

The CLI starts it with `python3 -m scripts.interview.server <session-dir>` from the skill
directory. It is not a documented command. The server prints one `ready` line on stdout
once the state file holds its address and token.
"""

from __future__ import annotations

import contextlib
import hmac
import json
import os
import re
import secrets
import sys
import threading
import time
from collections.abc import Iterator
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

from .answers import SubmitError, validate_submit
from .rounds import ROUND_ID_PATTERN
from .session import (
    ACTIVE,
    ENDED,
    SessionFiles,
    acquire_server_lock,
    open_round_ids,
    read_state,
    store_answers,
    stored_answers,
    stored_round,
    write_state,
)

HOST = "127.0.0.1"
TOKEN_HEADER = "X-Interview-Token"
PAGE_DIR = Path(__file__).resolve().parent / "page"
STATIC_FILES = {
    "/": ("index.html", "text/html; charset=utf-8"),
    "/page.js": ("page.js", "text/javascript; charset=utf-8"),
}
RESULT_ROUTE = re.compile(r"/api/rounds/(ROUND-[0-9]+)/result")
PAGE_POLICY = "default-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'"
DRAIN_SECONDS = 5.0
# serve_forever sees a shutdown request only at its next poll, so this bounds how long
# `interview end` waits for the port to close.
SHUTDOWN_POLL_SECONDS = 0.02
# A waiting round returns `browser_disconnected` once no page was connected for this long.
# It covers a browser that starts slowly and a page that reloads.
DEFAULT_GRACE_SECONDS = 15.0
# Tests set this to a shorter grace period in seconds.
GRACE_ENV = "TO_PRD_INTERVIEW_GRACE_SECONDS"
BROWSER_DISCONNECTED = "browser_disconnected"


class ServerRunning(Exception):
    pass


class InterviewServer(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(
        self, files: SessionFiles, token: str, grace_seconds: float = DEFAULT_GRACE_SECONDS
    ) -> None:
        ownership = acquire_server_lock(files)
        if ownership is None:
            raise ServerRunning(f"an interview server already runs for {files.session}")
        try:
            # The lock file names its holder, because the end rewrites the state file before
            # the server stops.
            os.ftruncate(ownership, 0)
            os.write(ownership, f"{os.getpid()}\n".encode())
            super().__init__((HOST, 0), InterviewHandler)
        except BaseException:
            os.close(ownership)
            raise
        self.ownership = ownership
        self.files = files
        self.token = token
        self.grace_seconds = grace_seconds
        self.ended = False
        self.waiters = 0
        self.pages = 0
        self.page_left_at = float("-inf")
        self.condition = threading.Condition()

    def server_close(self) -> None:
        """Close the socket, then release the session to a later server."""
        super().server_close()
        os.close(self.ownership)

    def token_matches(self, candidate: str) -> bool:
        with self.condition:
            if self.ended or not candidate:
                return False
            return hmac.compare_digest(candidate.encode(), self.token.encode())

    @contextlib.contextmanager
    def waiter(self) -> Iterator[None]:
        """Count a waiting request until its response is written, so the end can drain it."""
        with self.condition:
            self.waiters += 1
        try:
            yield
        finally:
            with self.condition:
                self.waiters -= 1
                self.condition.notify_all()

    @contextlib.contextmanager
    def page_connection(self) -> Iterator[None]:
        """Count a connected page until its connection ends."""
        with self.condition:
            self.pages += 1
            self.condition.notify_all()
        try:
            yield
        finally:
            with self.condition:
                self.pages -= 1
                self.page_left_at = time.monotonic()
                self.condition.notify_all()

    def current_round(self) -> dict[str, Any]:
        """Return the open round for the page, or a waiting state while the agent works."""
        with self.condition:
            open_ids = open_round_ids(self.files)
            if not open_ids:
                return {"state": "waiting", "round": None}
            return {"state": "open", "round": stored_round(self.files, open_ids[0])}

    def round_result(self, round_id: str) -> dict[str, Any] | None:
        """Block until the round has answers, the session ends, or no page is connected.

        Return None for an unknown round. The grace period starts with this call or when the
        last page connection ends, whichever is later.
        """
        waiting_since = time.monotonic()
        with self.condition:
            if stored_round(self.files, round_id) is None:
                return None
            while True:
                if self.ended:
                    return {"state": ENDED}
                answers = stored_answers(self.files, round_id)
                if answers is not None:
                    return {"state": "answered", "answers": answers}
                if self.pages:
                    self.condition.wait()
                    continue
                quiet_since = max(waiting_since, self.page_left_at)
                remaining = quiet_since + self.grace_seconds - time.monotonic()
                if remaining <= 0:
                    return {"state": BROWSER_DISCONNECTED}
                self.condition.wait(remaining)

    def submit(self, body: Any) -> tuple[HTTPStatus, dict[str, Any]]:
        """Validate and store one submit; the condition lock makes submits run one at a time."""
        if not isinstance(body, dict):
            return _invalid("submit", "must be a JSON mapping", "Send the submit as a mapping.")
        round_id = body.get("round")
        if not isinstance(round_id, str) or not ROUND_ID_PATTERN.fullmatch(round_id):
            return _invalid("round", "round id is missing or malformed", "Send the open round id.")
        with self.condition:
            if stored_answers(self.files, round_id) is not None:
                return HTTPStatus.CONFLICT, {"error": "round_answered", "round": round_id}
            round_ = stored_round(self.files, round_id)
            if round_ is None:
                return _invalid(
                    "round", f"{round_id} is not the open round", "Send the open round id."
                )
            try:
                answers = validate_submit(round_, body)
            except SubmitError as error:
                return HTTPStatus.BAD_REQUEST, {"error": "invalid_submit", "faults": error.faults}
            store_answers(self.files, answers)
            self.condition.notify_all()
        return HTTPStatus.OK, {"state": "answered", "round": round_id}

    def end_session(self) -> None:
        with self.condition:
            self.ended = True
            write_state(self.files, {"state": ENDED})
            self.condition.notify_all()

    def drain_waiters(self) -> None:
        with self.condition:
            self.condition.wait_for(lambda: self.waiters == 0, timeout=DRAIN_SECONDS)


class InterviewHandler(BaseHTTPRequestHandler):
    server: InterviewServer

    def log_message(self, format: str, *args: Any) -> None:
        """Keep request logs out of the output, because the server has no log file."""

    def do_GET(self) -> None:
        path = urlsplit(self.path).path
        if path in STATIC_FILES:
            self._send_static(*STATIC_FILES[path])
            return
        if not self._authorized():
            return
        if path == "/api/session":
            self._send_json(HTTPStatus.OK, {"session": str(self.server.files.session)})
            return
        if path == "/api/round":
            self._send_json(HTTPStatus.OK, self.server.current_round())
            return
        if path == "/api/presence":
            self._hold_page_connection()
            return
        result = RESULT_ROUTE.fullmatch(path)
        if result:
            with self.server.waiter():
                outcome = self.server.round_result(result.group(1))
                if outcome is not None:
                    self._send_json(HTTPStatus.OK, outcome)
                    return
        self._send_json(HTTPStatus.NOT_FOUND, {"error": "not_found"})

    def do_POST(self) -> None:
        path = urlsplit(self.path).path
        if not self._authorized():
            return
        if path == "/api/answers":
            try:
                body = self._read_json()
            except ValueError:
                self._send_json(*_invalid("submit", "is not JSON", "Send the submit as JSON."))
                return
            self._send_json(*self.server.submit(body))
            return
        if path == "/api/end":
            self.server.end_session()
            try:
                self._send_json(HTTPStatus.OK, {"state": ENDED})
            finally:
                # The server stops even when the client left before the response. shutdown()
                # waits for serve_forever, so it cannot run on a request thread's path.
                threading.Thread(target=self.server.shutdown, daemon=True).start()
            return
        self._send_json(HTTPStatus.NOT_FOUND, {"error": "not_found"})

    def _hold_page_connection(self) -> None:
        """Keep the response open until the page closes its connection.

        The page sends nothing after its request, so a read returns only at the close.
        """
        with self.server.page_connection(), contextlib.suppress(OSError):
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(b": connected\n\n")
            self.wfile.flush()
            while self.rfile.read(1):
                pass

    def _authorized(self) -> bool:
        if self.server.token_matches(self.headers.get(TOKEN_HEADER, "")):
            return True
        self._send_json(HTTPStatus.FORBIDDEN, {"error": "forbidden"})
        return False

    def _read_json(self) -> Any:
        length = int(self.headers.get("Content-Length") or 0)
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def _send_static(self, name: str, content_type: str) -> None:
        body = (PAGE_DIR / name).read_bytes()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Content-Security-Policy", PAGE_POLICY)
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _send_json(self, status: HTTPStatus, value: Any) -> None:
        body = json.dumps(value, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)


def _invalid(path: str, message: str, fix: str) -> tuple[HTTPStatus, dict[str, Any]]:
    fault = {"path": path, "message": message, "fix": fix}
    return HTTPStatus.BAD_REQUEST, {"error": "invalid_submit", "faults": [fault]}


def create_server(
    files: SessionFiles, grace_seconds: float = DEFAULT_GRACE_SECONDS
) -> InterviewServer:
    """Bind the server and record its address and token in the state file."""
    previous = read_state(files)
    token = (previous or {}).get("token") or secrets.token_urlsafe(32)
    server = InterviewServer(files, token, grace_seconds)
    host, port = server.server_address[:2]
    write_state(
        files,
        {"state": ACTIVE, "token": token, "host": str(host), "port": int(port), "pid": os.getpid()},
    )
    return server


def main(argv: list[str]) -> int:
    server = create_server(SessionFiles(Path(argv[0])), _grace_seconds())
    _signal_ready()
    server.serve_forever(poll_interval=SHUTDOWN_POLL_SECONDS)
    server.drain_waiters()
    server.server_close()
    return 0


def _grace_seconds() -> float:
    raw = os.environ.get(GRACE_ENV)
    if raw is None:
        return DEFAULT_GRACE_SECONDS
    seconds = float(raw)
    if not 0 < seconds < float("inf"):
        raise ValueError(f"{GRACE_ENV} must be positive and finite, got {raw!r}")
    return seconds


def _signal_ready() -> None:
    """Tell the starting CLI that the server listens, then detach from its pipe."""
    print("ready", flush=True)
    devnull = os.open(os.devnull, os.O_WRONLY)
    os.dup2(devnull, sys.stdout.fileno())
    os.close(devnull)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))


__all__ = [
    "BROWSER_DISCONNECTED",
    "TOKEN_HEADER",
    "InterviewServer",
    "ServerRunning",
    "create_server",
    "main",
]
