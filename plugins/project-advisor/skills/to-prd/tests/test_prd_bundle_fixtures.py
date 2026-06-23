from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from support import load_yaml, SKILL_DIR, run_generator


FIXTURE_DIR = SKILL_DIR / "evals" / "fixtures"


class PrdBundleFixtureTests(unittest.TestCase):
    def test_focused_evaluation_fixtures_generate_new_contract_bundles(self) -> None:
        expected = {
            "document-only.yaml": ("small-feature", ["document"]),
            "ui-heavy.yaml": ("ui-heavy", ["document", "ui"]),
            "workflow-heavy.yaml": ("workflow-heavy", ["document", "workflow"]),
            "api-heavy.yaml": ("api-heavy", ["document", "api"]),
            "data-heavy.yaml": ("data-heavy", ["document", "data"]),
            "architecture-heavy.yaml": (
                "architecture-heavy",
                ["document", "architecture"],
            ),
        }

        with tempfile.TemporaryDirectory() as temporary_directory:
            output_root = Path(temporary_directory) / "action-items"
            for filename, (initiative_type, review_surfaces) in expected.items():
                with self.subTest(filename=filename):
                    fixture = FIXTURE_DIR / filename
                    manifest = load_yaml(fixture.read_text(encoding="utf-8"))
                    result = run_generator(fixture, output_root)

                    self.assertEqual(result.returncode, 0, result.stderr)
                    bundle = output_root / f"PRD-{manifest['slug']}"
                    self.assertTrue((bundle / "index.html").is_file())
                    self.assertTrue((bundle / "assets" / "styles.css").is_file())
                    self.assertTrue((bundle / "assets" / "app.js").is_file())

                    preserved = load_yaml(
                        (bundle / "prd.yaml").read_text(encoding="utf-8")
                    )
                    self.assertEqual(preserved["initiative_type"], initiative_type)
                    self.assertEqual(preserved["review_surfaces"], review_surfaces)
                    self.assertEqual(
                        set(preserved["blocks"]),
                        set(manifest["blocks"]),
                    )
