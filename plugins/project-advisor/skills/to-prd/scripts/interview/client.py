"""CLI side of the interview server: start it, reach it, and open the page."""

from __future__ import annotations

import contextlib
import http.client
import json
import os
import subprocess
import sys
import time
import webbrowser
from collections.abc import Iterator
from pathlib import Path
from typing import Any

from .registry import RegistryEntry, prune
from .server import TOKEN_HEADER
from .session import ACTIVE, SessionFiles, SessionState, read_state, server_running

SKILL_DIR = Path(__file__).resolve().parents[2]
PING_SECONDS = 2.0
# `status` checks each registered server this long, so a hung server delays it only briefly.
LIVENESS_SECONDS = 0.5
# A replay waits this long for the server to take its delivery notice, so a hung server
# delays the replay only briefly.
NOTICE_SECONDS = 0.5
STOP_SECONDS = 10.0
STOP_POLL_SECONDS = 0.002
# Tests set this to a file path, and the opener appends each page URL there instead of
# opening a browser.
BROWSER_LOG_ENV = "TO_PRD_INTERVIEW_BROWSER_LOG"


class ServerUnavailable(Exception):
    pass


def page_url(state: SessionState) -> str:
    return f"{base_url(state)}/#token={state['token']}"


def base_url(state: SessionState) -> str:
    return f"http://{state['host']}:{state['port']}"


def server_responds(
    files: SessionFiles, state: SessionState | None, timeout: float | None = None
) -> bool:
    """Return whether the server named by the state answers for this session.

    The token goes out only while the session's server holds its lock, so a process that
    took the port of a stopped server never receives it. The check waits `PING_SECONDS`
    unless `timeout` gives a shorter time.
    """
    if state is None or state["state"] != ACTIVE or "port" not in state:
        return False
    if not server_running(files):
        return False
    try:
        status, body = request(
            state, "GET", "/api/session", timeout=PING_SECONDS if timeout is None else timeout
        )
    except ServerUnavailable:
        return False
    return status == 200 and body.get("session") == str(files.session)


def live_sessions(workspace: Path) -> list[SessionFiles]:
    """Return the sessions of the workspace whose server answers, and drop every registry
    entry, of any workspace, whose server does not."""
    live = prune(_entry_responds)
    return [
        SessionFiles(Path(entry["session"]))
        for entry in live
        if entry["workspace"] == str(workspace.resolve())
    ]


def _entry_responds(entry: RegistryEntry) -> bool:
    """Ask the server with the token from the session's state file, which the registry lacks."""
    files = SessionFiles(Path(entry["session"]))
    try:
        state = read_state(files)
        if state is None or state.get("port") != entry["port"]:
            return False
        return server_responds(files, state, timeout=LIVENESS_SECONDS)
    except OSError, ValueError:
        return False


def start_server(files: SessionFiles) -> SessionState:
    """Start the background server and return the state it wrote."""
    process = subprocess.Popen(
        [
            sys.executable,
            "-m",
            "scripts.interview.server",
            str(files.session),
            str(Path.cwd().resolve()),
        ],
        cwd=SKILL_DIR,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        start_new_session=True,
        text=True,
    )
    assert process.stdout is not None
    with process.stdout:
        ready = process.stdout.readline()
    state = read_state(files)
    if ready.strip() != "ready" or state is None or state.get("pid") != process.pid:
        process.kill()
        process.wait()
        raise ServerUnavailable(f"interview server for {files.session} did not start")
    return state


def end_server(files: SessionFiles, state: SessionState) -> None:
    """Ask the server of an active session to end it, and wait until it releases the lock.

    Only the released lock confirms the end: a request can fail against a server that
    still runs and still accepts its token, and a server records the ended session before
    it stops. The end request carries the token, so it goes out only while the session's
    server holds its lock.
    """
    if state["state"] == ACTIVE and server_running(files):
        with contextlib.suppress(ServerUnavailable):
            request(state, "POST", "/api/end", timeout=PING_SECONDS)
    deadline = time.monotonic() + STOP_SECONDS
    while server_running(files):
        if time.monotonic() >= deadline:
            raise ServerUnavailable(f"interview server of {files.session} did not stop")
        time.sleep(STOP_POLL_SECONDS)


def wait_for_result(state: SessionState, round_id: str) -> dict[str, Any]:
    """Block without a time bound until the server reports a result for the round.

    The server reports `browser_disconnected` once no page was connected for its grace period.
    """
    status, body = request(state, "GET", f"/api/rounds/{round_id}/result", timeout=None)
    if status != 200:
        raise ServerUnavailable(f"interview server answered {status} for round {round_id}")
    return body


def notify_delivery(files: SessionFiles, state: SessionState | None, round_id: str) -> None:
    """Ask the session's server to tell its pages that an ask is about to print the round's answers.

    The notice carries the token, so it goes out only while the session's server holds its
    lock. A server that does not answer misses the notice.
    """
    if state is None or state["state"] != ACTIVE or "port" not in state:
        return
    if not server_running(files):
        return
    with contextlib.suppress(ServerUnavailable):
        request(state, "POST", f"/api/rounds/{round_id}/delivered", timeout=NOTICE_SECONDS)


def request(
    state: SessionState,
    method: str,
    path: str,
    *,
    timeout: float | None,
) -> tuple[int, Any]:
    connection = http.client.HTTPConnection(state["host"], state["port"], timeout=timeout)
    try:
        connection.request(method, path, headers={TOKEN_HEADER: state["token"]})
        response = connection.getresponse()
        return response.status, json.loads(response.read().decode("utf-8"))
    except (OSError, http.client.HTTPException, ValueError) as error:
        raise ServerUnavailable(f"{method} {path} at {base_url(state)} failed: {error}") from error
    finally:
        connection.close()


def open_page(url: str) -> bool:
    log = os.environ.get(BROWSER_LOG_ENV)
    if log:
        with open(log, "a", encoding="utf-8") as stream:
            stream.write(url + "\n")
        return True
    with _output_to_devnull():
        return webbrowser.open(url)


@contextlib.contextmanager
def _output_to_devnull() -> Iterator[None]:
    """Point stdout and stderr at /dev/null while the browser launcher runs.

    The launcher and the browser it starts inherit these descriptors, and anything they
    write would break the rule that stdout holds only the final payload.
    """
    sys.stdout.flush()
    sys.stderr.flush()
    devnull = os.open(os.devnull, os.O_WRONLY)
    saved = [os.dup(1), os.dup(2)]
    try:
        os.dup2(devnull, 1)
        os.dup2(devnull, 2)
        yield
    finally:
        os.dup2(saved[0], 1)
        os.dup2(saved[1], 2)
        for descriptor in (devnull, *saved):
            os.close(descriptor)


__all__ = [
    "ServerUnavailable",
    "base_url",
    "end_server",
    "live_sessions",
    "notify_delivery",
    "open_page",
    "page_url",
    "server_responds",
    "start_server",
    "wait_for_result",
]
