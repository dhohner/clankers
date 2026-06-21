from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from support import SKILL_DIR, run_generator


FIXTURE_DIR = SKILL_DIR / "evals" / "fixtures"


class PrdBundleFixtureTests(unittest.TestCase):
    def test_focused_evaluation_fixtures_generate_new_contract_bundles(self) -> None:
        expected = {
            "document-only.json": ("small-feature", ["document"]),
            "ui-heavy.json": ("ui-heavy", ["document", "ui"]),
            "workflow-heavy.json": ("workflow-heavy", ["document", "workflow"]),
            "api-heavy.json": ("api-heavy", ["document", "api"]),
            "data-heavy.json": ("data-heavy", ["document", "data"]),
            "architecture-heavy.json": (
                "architecture-heavy",
                ["document", "architecture"],
            ),
        }

        with tempfile.TemporaryDirectory() as temporary_directory:
            output_root = Path(temporary_directory) / "action-items"
            for filename, (initiative_type, review_surfaces) in expected.items():
                with self.subTest(filename=filename):
                    fixture = FIXTURE_DIR / filename
                    manifest = json.loads(fixture.read_text(encoding="utf-8"))
                    result = run_generator(fixture, output_root)

                    self.assertEqual(result.returncode, 0, result.stderr)
                    bundle = output_root / f"PRD-{manifest['slug']}"
                    self.assertTrue((bundle / "index.html").is_file())
                    self.assertTrue((bundle / "assets" / "styles.css").is_file())
                    self.assertTrue((bundle / "assets" / "app.js").is_file())

                    preserved = json.loads(
                        (bundle / "prd.json").read_text(encoding="utf-8")
                    )
                    self.assertEqual(preserved["initiative_type"], initiative_type)
                    self.assertEqual(preserved["review_surfaces"], review_surfaces)
                    self.assertEqual(
                        set(preserved["blocks"]),
                        set(manifest["blocks"]),
                    )
