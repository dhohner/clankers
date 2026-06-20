from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from html.parser import HTMLParser
from pathlib import Path


SKILL_DIR = Path(__file__).resolve().parents[1]
SCRIPT = SKILL_DIR / "scripts" / "generate_prd.py"
EXAMPLE = SKILL_DIR / "examples" / "basic-prd.json"
SOURCE_ASSETS = SKILL_DIR / "bundle" / "assets"


class AnchorParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.ids: list[str] = []
        self.fragment_links: list[str] = []

    def handle_starttag(
        self,
        tag: str,
        attrs: list[tuple[str, str | None]],
    ) -> None:
        attributes = dict(attrs)
        if attributes.get("id"):
            self.ids.append(attributes["id"])
        href = attributes.get("href")
        if tag == "a" and href and href.startswith("#") and len(href) > 1:
            self.fragment_links.append(href[1:])


class GeneratePrdTests(unittest.TestCase):
    def run_generator(
        self,
        manifest: Path,
        output_root: Path,
        *extra_args: str,
    ) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [
                sys.executable,
                str(SCRIPT),
                str(manifest),
                "--output-root",
                str(output_root),
                *extra_args,
            ],
            check=False,
            capture_output=True,
            text=True,
        )

    def test_valid_manifest_generates_complete_bundle_with_copied_assets(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            result = self.run_generator(EXAMPLE, root / "action-items")

            self.assertEqual(result.returncode, 0, result.stderr)
            bundle = root / "action-items" / "PRD-example-review-bundle"
            document = (bundle / "index.html").read_text(encoding="utf-8")

            self.assertIn("<h1>Example PRD Review Bundle</h1>", document)
            self.assertNotIn("{{", document)
            self.assertIn('href="./assets/styles.css"', document)
            self.assertIn('src="./assets/app.js"', document)
            self.assertIn('src="./assets/project-advisor.svg"', document)
            self.assertIn('aria-label="PRD navigation"', document)
            self.assertIn('id="nav-toggle"', document)
            self.assertIn('id="toggle-details"', document)
            self.assertIn('data-review-lens="decisions"', document)
            self.assertIn('id="req-01"', document)
            self.assertIn('href="#req-01"', document)
            self.assertIn('id="dec-01"', document)
            self.assertIn('id="risk-01"', document)
            self.assertIn('id="question-01"', document)
            self.assertIn('id="test-01"', document)
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
            manifest = json.loads(EXAMPLE.read_text(encoding="utf-8"))
            manifest["title"] = '<script>alert("no")</script>'
            manifest_path = root / "manifest.json"
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

            result = self.run_generator(manifest_path, root / "action-items")
            document = (
                root
                / "action-items"
                / "PRD-example-review-bundle"
                / "index.html"
            ).read_text(encoding="utf-8")

            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertNotIn("<script>alert", document)
            self.assertIn("&lt;script&gt;alert", document)

    def test_manifest_content_that_looks_like_template_syntax_is_preserved(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            manifest = json.loads(EXAMPLE.read_text(encoding="utf-8"))
            manifest["title"] = "Keep {{STATUS}} literal"
            manifest_path = root / "manifest.json"
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

            result = self.run_generator(manifest_path, root / "action-items")
            document = (
                root
                / "action-items"
                / "PRD-example-review-bundle"
                / "index.html"
            ).read_text(encoding="utf-8")

            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("<h1>Keep {{STATUS}} literal</h1>", document)

    def test_empty_open_questions_omits_section_and_renumbers_grounding(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            manifest = json.loads(EXAMPLE.read_text(encoding="utf-8"))
            manifest["sections"]["open_questions"] = []
            manifest_path = root / "manifest.json"
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

            result = self.run_generator(manifest_path, root / "action-items")
            document = (
                root
                / "action-items"
                / "PRD-example-review-bundle"
                / "index.html"
            ).read_text(encoding="utf-8")

            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertNotIn('id="open-questions"', document)
            self.assertNotIn('href="#open-questions"', document)
            self.assertIn(
                '<span>10</span><div><h2><a href="#repository-grounding">Repository grounding</a></h2>',
                document,
            )

    def test_review_assets_cover_responsive_navigation_anchor_and_print_behavior(
        self,
    ) -> None:
        script = (SOURCE_ASSETS / "app.js").read_text(encoding="utf-8")
        styles = (SOURCE_ASSETS / "styles.css").read_text(encoding="utf-8")

        self.assertIn('window.matchMedia("(max-width: 900px)")', script)
        self.assertIn('event.key === "Escape"', script)
        self.assertIn('event.key !== "Tab"', script)
        self.assertIn(
            "document.getElementById(decodeURIComponent(hash.slice(1)))",
            script,
        )
        self.assertIn("ResizeObserver", script)
        self.assertNotIn("setTimeout(stopAnchorStabilization", script)
        self.assertIn("focusAnchorTarget(hash)", script)
        self.assertIn('window.addEventListener("beforeprint"', script)
        self.assertIn("detail.open = true", script)
        self.assertIn('window.matchMedia("(prefers-reduced-motion: reduce)")', script)
        self.assertIn("@media (max-width: 900px)", styles)
        self.assertIn("max-height: calc(100vh - 62px)", styles)
        self.assertIn("max-height: calc(100dvh - 62px)", styles)
        self.assertIn("overflow-x: hidden", styles)
        self.assertIn("overflow-wrap: anywhere", styles)
        self.assertIn("@media (prefers-reduced-motion: reduce)", styles)
        self.assertIn("@media print", styles)
        self.assertIn("details.supporting-detail > *:not(summary)", styles)

    def test_invalid_manifest_reports_all_errors_without_creating_bundle(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            manifest_path = root / "invalid.json"
            manifest_path.write_text(
                json.dumps({"schema_version": 2, "slug": "../escape"}),
                encoding="utf-8",
            )

            result = self.run_generator(manifest_path, root / "action-items")

            self.assertNotEqual(result.returncode, 0)
            self.assertIn("schema_version must be the number 1", result.stderr)
            self.assertIn("slug must contain only lowercase", result.stderr)
            self.assertIn("sections must be an object", result.stderr)
            self.assertFalse((root / "action-items" / "PRD-escape").exists())
            self.assertFalse((root / "action-items").exists())

    def test_invalid_json_has_location_and_creates_no_output(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            manifest_path = root / "invalid.json"
            manifest_path.write_text('{"schema_version": 1,}', encoding="utf-8")

            result = self.run_generator(manifest_path, root / "action-items")

            self.assertEqual(result.returncode, 2)
            self.assertIn("line 1, column", result.stderr)
            self.assertFalse((root / "action-items").exists())

    def test_boolean_schema_version_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            manifest = json.loads(EXAMPLE.read_text(encoding="utf-8"))
            manifest["schema_version"] = True
            manifest_path = root / "manifest.json"
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

            result = self.run_generator(manifest_path, root / "action-items")

            self.assertEqual(result.returncode, 2)
            self.assertIn("schema_version must be the number 1", result.stderr)
            self.assertFalse((root / "action-items").exists())

    def test_existing_bundle_requires_force_and_force_replaces_it(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            output_root = root / "action-items"
            first = self.run_generator(EXAMPLE, output_root)
            self.assertEqual(first.returncode, 0, first.stderr)
            sentinel = output_root / "PRD-example-review-bundle" / "old.txt"
            sentinel.write_text("old", encoding="utf-8")

            refused = self.run_generator(EXAMPLE, output_root)
            self.assertEqual(refused.returncode, 2)
            self.assertTrue(sentinel.exists())

            replaced = self.run_generator(EXAMPLE, output_root, "--force")
            self.assertEqual(replaced.returncode, 0, replaced.stderr)
            self.assertFalse(sentinel.exists())
            self.assertTrue(
                (output_root / "PRD-example-review-bundle" / "index.html").exists()
            )

    def test_force_does_not_delete_a_preexisting_backup_named_path(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            output_root = root / "action-items"
            first = self.run_generator(EXAMPLE, output_root)
            self.assertEqual(first.returncode, 0, first.stderr)
            unrelated_backup = output_root / ".PRD-example-review-bundle.backup"
            unrelated_backup.mkdir()
            sentinel = unrelated_backup / "unrelated.txt"
            sentinel.write_text("keep", encoding="utf-8")

            replaced = self.run_generator(EXAMPLE, output_root, "--force")

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

            replaced = self.run_generator(EXAMPLE, output_root, "--force")

            self.assertEqual(replaced.returncode, 0, replaced.stderr)
            self.assertFalse(target.is_symlink())
            self.assertTrue((target / "index.html").exists())
            self.assertEqual(sentinel.read_text(encoding="utf-8"), "keep")


if __name__ == "__main__":
    unittest.main()
