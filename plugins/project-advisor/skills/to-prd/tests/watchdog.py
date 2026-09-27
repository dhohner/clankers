"""Stop a test run whose current test runs past its hard limit.

The test process starts this script with its pid and sends one command per line on stdin:
`arm <seconds> <test id>`, `watch <session dir>` and `disarm`. When an armed limit passes,
the script names the test on stderr, kills the test process, and kills the interview server
of each watched session. When stdin closes without `disarm`, it kills those servers too, so
no server outlives the test process.

The script runs outside the test process, so no exception handler in a test can catch it.
"""

from __future__ import annotations

import contextlib
import os
import select
import signal
import sys
import time
from pathlib import Path

import support  # noqa: F401  # puts the skill directory on sys.path

from scripts.interview.session import SessionFiles, acquire_server_lock

STDIN = 0


def main(argv: list[str]) -> int:
    test_process = int(argv[0])
    deadline: float | None = None
    test = ""
    sessions: list[Path] = []
    pending = b""
    while True:
        timeout = None if deadline is None else max(0.0, deadline - time.monotonic())
        if not select.select([STDIN], [], [], timeout)[0]:
            sys.stderr.write(f"\nwatchdog: {test} ran past its hard limit; stopping the run\n")
            sys.stderr.flush()
            os.kill(test_process, signal.SIGKILL)
            _kill_servers(sessions)
            return 1
        chunk = os.read(STDIN, 4096)
        if not chunk:
            _kill_servers(sessions)
            return 0
        *lines, pending = (pending + chunk).split(b"\n")
        for line in lines:
            command, _, argument = line.decode("utf-8").partition(" ")
            if command == "arm":
                seconds, _, test = argument.partition(" ")
                deadline = time.monotonic() + float(seconds)
            elif command == "watch":
                sessions.append(Path(argument))
            elif command == "disarm":
                deadline, test, sessions = None, "", []


def _kill_servers(sessions: list[Path]) -> None:
    for session in sessions:
        pid = _server_holding(SessionFiles(session))
        if pid is not None:
            with contextlib.suppress(ProcessLookupError):
                os.kill(pid, signal.SIGKILL)


def _server_holding(files: SessionFiles) -> int | None:
    """Return the pid that the held server lock names, or None when no server holds it.

    The lock identifies a server even after the server rewrote the state file at the end.
    """
    if not files.server_lock.exists():
        return None
    descriptor = acquire_server_lock(files)
    if descriptor is not None:
        os.close(descriptor)
        return None
    try:
        return int(files.server_lock.read_text(encoding="utf-8"))
    except OSError, ValueError:
        return None


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
