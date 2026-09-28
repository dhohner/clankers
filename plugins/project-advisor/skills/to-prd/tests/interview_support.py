"""Drive `interview` sessions in tests within a small fixed time limit.

Commands run in the test process through `scripts.cli.interview.main`, with stdout and
stderr captured per thread, so a test pays only for the real server process it starts.
`start_ask_process` runs the CLI as its own process for the checks that need one.
"""

from __future__ import annotations

import atexit
import functools
import http.client
import json
import os
import signal
import socket
import subprocess
import sys
import tempfile
import threading
import time
import unittest
import warnings
from collections.abc import Mapping
from pathlib import Path
from typing import Any
from unittest import mock

from support import BROWSER_LOG_ENV, SKILL_DIR, ThreadOutput

from scripts.cli import interview as interview_cli
from scripts.interview.rounds import validate_round
from scripts.interview.server import InterviewServer, create_server
from scripts.interview.session import SessionFiles, store_round

TOKEN_HEADER = "X-Interview-Token"
# A positive factor for every time limit in the tests, such as 3 on a loaded CI runner.
# Child test runs inherit it from the environment, so their limits scale the same way.
TIME_SCALE_ENV = "TO_PRD_TEST_TIME_SCALE"


def read_time_scale(environ: Mapping[str, str]) -> float:
    raw = environ.get(TIME_SCALE_ENV, "1")
    try:
        scale = float(raw)
    except ValueError:
        raise ValueError(f"{TIME_SCALE_ENV} must be a number, got {raw!r}") from None
    if not 0 < scale < float("inf"):
        raise ValueError(f"{TIME_SCALE_ENV} must be positive and finite, got {raw!r}")
    return scale


TIME_SCALE = read_time_scale(os.environ)
# Each test, with its cleanup, must finish within this limit; a test that hangs fails.
# `TimeLimitedTestCase` scales it, so it stays in seconds at a scale of 1.
TEST_LIMIT_SECONDS = 1.0
# The longest a single step, such as a command or a request, may wait.
STEP_SECONDS = 0.8 * TIME_SCALE
# Once the session ends or its server is killed, every command returns within this time.
CLEANUP_SECONDS = 0.2 * TIME_SCALE
# Past its time limit, a test may still stop processes in cleanup; past this grace too,
# the watchdog stops the test run. `TimeLimitedTestCase` scales it as well.
WATCHDOG_GRACE_SECONDS = 2.0
WATCHDOG = Path(__file__).resolve().parent / "watchdog.py"


class TestTimeLimitExceeded(AssertionError):
    pass


class Watchdog:
    """The process of `watchdog.py`, which stops the test run when a test hangs."""

    def __init__(self) -> None:
        self._process = subprocess.Popen(
            [sys.executable, str(WATCHDOG), str(os.getpid())],
            stdin=subprocess.PIPE,
            text=True,
        )
        atexit.register(self._close)

    def arm(self, seconds: float, test: str) -> None:
        self._send(f"arm {seconds} {test}")

    def watch(self, session: Path) -> None:
        self._send(f"watch {session}")

    def disarm(self) -> None:
        self._send("disarm")

    def _send(self, command: str) -> None:
        assert self._process.stdin is not None
        self._process.stdin.write(command + "\n")
        self._process.stdin.flush()

    def _close(self) -> None:
        assert self._process.stdin is not None
        self._process.stdin.close()
        self._process.wait()


@functools.cache
def watchdog() -> Watchdog:
    """Return the one watchdog of the test process."""
    return Watchdog()


class TimeLimitedTestCase(unittest.TestCase):
    """Fail a test that runs, with its cleanup, longer than `time_limit_seconds`.

    The limit interrupts a blocked wait in the main thread once, so a hanging command fails
    the test instead of stalling the run. A subtest catches that failure, and a cleanup can
    block after it, so the watchdog stops the whole run once the test also outlasts
    `watchdog_grace_seconds`.

    Subclasses set both limits in seconds at a scale of 1, and `setUp` multiplies them by
    `TIME_SCALE`.
    """

    time_limit_seconds = TEST_LIMIT_SECONDS
    watchdog_grace_seconds = WATCHDOG_GRACE_SECONDS

    def setUp(self) -> None:
        limit = self.time_limit_seconds * TIME_SCALE
        watchdog().arm(limit + self.watchdog_grace_seconds * TIME_SCALE, self.id())
        self.addCleanup(watchdog().disarm)
        previous = signal.signal(signal.SIGALRM, self._time_limit_exceeded)
        signal.setitimer(signal.ITIMER_REAL, limit)
        self.addCleanup(signal.signal, signal.SIGALRM, previous)
        self.addCleanup(signal.setitimer, signal.ITIMER_REAL, 0)

    def _time_limit_exceeded(self, signum: int, frame: Any) -> None:
        limit = self.time_limit_seconds * TIME_SCALE
        raise TestTimeLimitExceeded(f"test ran longer than {limit:g} s")


