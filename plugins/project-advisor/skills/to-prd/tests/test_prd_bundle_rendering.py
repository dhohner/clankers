from __future__ import annotations

import tempfile
import tracemalloc
import unittest
from pathlib import Path

from support import (
    BUNDLE,
    base_manifest,
    dump_yaml,
    load_example_manifest,
    load_yaml,
    run_generator,
    sample_block,
)


class PrdBundleRenderingTests(unittest.TestCase):
    def test_omitted_open_questions_leave_no_section_or_navigation(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            manifest = load_example_manifest()
            del manifest["blocks"]["open_questions"]
            # The example tree defers a branch to an open question, so the tree
            # cannot outlive the block it points at. Version 1 keeps the tree
            # optional, so the manifest declares the version that allows this.
            del manifest["blocks"]["design_tree"]
            manifest["schema_version"] = 1
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
                f'<section id="{name}" class="cue" data-block="{name}"',
                document,
            )
            self.assertIn(f'data-block-category="{spec.category}"', document)
            self.assertIn(
                f'data-level="{BUNDLE.category_level(spec.category)}"',
                document,
            )
            self.assertIn(f'aria-labelledby="{name}-heading"', document)
        self.assertIn('id="req-01"', document)
        self.assertIn('id="dec-01"', document)
        self.assertIn('id="risk-01"', document)
        self.assertIn('id="question-01"', document)
        self.assertIn('id="test-01"', document)
        self.assertIn("<table><thead><tr><th>ID</th>", document)

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

    def test_diagram_requires_source_or_native_input(self) -> None:
        manifest = base_manifest("workflow-heavy", ["document", "workflow"])
        manifest["blocks"] = {
            "workflow_diagram": {"description": "Actor submits and receives a result."}
        }

        with self.assertRaises(BUNDLE.ManifestError) as raised:
            BUNDLE.validate_manifest(manifest)

        self.assertIn(
            "blocks.workflow_diagram.source must be a non-empty Mermaid string",
            str(raised.exception),
        )

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
        # The frame stays outside the hidden canvas so the zoom controls the
        # script puts there remain reachable while the canvas scrolls.
        self.assertIn('<div class="mermaid-frame"><div class="mermaid-canvas"', document)
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

    def test_native_diagram_input_is_converted_to_mermaid(self) -> None:
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

        normalized = BUNDLE.validate_manifest(manifest)
        document = BUNDLE.render_document(normalized)

        self.assertEqual(
            "flowchart TB\n"
            '  n1["<Client>"]\n'
            '  n2["Gateway"]\n'
            '  n3["Service"]\n'
            "  n1 -->|HTTPS| n2\n"
            "  n2 -->|Route| n3",
            normalized["blocks"]["architecture_diagram"]["source"],
        )
        self.assertIsNone(normalized["blocks"]["architecture_diagram"]["native"])
        self.assertIn('class="diagram-surface mermaid-diagram"', document)
        self.assertIn("&lt;Client&gt;", document)
        self.assertNotIn("<Client>", document)
        self.assertNotIn('class="diagram-surface native-diagram"', document)

    def test_design_tree_renders_one_graph_and_every_node_in_the_decisions_area(self) -> None:
        manifest = base_manifest()
        manifest["blocks"] = {
            "decisions": sample_block("decisions"),
            "design_tree": [
                {
                    "id": "NODE-01",
                    "label": "Output surface",
                    "question": "Where does the design tree get published?",
                    "status": "settled",
                    "answer": "In the generated bundle.",
                    "source": "user",
                    "rationale": "The reviewer already reads the bundle.",
                    "superseded_answer": "In a separate file.",
                    "children": [
                        {
                            "id": "NODE-02",
                            "label": "Graph library",
                            "question": "Which renderer draws the graph?",
                            "status": "settled",
                            "answer": "Mermaid.",
                            "source": "research",
                            "rationale": "The bundle already pins Mermaid.",
                            "evidence": ["bundle/assets/app.js pins mermaid"],
                        },
                        {
                            "id": "NODE-03",
                            "label": "Node styling",
                            "question": "Which colours mark a pruned branch?",
                            "status": "pruned",
                            "reason": "Styling is an implementation choice.",
                        },
                        {
                            "id": "NODE-04",
                            "label": "Depth limit",
                            "question": "How deep may the tree grow?",
                            "status": "deferred",
                            "relates_to": ["QUESTION-01"],
                        },
                    ],
                }
            ],
            "open_questions": [
                {"id": "QUESTION-01", "question": "How deep may a tree grow?"}
            ],
        }

        normalized = BUNDLE.validate_manifest(manifest)
        document = BUNDLE.render_document(normalized)
        source = BUNDLE.tree_mermaid_source(normalized["blocks"]["design_tree"])

        self.assertIn(
            '<section id="design_tree" class="cue" data-block="design_tree"',
            document,
        )
        self.assertIn('data-review-area="decisions"', document)
        self.assertLess(
            document.index('data-block="decisions"'),
            document.index('data-block="design_tree"'),
        )
        self.assertEqual(1, document.count('id="design_tree-mermaid-source"'))
        self.assertEqual(
            "flowchart TB\n"
            '  n1["NODE-01 Output surface"]\n'
            '  n2["NODE-02 Graph library"]\n'
            '  n3[/"NODE-03 Node styling"/]\n'
            '  n4(["NODE-04 Depth limit"])\n'
            "  n1 --> n2\n"
            "  n1 --> n3\n"
            "  n1 --> n4\n"
            "  classDef settled fill:#101a33,stroke:#8497ff,stroke-width:1.4px,color:#e7e9f2\n"
            "  classDef pruned fill:#101018,stroke:#7f87a3,stroke-width:1.2px,"
            "color:#a2a9c2,stroke-dasharray:5 4\n"
            "  classDef deferred fill:#231029,stroke:#ff7bae,stroke-width:1.4px,"
            "color:#ffd7e6,stroke-dasharray:2 3\n"
            "  class n1 settled\n"
            "  class n2 settled\n"
            "  class n3 pruned\n"
            "  class n4 deferred",
            source,
        )
        for identity in ("node-01", "node-02", "node-03", "node-04"):
            self.assertEqual(1, document.count(f'id="{identity}" class="tree-node"'))
        for question in (
            "Where does the design tree get published?",
            "Which renderer draws the graph?",
            "Which colours mark a pruned branch?",
            "How deep may the tree grow?",
        ):
            self.assertIn(question, document)
        self.assertIn("In the generated bundle.", document)
        self.assertIn("<dt>Superseded answer</dt><dd>In a separate file.</dd>", document)
        self.assertIn("<dt>Reason</dt><dd>Styling is an implementation choice.</dd>", document)
        self.assertIn("<dt>Source</dt><dd>Research</dd>", document)
        self.assertIn("<code>bundle/assets/app.js pins mermaid</code>", document)
        self.assertIn('href="#question-01"', document)
        self.assertIn('<span class="tree-status-word">Deferred</span>', document)
        self.assertIn('<ol class="tree-branches">', document)

    def test_a_deep_design_tree_renders_in_memory_proportional_to_its_output(self) -> None:
        depth = 800
        node = {
            "id": f"NODE-{depth:04d}",
            "label": "Leaf",
            "question": "Is the deepest branch still readable?",
            "status": "pruned",
            "reason": "Depth is the point of this fixture.",
        }
        for level in range(depth - 1, 0, -1):
            node = {
                "id": f"NODE-{level:04d}",
                "label": "Branch",
                "question": "Does depth stay proportional?",
                "status": "settled",
                "answer": "Yes.",
                "source": "user",
                "rationale": "Each fragment is emitted once.",
                "children": [node],
            }
        manifest = base_manifest()
        manifest["blocks"] = {"design_tree": [node]}
        normalized = BUNDLE.validate_manifest(manifest)

        tracemalloc.start()
        try:
            document = BUNDLE.render_document(normalized)
            peak = tracemalloc.get_traced_memory()[1]
        finally:
            tracemalloc.stop()

        self.assertEqual(depth, document.count('class="tree-node"'))
        # Keeping a rendered subtree per node made this depth peak above 170 MiB.
        self.assertLess(peak, 32 * 1024 * 1024)

    def test_design_tree_text_stays_escaped_in_the_graph_and_the_list(self) -> None:
        manifest = base_manifest()
        manifest["blocks"] = {
            "design_tree": [
                {
                    "id": "NODE-01",
                    "label": 'The "quoted" <label>',
                    "question": 'Does a | pipe or a <script> tag survive?',
                    "status": "settled",
                    "answer": "Yes.",
                    "source": "user",
                    "rationale": "Both surfaces escape their own syntax.",
                }
            ]
        }

        normalized = BUNDLE.validate_manifest(manifest)
        document = BUNDLE.render_document(normalized)
        source = BUNDLE.tree_mermaid_source(normalized["blocks"]["design_tree"])

        self.assertEqual("flowchart TB\n  n1[\"NODE-01 The 'quoted' <label>\"]\n"
                         "  classDef settled fill:#101a33,stroke:#8497ff,stroke-width:1.4px,"
                         "color:#e7e9f2\n  class n1 settled", source)
        self.assertIn("&lt;script&gt;", document)
        self.assertNotIn("<script> tag survive", document)
        self.assertIn("&lt;label&gt;", document)

    def test_design_tree_survives_generation_and_bundle_revalidation(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            manifest = base_manifest()
            manifest["slug"] = "tree-round-trip"
            manifest["blocks"] = {"design_tree": sample_block("design_tree")}
            manifest_path = root / "manifest.yaml"
            manifest_path.write_text(dump_yaml(manifest), encoding="utf-8")

            result = run_generator(manifest_path, root / "action-items")
            bundle = root / "action-items" / "PRD-tree-round-trip"
            preserved = load_yaml((bundle / "prd.yaml").read_text(encoding="utf-8"))

            self.assertEqual(result.returncode, 0, result.stderr)
            root_node = preserved["blocks"]["design_tree"][0]
            self.assertEqual("node-01", root_node["id"])
            self.assertEqual("Output surface", root_node["label"])
            self.assertEqual("node-02", root_node["children"][0]["id"])
            self.assertEqual(
                "Styling is an implementation choice.",
                root_node["children"][0]["reason"],
            )
            BUNDLE.validate_generated_bundle(bundle)

    def test_a_manifest_without_a_design_tree_still_validates_and_generates(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            manifest = base_manifest()
            manifest["slug"] = "no-tree"
            manifest["blocks"] = {
                name: sample_block(name)
                for name in ("problem", "requirements", "decisions", "testing_strategy")
            }
            manifest_path = root / "manifest.yaml"
            manifest_path.write_text(dump_yaml(manifest), encoding="utf-8")

            result = run_generator(manifest_path, root / "action-items")
            document = (
                root / "action-items" / "PRD-no-tree" / "index.html"
            ).read_text(encoding="utf-8")

            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertNotIn('data-block="design_tree"', document)
            self.assertNotIn('href="#design_tree"', document)

    def test_wireframes_render_as_labeled_read_only_review_aids(self) -> None:
        manifest = base_manifest("ui-heavy", ["document", "ui"])
        manifest["blocks"] = {
            "wireframes": sample_block("wireframes"),
            "annotated_screens": sample_block("annotated_screens"),
        }

        document = BUNDLE.render_document(BUNDLE.validate_manifest(manifest))

        self.assertIn("Wireframe: Review aid", document)
        self.assertIn("Annotated state: Review aid", document)
        self.assertIn("Behavioral intent, not final production design", document)
        self.assertIn('<dl class="review-regions">', document)
        self.assertIn('<div class="review-region">', document)
        self.assertNotIn("screen-chrome", document)

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
        self.assertEqual(
            "flowchart TB\n  n1[\"Service\"]",
            normalized["blocks"]["architecture_diagram"]["source"],
        )
