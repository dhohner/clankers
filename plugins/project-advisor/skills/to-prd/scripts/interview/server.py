"""Background HTTP server for one interview session.

The CLI starts it with `python3 -m scripts.interview.server <session-dir> <workspace>` from
the skill directory, where the workspace is the CLI's working directory. It is not a
documented command. The server prints one `ready` line on stdout once the state file holds
its address and token, and it records itself in the registry of running servers.
"""

from __future__ import annotations

import contextlib
import errno
import hmac
import json
import os
import re
import secrets
import select
import socket
import socketserver
import sys
import threading
import time
from collections.abc import Iterator
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

from ..paths import ASSET_DIR, SOURCE_DIR
from .answers import SubmitError, validate_submit
from .registry import register, unregister
from .rounds import ROUND_ID_PATTERN
from .session import (
    ACTIVE,
    ENDED,
    SessionFiles,
    acquire_server_lock,
    is_delivered,
    open_round_ids,
    read_state,
    record_delivery,
    session_lock,
    store_answers,
    stored_answers,
    stored_round,
    stored_round_ids,
    write_state,
)

HOST = "127.0.0.1"
# A request must name the server by one of these, so a DNS rebinding page gets nothing.
LOOPBACK_NAMES = ("127.0.0.1", "localhost")
TOKEN_HEADER = "X-Interview-Token"
PAGE_DIR = ASSET_DIR / "interview"
CSS = "text/css; charset=utf-8"
WOFF2 = "font/woff2"
# Shared bundle assets and interview-specific assets are explicitly allowlisted;
# interview files stay out of every generated review bundle.
STATIC_FILES = {
    "/": (SOURCE_DIR / "interview.html", "text/html; charset=utf-8"),
    "/assets/interview/app.js": (PAGE_DIR / "app.js", "text/javascript; charset=utf-8"),
    "/assets/interview/styles.css": (PAGE_DIR / "styles.css", CSS),
    "/assets/interview/tokens.css": (PAGE_DIR / "tokens.css", CSS),
    "/assets/interview/fonts/manrope.ttf": (PAGE_DIR / "fonts" / "manrope.ttf", "font/ttf"),
    "/assets/shared/base.css": (ASSET_DIR / "shared" / "base.css", CSS),
    "/assets/styles.css": (ASSET_DIR / "styles.css", CSS),
    "/assets/favicon.svg": (ASSET_DIR / "favicon.svg", "image/svg+xml"),
    "/assets/fonts/archivo-latin.woff2": (ASSET_DIR / "fonts" / "archivo-latin.woff2", WOFF2),
    "/assets/fonts/martian-mono-latin.woff2": (
        ASSET_DIR / "fonts" / "martian-mono-latin.woff2",
        WOFF2,
    ),
}
RESULT_ROUTE = re.compile(r"/api/rounds/(ROUND-[0-9]+)/result")
# `interview ask` posts here once it recorded the delivery of stored answers it is about to print.
DELIVERED_ROUTE = re.compile(r"/api/rounds/(ROUND-[0-9]+)/delivered")
# Holds a full round of answers with long notes; a larger declared body gets 413 unread.
MAX_BODY_BYTES = 1024 * 1024
CONTENT_LENGTH = re.compile(r"[0-9]+")
PAGE_POLICY = (
    "default-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; "
    "form-action 'none'; frame-ancestors 'none'"
)
DRAIN_SECONDS = 5.0
# serve_forever sees a shutdown request only at its next poll, so this bounds how long
# `interview end` waits for the port to close.
SHUTDOWN_POLL_SECONDS = 0.02
# A waiting round returns `browser_disconnected` once no page was connected for this long.
# It covers a browser that starts slowly and a page that reloads.
DEFAULT_GRACE_SECONDS = 15.0
# Tests set this to a shorter grace period in seconds.
GRACE_ENV = "TO_PRD_INTERVIEW_GRACE_SECONDS"
# The server stops itself once it answered no request for this long, unless a waiting
# request or a page with an open round keeps it busy. Its state stays in the session
# directory, so the next command starts it again on the same port with the same token.
DEFAULT_IDLE_SECONDS = 30 * 60.0
# Tests set this to a shorter idle period in seconds.
IDLE_ENV = "TO_PRD_INTERVIEW_IDLE_SECONDS"
BROWSER_DISCONNECTED = "browser_disconnected"
# Page states besides `round_open`; the page shows `ended` from the page stream, because the
# server stops answering once the session ends.
ROUND_OPEN = "round_open"
ROUND_SUBMITTED = "round_submitted"
AGENT_WORKS = "agent_works"
# Events on the page stream: the page reads its state again, or shows the ended session.
CHANGED = "changed"


