"""Run the to-prd test modules in parallel, one `unittest` process per module.

Each process keeps its own `SIGALRM` time limit and watchdog, and each interview server
binds its own free port, so modules cannot interfere. The run prints the full output of
every failing module, every skipped test with its reason, and the slowest tests across all
modules, and exits nonzero when any module fails.

Each process runs its tests through this script with `--report`, which writes the test
count, the skips, and the durations as JSON, so the parent never parses `unittest` text.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import tempfile
import time
import unittest
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path

TESTS_DIR = Path(__file__).resolve().parent
SKILL_DIR = TESTS_DIR.parent
MODULE_PATTERN = "test_prd_bundle_*.py"
# The harness self-tests check the time limits and the watchdog through child test runs,
# so `--fast` skips them.
HARNESS_MODULES = ("test_prd_bundle_interview_watchdog", "test_prd_bundle_imports")
# `python -m unittest` exits with this code when a name selects no tests.
NO_TESTS_EXIT = 5


@dataclass(frozen=True)
class Report:
    """What one process ran: its test count, its skipped tests, and each test's seconds."""

    tests_run: int
    skipped: list[tuple[str, str]]
    durations: list[tuple[str, float]]

    @classmethod
    def read(cls, path: Path) -> Report | None:
        """Return the report, or None when the process ended before it wrote one."""
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except FileNotFoundError:
            return None
        return cls(
            tests_run=data["tests_run"],
            skipped=[(test, reason) for test, reason in data["skipped"]],
            durations=[(test, seconds) for test, seconds in data["durations"]],
        )


@dataclass(frozen=True)
class ModuleRun:
    name: str
    returncode: int
    output: str
    seconds: float
    report: Report | None

    @property
    def passed(self) -> bool:
        return self.returncode == 0

    @property
    def tests_run(self) -> int:
        return self.report.tests_run if self.report else 0

    @property
    def skipped(self) -> list[tuple[str, str]]:
        return self.report.skipped if self.report else []

    @property
    def durations(self) -> list[tuple[str, float]]:
        return self.report.durations if self.report else []


def main(argv: list[str]) -> int:
    args = _parse_args(argv)
    if args.report is not None:
        if len(args.names) != 1:
            raise SystemExit("--report takes exactly one module or test name")
        return _run_here(args.names[0], args.report)
    names = args.names or module_names(skip_harness=args.fast)
    started = time.monotonic()
    runs: list[ModuleRun] = []
    with (
        tempfile.TemporaryDirectory() as reports,
        ThreadPoolExecutor(args.jobs or len(names)) as pool,
    ):
        futures = [
            pool.submit(_run_process, name, Path(reports) / f"{index}.json")
            for index, name in enumerate(names)
        ]
        for future in as_completed(futures):
            run = future.result()
            runs.append(run)
            print(f"{'ok' if run.passed else 'FAIL':<4} {run.name}: {_counts(run)}")
    failed = sorted((run for run in runs if not run.passed), key=lambda run: run.name)
    for run in failed:
        print(f"\n{'=' * 70}\n{run.name} exited with {run.returncode}\n{'=' * 70}")
        print(run.output.rstrip())
    skipped = sorted(skip for run in runs for skip in run.skipped)
    _print_skipped(skipped)
    _print_durations(runs, args.durations)
    total = sum(run.tests_run for run in runs)
    print(f"\nRan {_tests(total)} in {time.monotonic() - started:.2f} s")
    outcome = "FAILED" if failed else "OK"
    suffix = f" (skipped={len(skipped)})" if skipped else ""
    if failed:
        print(f"{outcome}{suffix}: {', '.join(run.name for run in failed)}")
        return 1
    print(f"{outcome}{suffix}")
    return 0


def _parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "names",
        nargs="*",
        help="modules or tests to run, such as test_prd_bundle_cli or "
        "test_prd_bundle_cli.Class.test_name; each runs in its own process "
        "(default: every module)",
    )
    parser.add_argument(
        "--fast",
        action="store_true",
        help=f"skip the harness self-tests: {', '.join(HARNESS_MODULES)}",
    )
    parser.add_argument(
        "--durations",
        type=int,
        default=10,
        metavar="N",
        help="show the N slowest tests across all modules, or all with 0 (default: 10)",
    )
    parser.add_argument(
        "--jobs",
        type=_positive_int,
        metavar="N",
        help="run at most N processes at a time (default: all at once)",
    )
    # The parent passes this to each process it starts.
    parser.add_argument("--report", type=Path, help=argparse.SUPPRESS)
    return parser.parse_args(argv)


def _positive_int(raw: str) -> int:
    value = int(raw)
    if value < 1:
        raise argparse.ArgumentTypeError(f"must be at least 1, got {value}")
    return value


def module_names(*, skip_harness: bool) -> list[str]:
    names = sorted(path.stem for path in TESTS_DIR.glob(MODULE_PATTERN))
    if skip_harness:
        names = [name for name in names if name not in HARNESS_MODULES]
    return names


def _run_process(name: str, report: Path) -> ModuleRun:
    # The tests import their helpers, such as `support`, as top-level modules.
    python_path = os.pathsep.join(filter(None, [str(TESTS_DIR), os.environ.get("PYTHONPATH")]))
    started = time.monotonic()
    result = subprocess.run(
        [sys.executable, str(Path(__file__).resolve()), "--report", str(report), name],
        cwd=SKILL_DIR,
        env={**os.environ, "PYTHONPATH": python_path},
        stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        check=False,
    )
    seconds = time.monotonic() - started
    return ModuleRun(name, result.returncode, result.stdout, seconds, Report.read(report))


def _run_here(name: str, report: Path) -> int:
    """Run one module or test in this process as `python -m unittest` would, and report it."""
    result = unittest.main(module=None, argv=["python -m unittest", name], exit=False).result
    data = {
        "tests_run": result.testsRun,
        "skipped": [[str(test), reason] for test, reason in result.skipped],
        "durations": [[test, seconds] for test, seconds in result.collectedDurations],
    }
    report.write_text(json.dumps(data), encoding="utf-8")
    if not result.wasSuccessful():
        return 1
    if result.testsRun == 0 and not result.skipped:
        return NO_TESTS_EXIT
    return 0


def _counts(run: ModuleRun) -> str:
    skipped = f", {len(run.skipped)} skipped" if run.skipped else ""
    return f"{_tests(run.tests_run)}{skipped} in {run.seconds:.2f} s"


def _tests(count: int) -> str:
    return f"{count} test" if count == 1 else f"{count} tests"


def _print_skipped(skipped: list[tuple[str, str]]) -> None:
    if not skipped:
        return
    print(f"\nSkipped tests\n{'-' * 70}")
    for test, reason in skipped:
        print(f"{test}: {reason}")


def _print_durations(runs: list[ModuleRun], count: int) -> None:
    durations = sorted(
        ((seconds, test) for run in runs for test, seconds in run.durations), reverse=True
    )
    if count > 0:
        durations = durations[:count]
    if not durations:
        return
    print(f"\nSlowest test durations\n{'-' * 70}")
    for seconds, test in durations:
        print(f"{seconds:.3f}s  {test}")


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
