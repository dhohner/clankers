from __future__ import annotations

import subprocess
import sys
import unittest
from pathlib import Path

TESTS_DIR = Path(__file__).resolve().parent


class PrdBundleImportTests(unittest.TestCase):
    def test_each_test_module_imports_in_a_fresh_interpreter(self) -> None:
        # Discovery of a single module puts only the tests directory on sys.path,
        # so every module must import support before it imports scripts.
        for module in sorted(TESTS_DIR.glob("test_prd_bundle_*.py")):
            with self.subTest(module=module.stem):
                result = subprocess.run(
                    [sys.executable, "-c", f"import {module.stem}"],
                    check=False,
                    capture_output=True,
                    text=True,
                    cwd=TESTS_DIR,
                )
                self.assertEqual(result.returncode, 0, result.stderr)
