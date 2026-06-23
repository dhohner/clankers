from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from support import (
    AnchorParser,
    EXAMPLE,
    SOURCE_ASSETS,
    dump_yaml,
    load_example_manifest,
    load_yaml,
    run_generator,
)


class PrdBundleCliTests(unittest.TestCase):
    def test_valid_manifest_generates_complete_bundle_with_copied_assets(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            result = run_generator(EXAMPLE, root / "action-items")

            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertNotIn("RuntimeWarning", result.stderr)
            bundle = root / "action-items" / "PRD-example-review-bundle"
            document = (bundle / "index.html").read_text(encoding="utf-8")
            preserved_manifest = load_yaml(
                (bundle / "prd.yaml").read_text(encoding="utf-8")
            )

            self.assertIn(
                '<h1 id="document-title">Rich Interactive HTML Output for to-prd</h1>',
                document,
            )
            self.assertIn(
                f"<dt>Output</dt><dd>{bundle}/</dd>",
                document,
            )
            self.assertNotIn("<dt>Initiative</dt>", document)
            self.assertNotIn("<dt>Review surfaces</dt>", document)
            self.assertNotIn("{{", document)
            self.assertIn("default-src 'none'", document)
            self.assertIn('script-src \'self\' https://cdn.jsdelivr.net', document)
            self.assertIn("style-src-elem 'self' 'unsafe-inline'", document)
            self.assertIn("style-src-attr 'unsafe-inline'", document)
            self.assertIn('name="referrer" content="no-referrer"', document)
            self.assertIn('href="./assets/styles.css"', document)
            self.assertIn('src="./assets/app.js"', document)
            self.assertIn('class="brand-mark"', document)
            self.assertIn('aria-label="PRD navigation"', document)
            self.assertIn('id="nav-toggle"', document)
            self.assertIn('id="collapse-all"', document)
            self.assertIn('class="hero-topline"', document)
            self.assertIn('id="req-01"', document)
            self.assertIn('href="#req-01"', document)
            self.assertIn('id="dec-01"', document)
            self.assertIn('id="risk-01"', document)
            self.assertIn('id="question-01"', document)
            self.assertIn('id="test-01"', document)
            self.assertIn('class="metric-grid"', document)
            self.assertIn('class="requirement-list"', document)
            self.assertIn('class="timeline"', document)
            self.assertIn('class="decision-grid"', document)
            self.assertNotIn('class="prototype prototype-surface"', document)
            self.assertNotIn('class="document-header"', document)
            self.assertEqual(preserved_manifest["slug"], "example-review-bundle")
            self.assertEqual(preserved_manifest["schema_version"], 1)

            source_assets = sorted(
                path.relative_to(SOURCE_ASSETS)
                for path in SOURCE_ASSETS.rglob("*")
                if path.is_file()
            )
            generated_assets = sorted(
                path.relative_to(bundle / "assets")
                for path in (bundle / "assets").rglob("*")
                if path.is_file()
            )
            self.assertEqual(generated_assets, source_assets)
            for asset in source_assets:
                self.assertEqual(
                    (bundle / "assets" / asset).read_bytes(),
                    (SOURCE_ASSETS / asset).read_bytes(),
                )

            anchors = AnchorParser()
            anchors.feed(document)
            self.assertEqual(len(anchors.ids), len(set(anchors.ids)))
            self.assertEqual(
                set(anchors.fragment_links) - set(anchors.ids),
                set(),
                "every generated fragment link should resolve to a unique target",
            )

    def test_manifest_content_is_html_escaped(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            manifest = load_example_manifest()
            manifest["title"] = '<script>alert("no")</script>'
            manifest_path = root / "manifest.yaml"
            manifest_path.write_text(dump_yaml(manifest), encoding="utf-8")

            result = run_generator(manifest_path, root / "action-items")
            document = (
                root / "action-items" / "PRD-example-review-bundle" / "index.html"
            ).read_text(encoding="utf-8")

            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertNotIn("<script>alert", document)
            self.assertIn("&lt;script&gt;alert", document)

    def test_manifest_content_that_looks_like_template_syntax_is_preserved(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            manifest = load_example_manifest()
            manifest["title"] = "Keep {{STATUS}} literal"
            manifest_path = root / "manifest.yaml"
            manifest_path.write_text(dump_yaml(manifest), encoding="utf-8")

            result = run_generator(manifest_path, root / "action-items")
            document = (
                root / "action-items" / "PRD-example-review-bundle" / "index.html"
            ).read_text(encoding="utf-8")

            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn(
                '<h1 id="document-title">Keep {{STATUS}} literal</h1>',
                document,
            )

    def test_preserved_manifest_keeps_quoted_metadata_labels(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            manifest = load_example_manifest()
            manifest["metadata"] = {"Owner: team": "A", "Release #": "1"}
            manifest_path = root / "manifest.yaml"
            manifest_path.write_text(dump_yaml(manifest), encoding="utf-8")

            result = run_generator(manifest_path, root / "action-items")
            preserved_manifest = load_yaml(
                (
                    root
                    / "action-items"
                    / "PRD-example-review-bundle"
                    / "prd.yaml"
                ).read_text(encoding="utf-8")
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(preserved_manifest["metadata"], manifest["metadata"])

    def test_duplicate_yaml_keys_are_rejected_before_generation(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            manifest_path = root / "duplicate.yaml"
            manifest_path.write_text(
                "schema_version: 1\nschema_version: 1\n",
                encoding="utf-8",
            )

            result = run_generator(manifest_path, root / "action-items")

            self.assertEqual(result.returncode, 2)
            self.assertIn(
                "YAML mapping contains duplicate key(s): schema_version",
                result.stderr,
            )
            self.assertFalse((root / "action-items").exists())

    def test_invalid_manifest_reports_all_errors_without_creating_bundle(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            manifest_path = root / "invalid.yaml"
            manifest_path.write_text(
                dump_yaml({"schema_version": 2, "slug": "../escape"}),
                encoding="utf-8",
            )

            result = run_generator(manifest_path, root / "action-items")

            self.assertNotEqual(result.returncode, 0)
            self.assertIn("schema_version must be the number 1", result.stderr)
            self.assertIn("slug must contain only lowercase", result.stderr)
            self.assertIn("initiative_type must be a non-empty string", result.stderr)
            self.assertIn("review_surfaces must be a non-empty array", result.stderr)
            self.assertIn("blocks must be a non-empty object", result.stderr)
            self.assertFalse((root / "action-items" / "PRD-escape").exists())
            self.assertFalse((root / "action-items").exists())

    def test_invalid_yaml_has_location_and_creates_no_output(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            manifest_path = root / "invalid.yaml"
            manifest_path.write_text('{"schema_version": 1,}', encoding="utf-8")

            result = run_generator(manifest_path, root / "action-items")

            self.assertEqual(result.returncode, 2)
            self.assertIn("line 1, column", result.stderr)
            self.assertFalse((root / "action-items").exists())

    def test_boolean_schema_version_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            manifest = load_example_manifest()
            manifest["schema_version"] = True
            manifest_path = root / "manifest.yaml"
            manifest_path.write_text(dump_yaml(manifest), encoding="utf-8")

            result = run_generator(manifest_path, root / "action-items")

            self.assertEqual(result.returncode, 2)
            self.assertIn("schema_version must be the number 1", result.stderr)
            self.assertFalse((root / "action-items").exists())

    def test_existing_bundle_requires_force_and_force_replaces_it(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            output_root = root / "action-items"
            first = run_generator(EXAMPLE, output_root)
            self.assertEqual(first.returncode, 0, first.stderr)
            sentinel = output_root / "PRD-example-review-bundle" / "old.txt"
            sentinel.write_text("old", encoding="utf-8")

            refused = run_generator(EXAMPLE, output_root)
            self.assertEqual(refused.returncode, 2)
            self.assertTrue(sentinel.exists())

            replaced = run_generator(EXAMPLE, output_root, "--force")
            self.assertEqual(replaced.returncode, 0, replaced.stderr)
            self.assertFalse(sentinel.exists())
            self.assertTrue(
                (output_root / "PRD-example-review-bundle" / "index.html").exists()
            )

    def test_custom_output_root_is_reflected_in_document_metadata(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            output_root = root / "custom-review-output"

            result = run_generator(EXAMPLE, output_root)

            self.assertEqual(result.returncode, 0, result.stderr)
            bundle = output_root / "PRD-example-review-bundle"
            document = (bundle / "index.html").read_text(encoding="utf-8")
            self.assertIn(
                f"<dt>Output</dt><dd>{bundle}/</dd>",
                document,
            )

    def test_force_does_not_delete_a_preexisting_backup_named_path(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            output_root = root / "action-items"
            first = run_generator(EXAMPLE, output_root)
            self.assertEqual(first.returncode, 0, first.stderr)
            unrelated_backup = output_root / ".PRD-example-review-bundle.backup"
            unrelated_backup.mkdir()
            sentinel = unrelated_backup / "unrelated.txt"
            sentinel.write_text("keep", encoding="utf-8")

            replaced = run_generator(EXAMPLE, output_root, "--force")

            self.assertEqual(replaced.returncode, 0, replaced.stderr)
            self.assertEqual(sentinel.read_text(encoding="utf-8"), "keep")

    def test_force_safely_replaces_a_symlink_target(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            output_root = root / "action-items"
            output_root.mkdir()
            external_directory = root / "external"
            external_directory.mkdir()
            sentinel = external_directory / "sentinel.txt"
            sentinel.write_text("keep", encoding="utf-8")
            target = output_root / "PRD-example-review-bundle"
            target.symlink_to(external_directory, target_is_directory=True)

            replaced = run_generator(EXAMPLE, output_root, "--force")

            self.assertEqual(replaced.returncode, 0, replaced.stderr)
            self.assertFalse(target.is_symlink())
            self.assertTrue((target / "index.html").exists())
            self.assertEqual(sentinel.read_text(encoding="utf-8"), "keep")
