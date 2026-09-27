from __future__ import annotations

import contextlib
import io
import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import run_parallel

PASSING_MODULE = """\
import time
import unittest


class Passing(unittest.TestCase):
    def test_sleeps(self):
        time.sleep(0.01)

    def test_returns(self):
        pass
"""

FAILING_MODULE = """\
import unittest


class Failing(unittest.TestCase):
    def test_fails(self):
        self.fail("marker of the failing module")
"""

SKIPPING_MODULE = """\
import unittest


class Skipping(unittest.TestCase):
    @unittest.skip("prerequisite is missing")
    def test_needs_tool(self):
        pass

    def test_runs(self):
        pass
"""

# The process ends before it can write its report, as when the watchdog kills it.
CRASHING_MODULE = """\
import os
import unittest


class Crashing(unittest.TestCase):
    def test_exits(self):
        print("marker of the crashing module", flush=True)
        os._exit(3)
"""

FIXTURES = {
    "runner_passing_fixture": PASSING_MODULE,
    "runner_failing_fixture": FAILING_MODULE,
    "runner_skipping_fixture": SKIPPING_MODULE,
    "runner_crashing_fixture": CRASHING_MODULE,
    "runner_empty_fixture": "",
}


class RunnerTests(unittest.TestCase):
    def setUp(self) -> None:
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        root = Path(temporary.name)
        for name, source in FIXTURES.items():
            (root / f"{name}.py").write_text(source, encoding="utf-8")
        python_path = os.pathsep.join(filter(None, [str(root), os.environ.get("PYTHONPATH")]))
        environment = mock.patch.dict(os.environ, {"PYTHONPATH": python_path})
        environment.start()
        self.addCleanup(environment.stop)

    def run_main(self, *argv: str) -> tuple[int, str]:
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            exit_code = run_parallel.main(list(argv))
        return exit_code, output.getvalue()

    def test_passing_modules_exit_zero_and_list_slowest_tests(self) -> None:
        exit_code, output = self.run_main("runner_passing_fixture", "--durations", "1")

        self.assertEqual(exit_code, 0, output)
        self.assertIn("ok   runner_passing_fixture: 2 tests in", output)
        slowest = output.split("Slowest test durations\n", 1)[1]
        self.assertIn("test_sleeps (runner_passing_fixture.Passing.test_sleeps)", slowest)
        self.assertNotIn("test_returns", slowest)
        self.assertIn("\nRan 2 tests in ", output)
        self.assertTrue(output.endswith("\nOK\n"), output)

    def test_durations_include_tests_faster_than_a_millisecond(self) -> None:
        exit_code, output = self.run_main("runner_passing_fixture.Passing.test_returns")

        self.assertEqual(exit_code, 0, output)
        slowest = output.split("Slowest test durations\n", 1)[1]
        self.assertIn("0.000s  test_returns (runner_passing_fixture.Passing.test_returns)", slowest)

    def test_skipped_tests_are_counted_and_listed_with_reasons(self) -> None:
        exit_code, output = self.run_main("runner_skipping_fixture")

        self.assertEqual(exit_code, 0, output)
        self.assertIn("ok   runner_skipping_fixture: 2 tests, 1 skipped in", output)
        skipped = output.split("Skipped tests\n", 1)[1]
        self.assertIn(
            "test_needs_tool (runner_skipping_fixture.Skipping.test_needs_tool): "
            "prerequisite is missing",
            skipped,
        )
        self.assertTrue(output.endswith("\nOK (skipped=1)\n"), output)

    def test_failing_module_prints_its_output_and_exits_nonzero(self) -> None:
        exit_code, output = self.run_main("runner_passing_fixture", "runner_failing_fixture")

        self.assertEqual(exit_code, 1, output)
        self.assertIn("FAIL runner_failing_fixture: 1 test in", output)
        self.assertIn("ok   runner_passing_fixture: 2 tests in", output)
        self.assertIn("marker of the failing module", output)
        self.assertIn("\nRan 3 tests in ", output)
        self.assertTrue(output.endswith("FAILED: runner_failing_fixture\n"), output)

    def test_module_that_does_not_import_fails_the_run(self) -> None:
        exit_code, output = self.run_main("runner_missing_fixture")

        self.assertEqual(exit_code, 1, output)
        self.assertIn("FAIL runner_missing_fixture", output)
        self.assertIn("runner_missing_fixture", output.split("exited with", 1)[1])

    def test_process_that_ends_without_report_fails_the_run(self) -> None:
        exit_code, output = self.run_main("runner_crashing_fixture")

        self.assertEqual(exit_code, 1, output)
        self.assertIn("FAIL runner_crashing_fixture: 0 tests in", output)
        self.assertIn("runner_crashing_fixture exited with 3", output)
        self.assertIn("marker of the crashing module", output)

    def test_name_that_selects_no_tests_fails_the_run(self) -> None:
        exit_code, output = self.run_main("runner_empty_fixture")

        self.assertEqual(exit_code, 1, output)
        self.assertIn("runner_empty_fixture exited with 5", output)

    def test_fast_run_skips_harness_self_tests(self) -> None:
        full = run_parallel.module_names(skip_harness=False)
        fast = run_parallel.module_names(skip_harness=True)

        self.assertEqual(sorted(set(full) - set(fast)), sorted(run_parallel.HARNESS_MODULES))
        self.assertIn("test_prd_bundle_run_parallel", fast)


if __name__ == "__main__":
    unittest.main()