class InterviewTestCase(TimeLimitedTestCase):
    """Base case with a temporary session directory."""

    def setUp(self) -> None:
        super().setUp()
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name).resolve()
        self.session = self.root / "session"
        self.session.mkdir()

    def write_round(self, round_: dict[str, Any], name: str = "round.json") -> Path:
        path = self.root / name
        path.write_text(json.dumps(round_), encoding="utf-8")
        return path


class InProcessCommand:
    """One interview command running on its own thread in the test process."""

    def __init__(self, argv: list[str], stdout: ThreadOutput, stderr: ThreadOutput) -> None:
        self.argv = argv
        self._stdout = stdout
        self._stderr = stderr
        self._ready = threading.Event()
        self._done = threading.Event()
        self.returncode: int | None = None
        self._error: BaseException | None = None
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()
        self._ready.wait()

    def _run(self) -> None:
        self.out = self._stdout.capture()
        self.err = self._stderr.capture()
        self._ready.set()
        try:
            self.returncode = interview_cli.main(self.argv)
        # finish() re-raises every exception, including SystemExit from --help, in the test.
        except BaseException as error:  # noqa: BLE001
            self._error = error
        finally:
            self._done.set()

    def wait_started(self) -> str:
        """Return the start line once the command waits, or fail when it ends first."""
        if not self.err.line_written.wait(STEP_SECONDS):
            raise AssertionError(f"ask wrote no start line: {self.out.getvalue()}")
        if self._done.is_set():
            raise AssertionError(f"ask ended with {self.returncode}: {self.out.getvalue()}")
        return self.err.getvalue()

    def is_waiting(self) -> bool:
        return not self._done.is_set()

    def finish(self, timeout: float = STEP_SECONDS) -> subprocess.CompletedProcess[str]:
        if not self._done.wait(timeout):
            raise AssertionError(f"interview {' '.join(self.argv)} is still waiting")
        if self._error is not None:
            raise self._error
        return subprocess.CompletedProcess(
            self.argv, self.returncode, self.out.getvalue(), self.err.getvalue()
        )


class AskProcess:
    """One `interview ask` running as its own process, with stderr in a file."""

    def __init__(self, args: list[str], env: dict[str, str], stderr_path: Path) -> None:
        self.stderr_path = stderr_path
        self._stderr = stderr_path.open("w", encoding="utf-8")
        self.process = subprocess.Popen(
            args,
            cwd=SKILL_DIR,
            env=env,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=self._stderr,
            text=True,
        )

    def wait_started(self) -> str:
        deadline = time.monotonic() + STEP_SECONDS
        while time.monotonic() < deadline:
            text = self.stderr_path.read_text(encoding="utf-8")
            if text.endswith("\n"):
                return text
            if self.process.poll() is not None:
                raise AssertionError(f"ask exited with {self.process.returncode}: {text}")
            time.sleep(0.002)
        raise AssertionError("ask wrote no start line")

    def finish(self) -> subprocess.CompletedProcess[str]:
        try:
            stdout, _ = self.process.communicate(timeout=STEP_SECONDS)
        finally:
            self.stop()
        stderr = self.stderr_path.read_text(encoding="utf-8")
        return subprocess.CompletedProcess(
            self.process.args, self.process.returncode, stdout, stderr
        )

    def stop(self) -> None:
        if self.process.poll() is None:
            self.process.kill()
            self.process.communicate()
        if self.process.stdout is not None:
            self.process.stdout.close()
        self._stderr.close()


