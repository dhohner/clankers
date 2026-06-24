from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from support import dump_yaml, BUNDLE


class PrdBundleOutputValidationTests(unittest.TestCase):
    def _write_minimum_bundle(self, root: Path, html: str) -> None:
        (root / "index.html").write_text(html, encoding="utf-8")
        (root / "prd.yaml").write_text(
            dump_yaml(
                {
                    "schema_version": 1,
                    "slug": "fixture",
                    "title": "Fixture",
                    "summary": "Fixture summary",
                    "status": "Draft",
                    "initiative_type": "small-feature",
                    "review_surfaces": ["document"],
                    "metadata": {"Owner": "Test"},
                    "blocks": {
                        "problem": {
                            "statement": "A clear problem.",
                            "evidence": ["Observed evidence."],
                        }
                    },
                }
            ),
            encoding="utf-8",
        )

    def test_validates_required_files_anchors_and_local_assets(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            assets = root / "assets"
            assets.mkdir()
            (assets / "styles.css").write_text("", encoding="utf-8")
            self._write_minimum_bundle(
                root,
                '<h1 id="document-title">Fixture</h1>'
                '<h2 id="summary">Summary</h2>'
                '<section id="problem"><h2 id="problem-heading">Problem</h2></section>'
                '<a href="#summary">Summary</a>'
                '<link rel="stylesheet" href="./assets/styles.css">',
            )

            BUNDLE.validate_generated_bundle(root)

    def test_reports_duplicate_ids_broken_anchors_and_missing_assets(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            self._write_minimum_bundle(
                root,
                '<h1 id="document-title">Fixture</h1>'
                '<h2 id="duplicate">One</h2>'
                '<h2 id="duplicate">Two</h2>'
                '<a href="#missing">Missing</a>'
                '<script src="./assets/missing.js"></script>',
            )

            with self.assertRaises(BUNDLE.BundleValidationError) as raised:
                BUNDLE.validate_generated_bundle(root)

            message = str(raised.exception)
            self.assertIn("duplicate IDs: duplicate", message)
            self.assertIn("broken anchors: missing", message)
            self.assertIn("missing asset: ./assets/missing.js", message)

    def test_reports_manifest_content_missing_from_rendered_html(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            (root / "index.html").write_text(
                '<h1 id="document-title">Fixture</h1>',
                encoding="utf-8",
            )
            (root / "prd.yaml").write_text(
                dump_yaml(
                    {
                        "schema_version": 1,
                        "slug": "fixture",
                        "title": "Fixture",
                        "summary": "Fixture summary",
                        "status": "Draft",
                        "initiative_type": "small-feature",
                        "review_surfaces": ["document"],
                        "metadata": {"Owner": "Test"},
                        "blocks": {
                            "requirements": [
                                {
                                    "title": "Portable bundle",
                                    "description": "Assets resolve locally.",
                                    "validation": ["TEST-01"],
                                }
                            ],
                            "testing_strategy": [
                                {
                                    "id": "TEST-01",
                                    "target": "Asset links",
                                    "expected_outcome": "Every local asset exists.",
                                    "validates": ["REQ-01"],
                                }
                            ],
                        },
                    }
                ),
                encoding="utf-8",
            )

            with self.assertRaises(BUNDLE.BundleValidationError) as raised:
                BUNDLE.validate_generated_bundle(root)

            message = str(raised.exception)
            self.assertIn(
                "missing rendered block section(s): requirements, testing_strategy",
                message,
            )
            self.assertIn(
                "missing rendered entity anchor(s): req-01, test-01",
                message,
            )

    def test_validates_preserved_manifest_contract(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            self._write_minimum_bundle(root, '<h1 id="document-title">Fixture</h1>')
            (root / "prd.yaml").write_text(
                dump_yaml({"schema_version": 1, "slug": "fixture"}),
                encoding="utf-8",
            )

            with self.assertRaises(BUNDLE.BundleValidationError) as raised:
                BUNDLE.validate_generated_bundle(root)

            self.assertIn("does not match the manifest contract", str(raised.exception))
