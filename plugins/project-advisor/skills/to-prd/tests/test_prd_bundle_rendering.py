from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from support import dump_yaml, BUNDLE, base_manifest, load_example_manifest, run_generator, sample_block


class PrdBundleRenderingTests(unittest.TestCase):
    def test_omitted_open_questions_leave_no_section_or_navigation(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            manifest = load_example_manifest()
            del manifest["blocks"]["open_questions"]
            manifest_path = root / "manifest.yaml"
            manifest_path.write_text(dump_yaml(manifest), encoding="utf-8")

            result = run_generator(manifest_path, root / "action-items")
            document = (
                root / "action-items" / "PRD-example-review-bundle" / "index.html"
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
                    manifest_path = root / f"{initiative_type}.yaml"
                    manifest_path.write_text(dump_yaml(manifest), encoding="utf-8")
                    result = run_generator(manifest_path, root / "action-items")
                    self.assertEqual(result.returncode, 0, result.stderr)
                    document = (
                        root / "action-items" / f"PRD-fixture-{index}" / "index.html"
                    ).read_text(encoding="utf-8")
                    for name in selected:
                        self.assertIn(f'data-block="{name}"', document)
                        self.assertIn(f'href="#{name}"', document)
                    omitted = set(BUNDLE.BLOCK_SPECS) - set(selected)
                    for name in omitted:
                        self.assertNotIn(f'data-block="{name}"', document)
                        self.assertNotIn(f'href="#{name}"', document)
                    positions = [document.index(f'data-block="{name}"') for name in selected]
                    catalog_positions = [
                        position
                        for name, position in sorted(
                            zip(selected, positions),
                            key=lambda pair: list(BUNDLE.BLOCK_SPECS).index(pair[0]),
                        )
                    ]
                    self.assertEqual(catalog_positions, sorted(catalog_positions))

    def test_full_catalog_renders_with_stable_semantic_sections(self) -> None:
        manifest = base_manifest("mixed", sorted(BUNDLE.REVIEW_SURFACES))
        manifest["blocks"] = {name: sample_block(name) for name in BUNDLE.BLOCK_SPECS}
        normalized = BUNDLE.validate_manifest(manifest)
        document = BUNDLE.render_document(normalized)

        for name, spec in BUNDLE.BLOCK_SPECS.items():
            self.assertIn(
                f'<section id="{name}" class="section" data-block="{name}"',
                document,
            )
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
        before = BUNDLE.render_document(BUNDLE.validate_manifest(manifest))

        manifest["blocks"]["wireframes"] = sample_block("wireframes")
        manifest["blocks"]["dependencies"] = sample_block("dependencies")
        after = BUNDLE.render_document(BUNDLE.validate_manifest(manifest))

        for identity in ("req-01", "dec-01", "risk-01", "question-01", "test-01"):
            self.assertEqual(before.count(f'id="{identity}"'), 1)
            self.assertEqual(after.count(f'id="{identity}"'), 1)

    def test_diagram_source_is_optional(self) -> None:
        manifest = base_manifest("workflow-heavy", ["document", "workflow"])
        manifest["blocks"] = {
            "workflow_diagram": {"description": "Actor submits and receives a result."}
        }

        normalized = BUNDLE.validate_manifest(manifest)
        document = BUNDLE.render_document(normalized)

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

        normalized = BUNDLE.validate_manifest(manifest)
        document = BUNDLE.render_document(normalized)

        self.assertIn('class="diagram-surface mermaid-diagram"', document)
        self.assertIn('aria-labelledby="workflow_diagram-visual-description"', document)
        self.assertIn("<code>Actor --&gt; Result</code>", document)
        self.assertIn("Diagram source and text fallback", document)

    def test_mermaid_flowcharts_are_normalized_to_top_to_bottom(self) -> None:
        manifest = base_manifest("workflow-heavy", ["document", "workflow"])
        manifest["blocks"] = {
            "workflow_diagram": {
                "description": "Actor submits and receives a result.",
                "source": "flowchart LR\n  A[Actor] --> B[Result]",
            }
        }

        normalized = BUNDLE.validate_manifest(manifest)
        document = BUNDLE.render_document(normalized)

        self.assertEqual(
            "flowchart TB\n  A[Actor] --> B[Result]",
            normalized["blocks"]["workflow_diagram"]["source"],
        )
        self.assertIn("flowchart TB", document)
        self.assertNotIn("flowchart LR", document)

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

        document = BUNDLE.render_document(BUNDLE.validate_manifest(manifest))

        self.assertIn('class="diagram-surface native-diagram"', document)
        self.assertIn("<svg ", document)
        self.assertIn("&lt;Client&gt;", document)
        self.assertNotIn("<Client>", document)
        self.assertIn("Structured HTML and SVG generated from manifest content.", document)

    def test_native_diagram_uses_snake_rows_for_sequential_flows(self) -> None:
        manifest = base_manifest("architecture-heavy", ["document", "architecture"])
        manifest["blocks"] = {
            "architecture_diagram": {
                "description": "A five-step sequential flow.",
                "native": {
                    "nodes": [
                        {"id": "one", "label": "One"},
                        {"id": "two", "label": "Two"},
                        {"id": "three", "label": "Three"},
                        {"id": "four", "label": "Four"},
                        {"id": "five", "label": "Five"},
                    ],
                    "edges": [
                        {"from": "one", "to": "two", "label": "1"},
                        {"from": "two", "to": "three", "label": "2"},
                        {"from": "three", "to": "four", "label": "3"},
                        {"from": "four", "to": "five", "label": "4"},
                    ],
                },
            }
        }

        document = BUNDLE.render_document(BUNDLE.validate_manifest(manifest))

        self.assertIn('<rect x="528" y="151"', document)
        self.assertIn('<rect x="290" y="151"', document)
        self.assertIn('d="M 618 96 L 618 141"', document)
        self.assertNotIn('d="M 618 61 L 142 176"', document)

    def test_wireframes_and_prototype_render_as_labeled_read_only_review_aids(self) -> None:
        manifest = base_manifest("ui-heavy", ["document", "ui"])
        manifest["blocks"] = {
            "wireframes": sample_block("wireframes"),
            "annotated_screens": sample_block("annotated_screens"),
            "prototype": sample_block("prototype"),
        }

        document = BUNDLE.render_document(BUNDLE.validate_manifest(manifest))

        self.assertIn("Wireframe · Review aid", document)
        self.assertIn("Annotated state · Review aid", document)
        self.assertIn('class="prototype prototype-surface"', document)
        self.assertIn('class="prototype-toolbar"', document)
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

        normalized = BUNDLE.validate_manifest(manifest)

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

        document = BUNDLE.render_document(BUNDLE.validate_manifest(manifest))

        self.assertIn(">Ready</button>", document)
        self.assertIn(">Blocked</button>", document)