class InterviewHarness:
    """Run interview commands for one session and end the session in test cleanup."""

    def __init__(self, test: unittest.TestCase, root: Path, session: Path) -> None:
        self.root = root
        self.session = session
        watchdog().watch(session)
        self.browser_log = root / "browser.log"
        self.process_env = {**os.environ, BROWSER_LOG_ENV: str(self.browser_log)}
        self.commands: list[InProcessCommand] = []
        self.processes: list[AskProcess] = []
        self.server_pids: list[int] = []
        self.paused_pids: list[int] = []
        # The server outlives the command that starts it, so its Popen handle is dropped
        # while the process runs.
        warnings.filterwarnings("ignore", r"subprocess \d+ is still running", ResourceWarning)
        self.stdout = ThreadOutput(sys.stdout)
        self.stderr = ThreadOutput(sys.stderr)
        # Cleanups run in reverse, so the session ends before the streams and env return.
        test.addCleanup(setattr, sys, "stderr", sys.stderr)
        test.addCleanup(setattr, sys, "stdout", sys.stdout)
        sys.stdout, sys.stderr = self.stdout, self.stderr
        environment = mock.patch.dict(os.environ, {BROWSER_LOG_ENV: str(self.browser_log)})
        environment.start()
        test.addCleanup(environment.stop)
        # Each cleanup runs even when an earlier one fails, so a hanging `end` still leaves
        # no server process behind.
        test.addCleanup(self._stop_leftovers)
        test.addCleanup(self._end_session)
        test.addCleanup(self._resume_paused)

    @property
    def state_file(self) -> Path:
        return self.session / "interview" / "state.json"

    @property
    def rounds_dir(self) -> Path:
        return self.session / "interview" / "rounds"

    def start(self, command: str, *extra: str) -> InProcessCommand:
        running = InProcessCommand([command, str(self.session), *extra], self.stdout, self.stderr)
        self.commands.append(running)
        return running

    def run(self, command: str, *extra: str) -> subprocess.CompletedProcess[str]:
        return self.start(command, *extra).finish()

    def ask(self, round_file: Path) -> subprocess.CompletedProcess[str]:
        return self.run("ask", str(round_file))

    def start_ask(self, round_file: Path) -> InProcessCommand:
        return self.start("ask", str(round_file))

    def start_ask_process(self, round_file: Path) -> AskProcess:
        args = [sys.executable, "-m", "scripts", "interview", "ask"]
        ask = AskProcess(
            [*args, str(self.session), str(round_file)],
            self.process_env,
            self.root / f"ask-{len(self.processes)}.stderr",
        )
        self.processes.append(ask)
        return ask

    def end(self) -> subprocess.CompletedProcess[str]:
        return self.run("end")

    def browser_calls(self) -> list[str]:
        if not self.browser_log.exists():
            return []
        return self.browser_log.read_text(encoding="utf-8").splitlines()

    def state(self) -> dict[str, Any]:
        return json.loads(self.state_file.read_text(encoding="utf-8"))

    def token(self) -> str:
        return self.state()["token"]

    def port(self) -> int:
        return self.state()["port"]

    def server_pid(self) -> int:
        return self.state()["pid"]

    def kill_server(self) -> int:
        pid = self.server_pid()
        os.kill(pid, signal.SIGKILL)
        if not wait_for_exit(pid):
            raise AssertionError(f"server {pid} still runs after SIGKILL")
        return pid

    def pause_server(self) -> int:
        """Stop the server with SIGSTOP, so it holds the session but answers no request."""
        pid = self.server_pid()
        os.kill(pid, signal.SIGSTOP)
        self.paused_pids.append(pid)
        # A paused server that survives the session end is killed with the leftovers.
        self.server_pids.append(pid)
        return pid

    def resume_server(self, pid: int) -> None:
        os.kill(pid, signal.SIGCONT)
        self.paused_pids.remove(pid)

    def request(self, *args: Any, **kwargs: Any) -> tuple[int, Any]:
        if "port" not in kwargs:
            kwargs["port"] = self.port()
        return request(*args, **kwargs)

    def submit(self, body: Any, token: str | None = "") -> tuple[int, Any]:
        """Submit answers with the session token, or with the given token or no token."""
        token = self.token() if token == "" else token
        return self.request("POST", "/api/answers", token=token, body=body)

    def _end_session(self) -> None:
        state = self.state() if self.state_file.exists() else {}
        if "pid" not in state:
            return
        # The pid stays listed until the session ends, so a failed end leaves it to be killed.
        self.server_pids.append(state["pid"])
        self.end()
        wait_for_exit(state["pid"])
        self.server_pids.remove(state["pid"])

    def _resume_paused(self) -> None:
        for pid in list(self.paused_pids):
            self.resume_server(pid)

    def _stop_leftovers(self) -> None:
        for pid in self.server_pids:
            if _is_running_child(pid):
                os.kill(pid, signal.SIGKILL)
                wait_for_exit(pid)
        for process in self.processes:
            process.stop()
        for command in self.commands:
            command.finish(CLEANUP_SECONDS)