class ServerRunning(Exception):
    pass


class InterviewServer(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(
        self,
        files: SessionFiles,
        token: str,
        grace_seconds: float = DEFAULT_GRACE_SECONDS,
        idle_seconds: float = DEFAULT_IDLE_SECONDS,
        port: int = 0,
    ) -> None:
        """Bind to `port`, or to a free port when `port` is 0 or in use."""
        ownership = acquire_server_lock(files)
        if ownership is None:
            raise ServerRunning(f"an interview server already runs for {files.session}")
        try:
            # The lock file names its holder, because the end rewrites the state file before
            # the server stops.
            os.ftruncate(ownership, 0)
            os.write(ownership, f"{os.getpid()}\n".encode())
            super().__init__((HOST, port), InterviewHandler, bind_and_activate=False)
            try:
                self._bind(port)
            except BaseException:
                self.socket.close()
                raise
        except BaseException:
            os.close(ownership)
            raise
        self.ownership = ownership
        self.files = files
        self.token = token
        self.grace_seconds = grace_seconds
        self.idle_seconds = idle_seconds
        self.active_at = time.monotonic()
        self.closed = threading.Event()
        self.ended = False
        self.waiters = 0
        self.pages = 0
        self.page_left_at = float("-inf")
        self.condition = threading.Condition()
        # Guards the page streams apart from the condition, so a slow page never holds it.
        self.streams_lock = threading.Lock()
        self.streams: set[Any] = set()

    def server_bind(self) -> None:
        """Bind without the reverse lookup of `HTTPServer.server_bind`.

        `socket.getfqdn` can block for seconds on a machine whose resolver stalls, such as
        a macOS CI runner, and the server never uses the name it returns.
        """
        socketserver.TCPServer.server_bind(self)
        self.server_name = HOST
        self.server_port = self.server_address[1]

    def _bind(self, port: int) -> None:
        try:
            self.server_bind()
        except OSError as error:
            if port == 0 or error.errno != errno.EADDRINUSE:
                raise
            # A failed bind leaves the socket unbound, so it can bind again.
            self.server_address = (HOST, 0)
            self.server_bind()
        self.server_activate()

    def server_close(self) -> None:
        """Close the socket, then release the session to a later server."""
        super().server_close()
        os.close(self.ownership)
        self.closed.set()

    def run(self) -> None:
        """Serve until the session ends or the server is idle, then leave the registry."""
        threading.Thread(target=self._stop_when_idle, daemon=True).start()
        self.serve_forever(poll_interval=SHUTDOWN_POLL_SECONDS)
        self.drain_waiters()
        try:
            unregister(self.files.session)
        finally:
            self.server_close()

    def touch(self) -> None:
        """Restart the idle period, because a page or the CLI sent a request."""
        with self.condition:
            self.active_at = time.monotonic()

    def _stop_when_idle(self) -> None:
        """Stop the server once it stays idle for the idle period.

        The stop holds the session lock until the server is closed, so a CLI command sees
        either the running server or a closed port that it may bind again.
        """
        while True:
            with self.condition:
                if self.ended:
                    return
                remaining = self.active_at + self.idle_seconds - time.monotonic()
                if remaining > 0 or self._busy():
                    self.condition.wait(remaining if remaining > 0 else self.idle_seconds)
                    continue
            with session_lock(self.files):
                with self.condition:
                    idle = not (self.ended or self._busy()) and self._idle_elapsed()
                if not idle:
                    continue
                self.shutdown()
                self.closed.wait()
                return

    def _busy(self) -> bool:
        """Return whether a request waits for a result or a page shows an open round."""
        return self.waiters > 0 or (self.pages > 0 and bool(open_round_ids(self.files)))

    def _idle_elapsed(self) -> bool:
        return time.monotonic() - self.active_at >= self.idle_seconds

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
                self.active_at = time.monotonic()
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
                self.page_left_at = self.active_at = time.monotonic()
                self.condition.notify_all()

    @contextlib.contextmanager
    def page_stream(self, stream: Any) -> Iterator[None]:
        """Send page events on the stream until its connection ends.

        The first line tells the page that it is connected, and it goes out before any
        event, so a page that reads its state after that line misses no change.
        """
        with self.streams_lock:
            stream.write(b": connected\n\n")
            stream.flush()
            self.streams.add(stream)
        try:
            yield
        finally:
            with self.streams_lock:
                self.streams.discard(stream)

    def tell_pages(self, event: str) -> None:
        """Send an event to every connected page; a page that left misses it."""
        message = f"data: {event}\n\n".encode()
        with self.streams_lock:
            for stream in self.streams:
                with contextlib.suppress(OSError):
                    stream.write(message)
                    stream.flush()

    def page_state(self) -> dict[str, Any]:
        """Return the page state with the open round and the answered rounds, newest first."""
        with self.condition:
            open_ids = open_round_ids(self.files)
            history = []
            for round_id in sorted(stored_round_ids(self.files), key=_round_order, reverse=True):
                answers = stored_answers(self.files, round_id)
                if answers is not None:
                    history.append(
                        {"round": stored_round(self.files, round_id), "answers": answers}
                    )
            if open_ids:
                state = ROUND_OPEN
            # Only the newest round counts, so a replay of an earlier round changes nothing.
            elif history and not is_delivered(self.files, history[0]["round"]["id"]):
                state = ROUND_SUBMITTED
            else:
                state = AGENT_WORKS
            return {
                "state": state,
                "session": str(self.files.session),
                "round": stored_round(self.files, open_ids[0]) if open_ids else None,
                "history": history,
            }

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
        # A waiting ask follows a new round, so the page reads its state again.
        self.tell_pages(CHANGED)
        with self.condition:
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

    def deliver(self, round_id: str) -> None:
        """Record that a result request returns the answers of the round to an ask.

        A failed write leaves the page at "round submitted" and still returns the answers.
        """
        with self.condition:
            try:
                record_delivery(self.files, round_id)
            except OSError:
                return
        self.tell_pages(CHANGED)

    def notice_delivery(self, round_id: str) -> tuple[HTTPStatus, dict[str, Any]]:
        """Tell the pages that an ask is about to print the stored answers of the round.

        The delivery record is the only source of the delivered state, so the notice writes
        nothing.
        """
        with self.condition:
            if stored_round(self.files, round_id) is None:
                return HTTPStatus.NOT_FOUND, {"error": "not_found"}
            if stored_answers(self.files, round_id) is None:
                return HTTPStatus.CONFLICT, {"error": "round_open", "round": round_id}
        self.tell_pages(CHANGED)
        return HTTPStatus.OK, {"state": "delivered", "round": round_id}

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
        self.tell_pages(CHANGED)
        return HTTPStatus.OK, {"state": "answered", "round": round_id}

    def end_session(self) -> None:
        with self.condition:
            self.ended = True
            write_state(self.files, {"state": ENDED})
            self.condition.notify_all()
        self.tell_pages(ENDED)

    def drain_waiters(self) -> None:
        with self.condition:
            self.condition.wait_for(lambda: self.waiters == 0, timeout=DRAIN_SECONDS)


class InterviewHandler(BaseHTTPRequestHandler):
    server: InterviewServer

    def handle(self) -> None:
        # Clients can disconnect during any request read or response write.
        with contextlib.suppress(ConnectionError):
            super().handle()

    def log_message(self, format: str, *args: Any) -> None:
        """Keep request logs out of the output, because the server has no log file."""

    def do_GET(self) -> None:
        if not self._host_allowed():
            return
        self.server.touch()
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
        if path == "/api/page":
            self._send_json(HTTPStatus.OK, self.server.page_state())
            return
        if path == "/api/presence":
            self._hold_page_connection()
            return
        result = RESULT_ROUTE.fullmatch(path)
        if result:
            with self.server.waiter():
                outcome = self.server.round_result(result.group(1))
                if outcome is not None:
                    if outcome["state"] == "answered" and not self._client_left():
                        self.server.deliver(result.group(1))
                    self._send_json(HTTPStatus.OK, outcome)
                    return
        self._send_json(HTTPStatus.NOT_FOUND, {"error": "not_found"})

    def do_POST(self) -> None:
        if not (self._host_allowed() and self._origin_allowed() and self._authorized()):
            return
        self.server.touch()
        length = self._declared_length()
        if length is None:
            return
        path = urlsplit(self.path).path
        if path == "/api/answers":
            try:
                body = self._read_json(length)
            except ValueError:
                self._send_json(*_invalid("submit", "is not JSON", "Send the submit as JSON."))
                return
            self._send_json(*self.server.submit(body))
            return
        delivered = DELIVERED_ROUTE.fullmatch(path)
        if delivered:
            self._send_json(*self.server.notice_delivery(delivered.group(1)))
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

        The page sends nothing after its request, so a read returns only at the close. The
        server writes page events on the response meanwhile.
        """
        with self.server.page_connection(), contextlib.suppress(OSError):
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            with self.server.page_stream(self.wfile):
                while self.rfile.read(1):
                    pass

    def _client_left(self) -> bool:
        """Return whether the client closed its connection while its request waited.

        A waiting ask sends nothing after its request, so a readable socket means a close. A
        write to the closed connection would still succeed, so only this check tells that the
        answers reach no ask.
        """
        readable, _, _ = select.select([self.connection], [], [], 0)
        if not readable:
            return False
        try:
            return self.connection.recv(1, socket.MSG_PEEK) == b""
        except OSError:
            return True

    def _host_allowed(self) -> bool:
        """Accept only a single Host header that names the loopback server."""
        hosts = self.headers.get_all("Host") or []
        port = self.server.server_address[1]
        allowed = {form for name in LOOPBACK_NAMES for form in (name, f"{name}:{port}")}
        if len(hosts) == 1 and hosts[0].lower() in allowed:
            return True
        return self._forbid()

    def _origin_allowed(self) -> bool:
        """Accept a write without Origin, which the CLI sends, or from the server's own page."""
        origins = self.headers.get_all("Origin")
        if origins is None:
            return True
        port = self.server.server_address[1]
        allowed = {f"http://{name}:{port}" for name in LOOPBACK_NAMES}
        if len(origins) == 1 and origins[0] in allowed:
            return True
        return self._forbid()

    def _declared_length(self) -> int | None:
        """Return the declared body length, or reject the request before its body is read."""
        lengths = self.headers.get_all("Content-Length") or []
        if not lengths or "Transfer-Encoding" in self.headers:
            self._send_json(HTTPStatus.LENGTH_REQUIRED, {"error": "length_required"})
            return None
        if len(lengths) != 1 or not CONTENT_LENGTH.fullmatch(lengths[0]):
            self._send_json(HTTPStatus.BAD_REQUEST, {"error": "bad_length"})
            return None
        # Python refuses to convert more than 4300 digits, so a long length is measured by
        # its digit count before conversion.
        digits = lengths[0].lstrip("0") or "0"
        if len(digits) > len(str(MAX_BODY_BYTES)) or int(digits) > MAX_BODY_BYTES:
            self._send_json(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, {"error": "body_too_large"})
            return None
        return int(digits)

    def _authorized(self) -> bool:
        if self.server.token_matches(self.headers.get(TOKEN_HEADER, "")):
            return True
        return self._forbid()

    def _forbid(self) -> bool:
        """Reject the request with a body that holds no session data and no token."""
        self._send_json(HTTPStatus.FORBIDDEN, {"error": "forbidden"})
        return False

    def _read_json(self, length: int) -> Any:
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def _send_static(self, path: Path, content_type: str) -> None:
        body = path.read_bytes()
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


def _round_order(round_id: str) -> tuple[int, str]:
    """Order round ids by their number, so ROUND-10 follows ROUND-9."""
    return int(round_id.removeprefix("ROUND-")), round_id


def _invalid(path: str, message: str, fix: str) -> tuple[HTTPStatus, dict[str, Any]]:
    fault = {"path": path, "message": message, "fix": fix}
    return HTTPStatus.BAD_REQUEST, {"error": "invalid_submit", "faults": [fault]}


def create_server(
    files: SessionFiles,
    grace_seconds: float = DEFAULT_GRACE_SECONDS,
    idle_seconds: float = DEFAULT_IDLE_SECONDS,
) -> InterviewServer:
    """Bind the server and record its address and token in the state file."""
    previous = read_state(files)
    token = (previous or {}).get("token") or secrets.token_urlsafe(32)
    # The same port lets a page that is still open reach the server again.
    port = (previous or {}).get("port", 0)
    server = InterviewServer(files, token, grace_seconds, idle_seconds, port)
    host, port = server.server_address[:2]
    write_state(
        files,
        {"state": ACTIVE, "token": token, "host": str(host), "port": int(port), "pid": os.getpid()},
    )
    return server


def main(argv: list[str]) -> int:
    files = SessionFiles(Path(argv[0]))
    server = create_server(
        files,
        _seconds(GRACE_ENV, DEFAULT_GRACE_SECONDS),
        _seconds(IDLE_ENV, DEFAULT_IDLE_SECONDS),
    )
    register(files.session, Path(argv[1]), int(server.server_address[1]))
    _signal_ready()
    server.run()
    return 0


def _seconds(variable: str, default: float) -> float:
    raw = os.environ.get(variable)
    if raw is None:
        return default
    seconds = float(raw)
    if not 0 < seconds < float("inf"):
        raise ValueError(f"{variable} must be positive and finite, got {raw!r}")
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
