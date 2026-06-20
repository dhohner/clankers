from __future__ import annotations

import json
import importlib.util
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
MODULE_SPEC = importlib.util.spec_from_file_location("generate_prd", SCRIPT)
assert MODULE_SPEC and MODULE_SPEC.loader
GENERATOR = importlib.util.module_from_spec(MODULE_SPEC)
sys.modules[MODULE_SPEC.name] = GENERATOR
MODULE_SPEC.loader.exec_module(GENERATOR)


def sample_block(name: str) -> object:
    spec = GENERATOR.BLOCK_SPECS[name]
    if spec.kind == "problem":
        return {"statement": "A clear problem.", "evidence": ["Observed evidence."]}
    if spec.kind == "scope":
        return {"in": ["Included behavior."], "out": ["Excluded behavior."]}
    if spec.kind == "diagram":
        return {"description": f"{spec.title} description.", "source": "A --> B"}
    if spec.kind == "frames":
        return [
            {
                spec.fields[0]: f"{spec.fields[0].replace('_', ' ')} value",
                spec.fields[1]: f"{spec.fields[1].replace('_', ' ')} value",
                "regions": [
                    {"label": "Primary region", "detail": "Visible review content."}
                ],
            }
        ]
    if spec.kind == "prototype":
        return {
            "description": "Review state changes without saving data.",
            "states": [
                {
                    "label": "Default",
                    "behavior": "The initial read-only state.",
                    "content": [{"label": "Status", "value": "Ready"}],
                },
                {
                    "label": "Blocked",
                    "behavior": "The blocked state explains the next action.",
                    "content": [{"label": "Status", "value": "Needs review"}],
                },
            ],
        }
    if spec.kind == "table":
        return {"columns": ["From", "To"], "rows": [["A", "B"]]}
    if spec.kind == "questions":
        return ["What still needs a decision?"]
    if spec.kind == "list":
        return ["Intentionally excluded outcome."]
    if spec.kind == "code":
        return [
            {
                "reference": "src/example.py",
                "language": "python",
                "code": "result = build()",
                "annotation": "Existing contract evidence.",
            }
        ]
    return [{field: f"{field.replace('_', ' ')} value" for field in spec.fields}]