class ServerFixture:
    """The interview server on a thread of the test process, for route checks."""

    def __init__(self, test: unittest.TestCase, session: Path, round_: dict[str, Any]) -> None:
        self.files = SessionFiles(session)
        store_round(self.files, validate_round(round_))
        self.server: InterviewServer = create_server(self.files)
        self.token = self.server.token
        self.port = int(self.server.server_address[1])
        self._thread = threading.Thread(
            target=self.server.serve_forever, kwargs={"poll_interval": 0.002}, daemon=True
        )
        self._thread.start()
        self._stopped = False
        test.addCleanup(self.stop)

    def request(self, *args: Any, **kwargs: Any) -> tuple[int, Any]:
        return request(*args, port=self.port, **kwargs)

    def submit(self, body: Any, token: str | None = "") -> tuple[int, Any]:
        token = self.token if token == "" else token
        return self.request("POST", "/api/answers", token=token, body=body)

    def stored_answers(self) -> list[Path]:
        return sorted(self.files.answers.glob("*")) if self.files.answers.exists() else []

    def wait_for_waiters(self, count: int) -> None:
        """Wait until the server holds this many result requests open."""
        deadline = time.monotonic() + STEP_SECONDS
        while self.server.waiters != count:
            if time.monotonic() > deadline:
                raise AssertionError(f"server holds {self.server.waiters} waiting requests")
            time.sleep(0.001)

    def stop(self) -> None:
        """Stop the server and release its lock; later calls do nothing."""
        if self._stopped:
            return
        self._stopped = True
        self.server.shutdown()
        self._thread.join(STEP_SECONDS)
        self.server.server_close()


class PortSquatter:
    """Another process's socket on a port, which records every request and answers none."""

    def __init__(self, test: unittest.TestCase, port: int) -> None:
        self._listener = socket.socket()
        # A stopped server's connections may leave the port in TIME_WAIT.
        self._listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self._listener.bind(("127.0.0.1", port))
        self._listener.listen()
        self._listener.settimeout(0.01)
        self._chunks: list[bytes] = []
        self._stopped = threading.Event()
        self._thread = threading.Thread(target=self._accept, daemon=True)
        self._thread.start()
        test.addCleanup(self.received)

    def _accept(self) -> None:
        while not self._stopped.is_set():
            try:
                connection, _ = self._listener.accept()
            except TimeoutError:
                continue
            with connection:
                connection.settimeout(CLEANUP_SECONDS)
                try:
                    self._chunks.append(connection.recv(65536))
                except OSError:
                    pass

    def received(self) -> bytes:
        """Stop listening and return the bytes of every request received."""
        self._stopped.set()
        self._thread.join(STEP_SECONDS)
        self._listener.close()
        return b"".join(self._chunks)


def request(
    method: str,
    path: str,
    *,
    port: int,
    token: str | None = None,
    body: Any = None,
) -> tuple[int, Any]:
    """Send one request and return the status and the decoded JSON body, or the text."""
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=STEP_SECONDS)
    headers = {"Content-Type": "application/json"}
    if token is not None:
        headers[TOKEN_HEADER] = token
    payload = None if body is None else json.dumps(body).encode("utf-8")
    try:
        connection.request(method, path, body=payload, headers=headers)
        response = connection.getresponse()
        data = response.read().decode("utf-8")
        content_type = response.getheader("Content-Type", "")
    finally:
        connection.close()
    if content_type.startswith("application/json"):
        return response.status, json.loads(data)
    return response.status, data


def wait_for_exit(pid: int) -> bool:
    deadline = time.monotonic() + STEP_SECONDS
    while time.monotonic() < deadline:
        if not _running(pid):
            return True
        time.sleep(0.002)
    return False


def _running(pid: int) -> bool:
    """Return whether the process runs, and reap it when it is a child of the test process."""
    try:
        return os.waitpid(pid, os.WNOHANG)[0] != pid
    except ChildProcessError:
        try:
            os.kill(pid, 0)
        except ProcessLookupError:
            return False
        return True


def _is_running_child(pid: int) -> bool:
    """Return whether the pid is a running child of the test process, so killing it is safe."""
    try:
        return os.waitpid(pid, os.WNOHANG) == (0, 0)
    except ChildProcessError:
        return False
