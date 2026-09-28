from __future__ import annotations

import json
import os
import shutil
import signal
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path
from typing import Any

import support  # noqa: F401  # puts the skill directory on sys.path

from interview_support import TIME_SCALE, TIME_SCALE_ENV, read_time_scale

TESTS_DIR = Path(__file__).resolve().parent
# A hung child run must stop within this time: its start, its time limit, the watchdog
# grace, and the kill.
RUN_BOUND_SECONDS = 3.0 * TIME_SCALE
SERVER_FILE_ENV = "CHILD_SERVER_FILE"

# A server that records the end of its session and then never stops.
STALLED_SERVER = """\
import sys
import threading
from pathlib import Path

import support

from scripts.interview.server import create_server
from scripts.interview.session import SessionFiles

server = create_server(SessionFiles(Path(sys.argv[1])))
server.end_session()
print("ready", flush=True)
threading.Event().wait()
"""

CHILD_TESTS = """\
import json
import os
import subprocess
import sys
import threading
import time
import unittest
from pathlib import Path

from interview_support import (
    TIME_SCALE,
    InterviewHarness,
    InterviewTestCase,
    TimeLimitedTestCase,
)


def block():
    threading.Event().wait()


def name_server(session, pid):
    # The parent may kill this run once the file exists, so the file appears complete.
    server_file = Path(os.environ["CHILD_SERVER_FILE"])
    partial = server_file.with_suffix(".partial")
    partial.write_text(json.dumps({"session": str(session), "pid": pid}))
    os.replace(partial, server_file)


class Hung(TimeLimitedTestCase):
    time_limit_seconds = 0.05
    watchdog_grace_seconds = 0.2

    def test_blocks_in_two_subtests(self):
        for step in ("first", "second"):
            with self.subTest(step):
                block()

    def test_blocks_in_cleanup(self):
        self.addCleanup(block)
        block()


class Finished(TimeLimitedTestCase):
    time_limit_seconds = 0.05
    watchdog_grace_seconds = 0.1

    def test_finishes(self):
        pass


class Slow(unittest.TestCase):
    def test_runs_past_the_hard_limit_of_the_finished_test(self):
        time.sleep(0.3 * TIME_SCALE)


class PastUnscaledLimit(TimeLimitedTestCase):
    time_limit_seconds = 0.1

    # The sleep ends well past the unscaled limit and well before the limit at a scale of
    # 10, so a late alarm on a busy machine does not decide either run.
    def test_sleeps_past_the_unscaled_limit(self):
        time.sleep(0.5)


class WithServer(InterviewTestCase):
    # Start an interview server, and name it in the file the parent reads.
    def start_server(self):
        harness = InterviewHarness(self, self.root, self.session)
        round_file = self.write_round(
            {
                "id": "ROUND-01",
                "questions": [
                    {
                        "node": "NODE-03",
                        "label": "Storage",
                        "question": "Where does the session keep answers?",
                        "multi_select": False,
                        "options": [
                            {"label": "Files", "description": "Files.", "recommended": True}
                        ],
                    }
                ],
            }
        )
        harness.start_ask(round_file).wait_started()
        name_server(self.session, harness.server_pid())


class HungWithServer(WithServer):
    time_limit_seconds = 0.6
    watchdog_grace_seconds = 0.2

    def test_blocks_with_running_server(self):
        self.start_server()
        for step in ("first", "second"):
            with self.subTest(step):
                block()


class WaitingWithServer(WithServer):
    time_limit_seconds = 60

    def test_waits_with_running_server(self):
        self.start_server()
        block()


class HungWithStalledServer(InterviewTestCase):
    time_limit_seconds = 0.3
    watchdog_grace_seconds = 0.2

    def test_blocks_with_server_that_recorded_the_end(self):
        InterviewHarness(self, self.root, self.session)
        server = subprocess.Popen(
            [sys.executable, "stalled_server.py", str(self.session)],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
        )
        server.stdout.readline()
        name_server(self.session, server.pid)
        for step in ("first", "second"):
            with self.subTest(step):
                block()
"""