def base_manifest(
    initiative_type: str = "small-feature",
    surfaces: list[str] | None = None,
) -> dict[str, object]:
    return {
        "schema_version": 1,
        "slug": "catalog-fixture",
        "title": "Catalog fixture",
        "summary": "A focused manifest for block selection tests.",
        "status": "Draft",
        "initiative_type": initiative_type,
        "review_surfaces": surfaces or ["document"],
        "metadata": {"Owner": "Test"},
        "blocks": {},
    }


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

            self.assertIn('<h1 id="document-title">Example PRD Review Bundle</h1>', document)
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
            self.assertIn(
                '<h1 id="document-title">Keep {{STATUS}} literal</h1>',
                document,
            )

    def test_omitted_open_questions_leave_no_section_or_navigation(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            manifest = json.loads(EXAMPLE.read_text(encoding="utf-8"))
            del manifest["blocks"]["open_questions"]
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
            self.assertNotIn('id="open_questions"', document)
            self.assertNotIn('href="#open_questions"', document)
            self.assertIn('data-block="repository_grounding"', document)

    def test_representative_initiatives_render_only_selected_review_blocks(self) -> None:
        fixtures = {
            "ui-heavy": (["document", "ui"], ["problem", "personas", "requirements", "wireframes", "annotated_screens", "testing_strategy"]),
            "workflow-heavy": (["document", "workflow"], ["problem", "personas", "journeys", "workflow_diagram", "state_transition_matrix", "failure_paths"]),
            "api-heavy": (["document", "api"], ["problem", "requirements", "api_contract", "dependencies", "testing_strategy"]),
            "data-heavy": (["document", "data"], ["problem", "requirements", "data_flow_diagram", "data_model", "security_privacy"]),
            "architecture-heavy": (["document", "architecture"], ["problem", "architecture_diagram", "system_context", "decisions", "risks"]),
            "mixed": (["document", "ui", "api", "data"], ["problem", "user_stories", "requirements", "ui_flow", "api_contract", "data_model", "rollout"]),
            "small-feature": (["document"], ["problem", "goals", "requirements", "scope", "testing_strategy"]),
        }
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            for index, (initiative_type, (surfaces, selected)) in enumerate(fixtures.items()):
                with self.subTest(initiative_type=initiative_type):
                    manifest = base_manifest(initiative_type, surfaces)
                    manifest["slug"] = f"fixture-{index}"
                    manifest["blocks"] = {name: sample_block(name) for name in reversed(selected)}
                    manifest_path = root / f"{initiative_type}.json"
                    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
                    result = self.run_generator(manifest_path, root / "action-items")
                    self.assertEqual(result.returncode, 0, result.stderr)
                    document = (
                        root / "action-items" / f"PRD-fixture-{index}" / "index.html"
                    ).read_text(encoding="utf-8")
                    for name in selected:
                        self.assertIn(f'data-block="{name}"', document)
                        self.assertIn(f'href="#{name}"', document)
                    omitted = set(GENERATOR.BLOCK_SPECS) - set(selected)
                    for name in omitted:
                        self.assertNotIn(f'data-block="{name}"', document)
                        self.assertNotIn(f'href="#{name}"', document)
                    positions = [document.index(f'data-block="{name}"') for name in selected]
                    catalog_positions = [
                        position
                        for name, position in sorted(
                            zip(selected, positions),
                            key=lambda pair: list(GENERATOR.BLOCK_SPECS).index(pair[0]),
                        )
                    ]
                    self.assertEqual(catalog_positions, sorted(catalog_positions))

    def test_full_catalog_renders_with_stable_semantic_sections(self) -> None:
        manifest = base_manifest("mixed", sorted(GENERATOR.REVIEW_SURFACES))
        manifest["blocks"] = {
            name: sample_block(name) for name in GENERATOR.BLOCK_SPECS
        }
        normalized = GENERATOR.validate_manifest(manifest)
        document = GENERATOR.render_document(normalized)

        for name, spec in GENERATOR.BLOCK_SPECS.items():
            self.assertIn(f'<section id="{name}" data-block="{name}"', document)
            self.assertIn(f'data-block-category="{spec.category}"', document)
            self.assertIn(f'aria-labelledby="{name}-heading"', document)
        self.assertIn('id="req-01"', document)
        self.assertIn('id="dec-01"', document)
        self.assertIn('id="risk-01"', document)
        self.assertIn('id="question-01"', document)
        self.assertIn('id="test-01"', document)

    def test_optional_blocks_do_not_renumber_stable_entities(self) -> None:
        manifest = base_manifest()
        stable_blocks = ["requirements", "decisions", "risks", "testing_strategy", "open_questions"]
        manifest["blocks"] = {name: sample_block(name) for name in stable_blocks}
        before = GENERATOR.render_document(GENERATOR.validate_manifest(manifest))

        manifest["blocks"]["wireframes"] = sample_block("wireframes")
        manifest["blocks"]["dependencies"] = sample_block("dependencies")
        after = GENERATOR.render_document(GENERATOR.validate_manifest(manifest))

        for identity in ("req-01", "dec-01", "risk-01", "question-01", "test-01"):
            self.assertEqual(before.count(f'id="{identity}"'), 1)
            self.assertEqual(after.count(f'id="{identity}"'), 1)

    def test_invalid_block_name_and_content_report_actionable_paths(self) -> None:
        manifest = base_manifest("api-heavy", ["document", "api"])
        manifest["blocks"] = {
            "api_contract": [{"contract": "GET /items"}],
            "mystery_panel": ["content"],
        }
        with self.assertRaises(GENERATOR.ManifestError) as raised:
            GENERATOR.validate_manifest(manifest)

        message = str(raised.exception)
        self.assertIn("unsupported block name(s): mystery_panel", message)
        self.assertIn("blocks.api_contract[0].behavior must be a non-empty string", message)

    def test_diagram_source_is_optional(self) -> None:
        manifest = base_manifest("workflow-heavy", ["document", "workflow"])
        manifest["blocks"] = {
            "workflow_diagram": {"description": "Actor submits and receives a result."}
        }

        normalized = GENERATOR.validate_manifest(manifest)
        document = GENERATOR.render_document(normalized)

        self.assertIn("Actor submits and receives a result.", document)
        self.assertNotIn("diagram-source", document)

    def test_diagram_text_remains_available_to_assistive_technology(self) -> None:
        manifest = base_manifest("workflow-heavy", ["document", "workflow"])
        manifest["blocks"] = {
            "workflow_diagram": {
                "description": "Actor submits and receives a result.",
                "source": "Actor --> Result",
            }
        }

        normalized = GENERATOR.validate_manifest(manifest)
        document = GENERATOR.render_document(normalized)

        self.assertIn('class="visual-surface diagram-surface mermaid-diagram"', document)
        self.assertIn('aria-labelledby="workflow_diagram-visual-description"', document)
        self.assertIn("<code>Actor --&gt; Result</code>", document)
        self.assertIn("Diagram source and text fallback", document)

    def test_native_diagram_renders_structured_svg_without_executable_markup(self) -> None:
        manifest = base_manifest("architecture-heavy", ["document", "architecture"])
        manifest["blocks"] = {
            "architecture_diagram": {
                "description": "Requests move through the gateway to the service.",
                "native": {
                    "nodes": [
                        {"id": "client", "label": "<Client>"},
                        {"id": "gateway", "label": "Gateway"},
                        {"id": "service", "label": "Service"},
                    ],
                    "edges": [
                        {"from": "client", "to": "gateway", "label": "HTTPS"},
                        {"from": "gateway", "to": "service", "label": "Route"},
                    ],
                },
            }
        }

        document = GENERATOR.render_document(GENERATOR.validate_manifest(manifest))

        self.assertIn('class="visual-surface diagram-surface native-diagram"', document)
        self.assertIn("<svg ", document)
        self.assertIn("&lt;Client&gt;", document)
        self.assertNotIn("<Client>", document)
        self.assertIn("Structured HTML and SVG generated from manifest content.", document)

    def test_native_diagram_rejects_unknown_edge_targets(self) -> None:
        manifest = base_manifest("architecture-heavy", ["document", "architecture"])
        manifest["blocks"] = {
            "architecture_diagram": {
                "description": "Invalid edge fixture.",
                "native": {
                    "nodes": [{"id": "known", "label": "Known"}],
                    "edges": [{"from": "known", "to": "missing", "label": "Route"}],
                },
            }
        }

        with self.assertRaises(GENERATOR.ManifestError) as raised:
            GENERATOR.validate_manifest(manifest)

        self.assertIn(
            "blocks.architecture_diagram.native.edges[0].to must reference a node id",
            str(raised.exception),
        )

    def test_wireframes_and_prototype_render_as_labeled_read_only_review_aids(self) -> None:
        manifest = base_manifest("ui-heavy", ["document", "ui"])
        manifest["blocks"] = {
            "wireframes": sample_block("wireframes"),
            "annotated_screens": sample_block("annotated_screens"),
            "prototype": sample_block("prototype"),
        }

        document = GENERATOR.render_document(GENERATOR.validate_manifest(manifest))

        self.assertIn("Wireframe · Review aid", document)
        self.assertIn("Annotated state · Review aid", document)
        self.assertIn("Prototype · Review aid", document)
        self.assertIn("Behavioral intent, not final production design", document)
        self.assertIn('role="tablist"', document)
        self.assertIn('role="tabpanel"', document)
        self.assertIn('aria-selected="true"', document)
        self.assertIn('aria-selected="false"', document)
        self.assertIn("does not persist data", document)
        self.assertIn('<div class="screen-chrome">', document)
        self.assertNotIn('<div class="screen-chrome" aria-hidden="true">', document)

    def test_optional_visual_collections_accept_explicit_empty_arrays(self) -> None:
        manifest = base_manifest("mixed", ["document", "ui", "architecture"])
        manifest["blocks"] = {
            "wireframes": [
                {
                    "screen": "Review queue",
                    "intent": "Show the empty state.",
                    "regions": [],
                }
            ],
            "prototype": {
                "description": "Review an empty state.",
                "states": [
                    {
                        "label": "Empty",
                        "behavior": "No records are available.",
                        "content": [],
                    }
                ],
            },
            "architecture_diagram": {
                "description": "A standalone service.",
                "native": {
                    "nodes": [{"id": "service", "label": "Service"}],
                    "edges": [],
                },
            },
        }

        normalized = GENERATOR.validate_manifest(manifest)

        self.assertEqual([], normalized["blocks"]["wireframes"][0]["regions"])
        self.assertEqual([], normalized["blocks"]["prototype"]["states"][0]["content"])
        self.assertEqual([], normalized["blocks"]["architecture_diagram"]["native"]["edges"])

    def test_legacy_prototype_state_list_remains_supported(self) -> None:
        manifest = base_manifest("ui-heavy", ["document", "ui"])
        manifest["blocks"] = {
            "prototype": [
                {"state": "Ready", "behavior": "Shows the completed result."},
                {"state": "Blocked", "behavior": "Explains the unresolved dependency."},
            ]
        }

        document = GENERATOR.render_document(GENERATOR.validate_manifest(manifest))

        self.assertIn(">Ready</button>", document)
        self.assertIn(">Blocked</button>", document)

    def test_unknown_manifest_fields_and_reserved_metadata_are_rejected(self) -> None:
        manifest = base_manifest()
        manifest["blocks"] = {"problem": sample_block("problem")}
        manifest["block"] = manifest["blocks"]
        manifest["metadata"] = {
            "Initiative": "Misleading override",
            " owner ": "First",
            "Owner": "Second",
        }

        with self.assertRaises(GENERATOR.ManifestError) as raised:
            GENERATOR.validate_manifest(manifest)

        message = str(raised.exception)
        self.assertIn("block is not a supported manifest field", message)
        self.assertIn(
            "metadata.Initiative is reserved for generated metadata",
            message,
        )
        self.assertIn(
            "metadata contains duplicate label after normalization: Owner",
            message,
        )

    def test_duplicate_json_keys_are_rejected_before_generation(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            manifest_path = root / "duplicate.json"
            manifest_path.write_text(
                '{"schema_version":1,"schema_version":1}',
                encoding="utf-8",
            )

            result = self.run_generator(manifest_path, root / "action-items")

            self.assertEqual(result.returncode, 2)
            self.assertIn(
                "JSON object contains duplicate key(s): schema_version",
                result.stderr,
            )
            self.assertFalse((root / "action-items").exists())

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
        self.assertIn("MERMAID_CDN", script)
        self.assertIn("https://cdn.jsdelivr.net/npm/mermaid@11.15.0/", script)
        self.assertIn('securityLevel: "strict"', script)
        self.assertIn("Diagram rendering unavailable", script)
        self.assertIn("showMermaidFailure(canvas, error)", script)
        self.assertIn("selectPrototypeTab", script)
        self.assertIn('event.key === "ArrowRight"', script)
        self.assertIn("state.hidden = false", script)
        self.assertIn('window.matchMedia("(prefers-reduced-motion: reduce)")', script)
        self.assertIn("@media (max-width: 900px)", styles)
        self.assertIn("max-height: calc(100vh - 62px)", styles)
        self.assertIn("max-height: calc(100dvh - 62px)", styles)
        self.assertIn("overflow-x: hidden", styles)
        self.assertIn("overflow-wrap: anywhere", styles)
        self.assertIn("@media (prefers-reduced-motion: reduce)", styles)
        self.assertIn("@media print", styles)
        self.assertIn("details.supporting-detail > *:not(summary)", styles)
        self.assertIn(".visual-surface", styles)
        self.assertIn(".diagram-canvas svg, .mermaid-canvas svg", styles)
        self.assertIn(".prototype-state[hidden] { display: block; }", styles)
        self.assertIn(".prototype-state::before", styles)

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
            self.assertIn("initiative_type must be a non-empty string", result.stderr)
            self.assertIn("review_surfaces must be a non-empty array", result.stderr)
            self.assertIn("blocks must be a non-empty object", result.stderr)
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