class HungTestRunTests(unittest.TestCase):
    """A hung interview test stops the test run within a bound instead of stalling it."""

    def setUp(self) -> None:
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        (self.root / "child_tests.py").write_text(CHILD_TESTS, encoding="utf-8")
        (self.root / "stalled_server.py").write_text(STALLED_SERVER, encoding="utf-8")
        self.server_file = self.root / "server.json"

    def run_child(
        self, *tests: str, env: dict[str, str] | None = None
    ) -> subprocess.CompletedProcess[str]:
        process = self.start_child(*tests, env=env)
        try:
            stdout, stderr = process.communicate(timeout=RUN_BOUND_SECONDS)
        except subprocess.TimeoutExpired:
            process.kill()
            process.communicate(timeout=RUN_BOUND_SECONDS)
            self.fail(f"{', '.join(tests)} still runs after {RUN_BOUND_SECONDS} s")
        return subprocess.CompletedProcess(process.args, process.returncode, stdout, stderr)

    def start_child(self, *tests: str, env: dict[str, str] | None = None) -> subprocess.Popen[str]:
        return subprocess.Popen(
            [sys.executable, "-m", "unittest", *(f"child_tests.{test}" for test in tests)],
            cwd=self.root,
            env={
                **os.environ,
                "PYTHONPATH": str(TESTS_DIR),
                SERVER_FILE_ENV: str(self.server_file),
                **(env or {}),
            },
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )

    def test_time_limit_in_subtest_and_block_in_next_subtest_stops_run(self) -> None:
        result = self.run_child("Hung.test_blocks_in_two_subtests")

        self.assertNotEqual(result.returncode, 0, result.stderr)
        self.assertIn("child_tests.Hung.test_blocks_in_two_subtests", result.stderr)

    def test_block_in_cleanup_after_time_limit_stops_run(self) -> None:
        result = self.run_child("Hung.test_blocks_in_cleanup")

        self.assertNotEqual(result.returncode, 0, result.stderr)
        self.assertIn("child_tests.Hung.test_blocks_in_cleanup", result.stderr)

    def test_finished_test_leaves_no_limit_on_later_test(self) -> None:
        result = self.run_child(
            "Finished.test_finishes",
            "Slow.test_runs_past_the_hard_limit_of_the_finished_test",
        )

        self.assertEqual(result.returncode, 0, result.stderr)

    def test_time_scale_multiplies_the_time_limit_of_a_child_run(self) -> None:
        test = "PastUnscaledLimit.test_sleeps_past_the_unscaled_limit"

        unscaled = self.run_child(test, env={TIME_SCALE_ENV: "1"})
        scaled = self.run_child(test, env={TIME_SCALE_ENV: "10"})

        self.assertIn("test ran longer than 0.1 s", unscaled.stderr)
        self.assertEqual(scaled.returncode, 0, scaled.stderr)

    def test_stopped_run_leaves_no_server_running(self) -> None:
        self.addCleanup(self._kill_child_server)

        self.run_child("HungWithServer.test_blocks_with_running_server")

        self.assertFalse(_runs_after_wait(self._child_server()["pid"]), "server still runs")

    def test_stopped_run_leaves_no_server_that_recorded_the_end(self) -> None:
        self.addCleanup(self._kill_child_server)

        self.run_child("HungWithStalledServer.test_blocks_with_server_that_recorded_the_end")

        self.assertFalse(_runs_after_wait(self._child_server()["pid"]), "server still runs")

    def test_run_killed_from_outside_leaves_no_server_running(self) -> None:
        self.addCleanup(self._kill_child_server)
        child = self.start_child("WaitingWithServer.test_waits_with_running_server")
        self._wait_for_server_file(child)

        child.kill()
        child.communicate(timeout=RUN_BOUND_SECONDS)

        self.assertFalse(_runs_after_wait(self._child_server()["pid"]), "server still runs")

    def _wait_for_server_file(self, child: subprocess.Popen[str]) -> None:
        deadline = time.monotonic() + RUN_BOUND_SECONDS
        while not self.server_file.exists():
            if time.monotonic() > deadline or child.poll() is not None:
                child.kill()
                raise AssertionError(f"child started no server: {child.communicate()[1]}")
            time.sleep(0.01)

    def _child_server(self) -> dict[str, Any]:
        return json.loads(self.server_file.read_text(encoding="utf-8"))

    def _kill_child_server(self) -> None:
        """Kill the server of a child run that the watchdog left behind, and its files."""
        if not self.server_file.exists():
            return
        server = self._child_server()
        if _runs_after_wait(server["pid"]):
            os.kill(server["pid"], signal.SIGKILL)
        shutil.rmtree(Path(server["session"]).parent, ignore_errors=True)


class TimeScaleTests(unittest.TestCase):
    def test_reads_scale_and_defaults_to_one(self) -> None:
        cases = {"unset": ({}, 1.0), "whole": ({TIME_SCALE_ENV: "3"}, 3.0)}
        cases["fraction"] = ({TIME_SCALE_ENV: "0.5"}, 0.5)
        for name, (environ, expected) in cases.items():
            with self.subTest(name):
                self.assertEqual(read_time_scale(environ), expected)

    def test_rejects_value_that_is_not_a_positive_finite_number(self) -> None:
        for raw in ("", "fast", "0", "-1", "nan", "inf"):
            with self.subTest(raw), self.assertRaisesRegex(ValueError, TIME_SCALE_ENV):
                read_time_scale({TIME_SCALE_ENV: raw})


def _runs_after_wait(pid: int) -> bool:
    """Return whether the process still runs after a short wait for it to exit."""
    deadline = time.monotonic() + 1.0 * TIME_SCALE
    while time.monotonic() < deadline:
        try:
            os.kill(pid, 0)
        except ProcessLookupError:
            return False
        time.sleep(0.01)
    return True


if __name__ == "__main__":
    unittest.main()
