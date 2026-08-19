from __future__ import annotations

import sys
import unittest

from support import BUNDLE, EVIDENCE_REFERENCE, base_manifest

from scripts.render.traceability import coverage_report


DESIGN_TREE_ROOT = {
    "id": "NODE-01",
    "label": "Output surface",
    "question": "Where does the design tree get published?",
    "status": "settled",
    "answer": "In the generated bundle.",
    "source": "user",
    "rationale": "The reviewer already reads the bundle.",
}


def design_tree_manifest(nodes: list[dict], **blocks: object) -> dict:
    manifest = base_manifest()
    manifest["blocks"] = {"design_tree": nodes, **blocks}
    return manifest


def design_tree_errors(nodes: list[dict], **blocks: object) -> str:
    try:
        BUNDLE.validate_manifest(design_tree_manifest(nodes, **blocks))
    except BUNDLE.ManifestError as error:
        return str(error)
    return ""


class PrdBundleValidationTests(unittest.TestCase):
    def test_manifest_versions_gate_only_the_design_tree_requirement(self) -> None:
        version_two = design_tree_manifest([dict(DESIGN_TREE_ROOT)])
        version_two["schema_version"] = 2
        version_one_with_tree = design_tree_manifest([dict(DESIGN_TREE_ROOT)])
        version_one_without_tree = base_manifest()
        version_one_without_tree["blocks"] = {"non_goals": ["An excluded outcome."]}
        version_two_without_tree = base_manifest()
        version_two_without_tree["schema_version"] = 2
        version_two_without_tree["blocks"] = {"non_goals": ["An excluded outcome."]}

        self.assertEqual(
            BUNDLE.validate_manifest(version_two)["schema_version"],
            2,
        )
        self.assertEqual(
            BUNDLE.validate_manifest(version_one_with_tree)["schema_version"],
            1,
        )
        self.assertEqual(
            BUNDLE.validate_manifest(version_one_without_tree)["schema_version"],
            1,
        )
        with self.assertRaises(BUNDLE.ManifestError) as failure:
            BUNDLE.validate_manifest(version_two_without_tree)
        self.assertEqual(
            failure.exception.errors,
            ["blocks.design_tree is required by schema_version 2"],
        )

    def test_validation_module_normalizes_traceability_ids_directly(self) -> None:
        manifest = base_manifest()
        manifest["blocks"] = {
            "requirements": [
                {
                    "id": "REQ-Portability",
                    "title": "Portable bundle",
                    "description": "Assets resolve locally.",
                    "validation": ["TEST-assets"],
                }
            ],
            "testing_strategy": [
                {
                    "id": "TEST-assets",
                    "target": "Local asset links",
                    "expected_outcome": "Every required file exists in the bundle.",
                    "validates": ["REQ-Portability"],
                }
            ],
        }

        normalized = BUNDLE.validate_manifest(manifest)

        requirement = normalized["blocks"]["requirements"][0]
        test_case = normalized["blocks"]["testing_strategy"][0]
        self.assertEqual("req-portability", requirement["id"])
        self.assertEqual("REQ-PORTABILITY", requirement["label"])
        self.assertEqual(["test-assets"], requirement["validation"])
        self.assertEqual("test-assets", test_case["id"])

    def test_invalid_block_name_and_content_report_actionable_paths(self) -> None:
        manifest = base_manifest("api-heavy", ["document", "api"])
        manifest["blocks"] = {
            "api_contract": [{"contract": "GET /items"}],
            "mystery_panel": ["content"],
        }
        with self.assertRaises(BUNDLE.ManifestError) as raised:
            BUNDLE.validate_manifest(manifest)

        message = str(raised.exception)
        self.assertIn("unsupported block name(s): mystery_panel", message)
        self.assertIn("blocks.api_contract[0].behavior must be a non-empty string", message)

    def test_initiative_type_must_match_review_surfaces(self) -> None:
        ui_manifest = base_manifest("ui-heavy", ["document", "api"])
        ui_manifest["blocks"] = {
            "problem": {"statement": "A clear problem.", "evidence": ["Observed evidence."]}
        }
        with self.assertRaises(BUNDLE.ManifestError) as raised_ui:
            BUNDLE.validate_manifest(ui_manifest)
        self.assertIn(
            "initiative_type ui-heavy requires review_surfaces: ui",
            str(raised_ui.exception),
        )

        mixed_manifest = base_manifest("mixed", ["document"])
        mixed_manifest["blocks"] = ui_manifest["blocks"]
        with self.assertRaises(BUNDLE.ManifestError) as raised_mixed:
            BUNDLE.validate_manifest(mixed_manifest)
        self.assertIn(
            "initiative_type mixed requires at least two non-document review surfaces",
            str(raised_mixed.exception),
        )

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

        with self.assertRaises(BUNDLE.ManifestError) as raised:
            BUNDLE.validate_manifest(manifest)

        self.assertIn(
            "blocks.architecture_diagram.native.edges[0].to must reference a node id",
            str(raised.exception),
        )

    def test_traceability_accepts_generated_labels_and_empty_optional_lists(self) -> None:
        manifest = base_manifest()
        manifest["blocks"] = {
            "requirements": [
                {
                    "id": "REQ-01",
                    "label": "REQ-01",
                    "title": "Portable bundle",
                    "description": "Assets resolve locally.",
                    "validation": ["TEST-01"],
                    "evidence": [],
                }
            ],
            "testing_strategy": [
                {
                    "id": "TEST-01",
                    "label": "TEST-01",
                    "target": "Asset links",
                    "expected_outcome": "Every local asset exists.",
                    "validates": ["REQ-01"],
                    "relates_to": [],
                    "evidence": [],
                }
            ],
        }

        normalized = BUNDLE.validate_manifest(manifest)

        self.assertEqual([], normalized["blocks"]["requirements"][0]["evidence"])
        self.assertEqual("REQ-01", normalized["blocks"]["requirements"][0]["label"])

    def test_traceability_relationships_and_repository_evidence_render(self) -> None:
        manifest = base_manifest()
        manifest["blocks"] = {
            "requirements": [
                {
                    "id": "REQ-PORTABLE",
                    "title": "Portable bundle",
                    "description": "Assets resolve locally.",
                    "validation": ["TEST-ASSETS"],
                    "relates_to": ["DEC-STDLIB"],
                    "evidence": [EVIDENCE_REFERENCE],
                }
            ],
            "decisions": [
                {
                    "id": "DEC-STDLIB",
                    "decision": "Use the standard library.",
                    "rationale": "Keep generation portable.",
                    "relates_to": ["REQ-PORTABLE"],
                }
            ],
            "risks": [
                {
                    "id": "RISK-PARTIAL",
                    "risk": "Partial output can mislead reviewers.",
                    "mitigation": "Publish after validation.",
                    "relates_to": ["REQ-PORTABLE"],
                }
            ],
            "testing_strategy": [
                {
                    "id": "TEST-ASSETS",
                    "target": "Asset links",
                    "expected_outcome": "Every local asset exists.",
                    "validates": ["REQ-PORTABLE"],
                }
            ],
            "repository_grounding": [
                {
                    "reference": EVIDENCE_REFERENCE,
                    "observation": "Bundle publication is centralized.",
                    "implication": "The product statement is supported by an exact symbol reference.",
                }
            ],
        }

        document = BUNDLE.render_document(BUNDLE.validate_manifest(manifest))

        self.assertIn('id="req-portable"', document)
        self.assertIn('href="#test-assets"', document)
        self.assertNotIn(f'href="#{EVIDENCE_REFERENCE}"', document)
        self.assertIn('href="#traceability"', document)
        self.assertIn("Traceability and coverage", document)
        self.assertIn("Board clear", document)
        self.assertIn("All 4 tracked entities connect", document)
        self.assertNotIn('<div class="section-heading"><span>TR</span>', document)
        self.assertIn("Evidence only:", document)
        self.assertIn("not mandatory implementation instructions", document)
        self.assertIn("scripts/bundle.py::generate_bundle", document)

    def test_traceability_reports_only_entities_with_a_coverage_gap(self) -> None:
        manifest = base_manifest()
        manifest["blocks"] = {
            "requirements": [
                {
                    "id": "REQ-COVERED",
                    "title": "Covered requirement",
                    "description": "Connected to a decision and a test.",
                    "validation": ["TEST-COVERED"],
                    "relates_to": ["DEC-CONTEXT"],
                },
                {
                    "id": "REQ-DEFERRED",
                    "title": "Deferred requirement",
                    "description": "Validation is not designed yet.",
                    "exception": "Validation design is pending the rollout decision.",
                    "relates_to": ["DEC-CONTEXT"],
                },
            ],
            "decisions": [
                {
                    "id": "DEC-CONTEXT",
                    "decision": "Keep generation portable.",
                    "rationale": "Bundles must open without installation.",
                },
                {
                    "id": "DEC-ORPHAN",
                    "decision": "Adopt a review lens control.",
                    "rationale": "Reviewers filter by concern.",
                },
            ],
            "testing_strategy": [
                {
                    "id": "TEST-COVERED",
                    "target": "Asset links",
                    "expected_outcome": "Every local asset exists.",
                    "validates": ["REQ-COVERED"],
                }
            ],
        }

        document = BUNDLE.render_document(BUNDLE.validate_manifest(manifest))
        section = document.split('<section id="traceability"', 1)[1]

        self.assertIn("2 of 5 tracked entities", section)
        self.assertIn('<th>Coverage gap</th>', section)
        self.assertIn('href="#req-deferred"', section)
        self.assertIn("Validation deferred", section)
        self.assertIn("Validation design is pending the rollout decision.", section)
        self.assertIn('href="#dec-orphan"', section)
        self.assertIn("Not connected to a requirement", section)
        self.assertNotIn('href="#req-covered"', section)
        self.assertNotIn('href="#test-covered"', section)
        self.assertNotIn('href="#dec-context"', section)
        self.assertNotIn("Coverage complete", section)

    def test_traceability_flags_requirements_without_decision_or_risk_context(self) -> None:
        manifest = base_manifest()
        manifest["blocks"] = {
            "requirements": [
                {
                    "id": "REQ-BARE",
                    "title": "Bare requirement",
                    "description": "Validated but unexplained.",
                    "validation": ["TEST-BARE"],
                }
            ],
            "testing_strategy": [
                {
                    "id": "TEST-BARE",
                    "target": "Behavior",
                    "expected_outcome": "The behavior is observable.",
                    "validates": ["REQ-BARE"],
                }
            ],
        }

        document = BUNDLE.render_document(BUNDLE.validate_manifest(manifest))
        section = document.split('<section id="traceability"', 1)[1]

        self.assertIn("1 of 2 tracked entities", section)
        self.assertIn("No decision or risk context", section)
        self.assertNotIn('href="#test-bare"', section)

    def test_traceability_rejects_entity_fields_on_wrong_block_types(self) -> None:
        manifest = base_manifest()
        manifest["blocks"] = {
            "decisions": [
                {
                    "decision": "Use the standard library.",
                    "rationale": "Keep generation portable.",
                    "validates": ["REQ-01"],
                }
            ],
            "requirements": [
                {
                    "title": "Portable bundle",
                    "description": "Assets resolve locally.",
                    "exception": "Validation is handled outside this fixture.",
                }
            ],
        }

        with self.assertRaises(BUNDLE.ManifestError) as raised:
            BUNDLE.validate_manifest(manifest)

        self.assertIn(
            "blocks.decisions[0].validates is not supported for this block",
            str(raised.exception),
        )

    def test_traceability_rejects_duplicate_broken_and_unvalidated_requirements(self) -> None:
        manifest = base_manifest()
        manifest["blocks"] = {
            "requirements": [
                {
                    "id": "REQ-DUPLICATE",
                    "title": "First",
                    "description": "Needs proof.",
                    "validation": ["TEST-MISSING"],
                },
                {
                    "id": "REQ-DUPLICATE",
                    "title": "Second",
                    "description": "Duplicate id.",
                    "exception": "Deferred until validation design is selected.",
                },
                {
                    "title": "Unvalidated",
                    "description": "No test or exception.",
                },
            ]
        }

        with self.assertRaises(BUNDLE.ManifestError) as raised:
            BUNDLE.validate_manifest(manifest)

        message = str(raised.exception)
        self.assertIn("duplicate entity id: req-duplicate", message)
        self.assertIn("references missing entity id: TEST-MISSING", message)
        self.assertIn("must connect to a validation outcome or include an exception", message)

    def test_unknown_manifest_fields_and_reserved_metadata_are_rejected(self) -> None:
        manifest = base_manifest()
        manifest["blocks"] = {"problem": {"statement": "A clear problem.", "evidence": ["Observed evidence."]}}
        manifest["block"] = manifest["blocks"]
        manifest["metadata"] = {
            "Initiative": "Misleading override",
            "Output": "Misleading path",
            " owner ": "First",
            "Owner": "Second",
        }

        with self.assertRaises(BUNDLE.ManifestError) as raised:
            BUNDLE.validate_manifest(manifest)

        message = str(raised.exception)
        self.assertIn("block is not a supported manifest field", message)
        self.assertIn("metadata.Initiative is reserved for generated metadata", message)
        self.assertIn("metadata.Output is reserved for generated metadata", message)
        self.assertIn("metadata contains duplicate label after normalization: Owner", message)

    def test_design_tree_accepts_every_status_and_keeps_node_labels(self) -> None:
        manifest = design_tree_manifest(
            [
                {
                    **DESIGN_TREE_ROOT,
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
                            "evidence": ["bundle/assets/app.js pins mermaid@11.15.0"],
                            "children": [
                                {
                                    "id": "NODE-03",
                                    "label": "Node styling",
                                    "question": "Which colours mark a pruned branch?",
                                    "status": "pruned",
                                    "reason": "Styling is an implementation choice.",
                                }
                            ],
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
            open_questions=[{"id": "QUESTION-01", "question": "How deep may a tree grow?"}],
        )

        normalized = BUNDLE.validate_manifest(manifest)

        root = normalized["blocks"]["design_tree"][0]
        deferred = root["children"][1]
        self.assertEqual("node-01", root["id"])
        self.assertEqual("Output surface", root["label"])
        self.assertEqual("In a separate file.", root["superseded_answer"])
        self.assertEqual("node-03", root["children"][0]["children"][0]["id"])
        self.assertEqual(["question-01"], deferred["relates_to"])

    def test_design_tree_requires_the_common_node_fields_at_every_depth(self) -> None:
        message = design_tree_errors(
            [
                {**DESIGN_TREE_ROOT, "children": [{"status": "settled"}]},
            ]
        )

        for field in ("id", "label", "question"):
            self.assertIn(
                f"blocks.design_tree[0].children[0].{field} must be a non-empty string",
                message,
            )
        self.assertIn(
            "blocks.design_tree[0].children[0].answer must be a non-empty string",
            message,
        )

    def test_design_tree_enforces_the_fields_each_status_owns(self) -> None:
        settled_gap = design_tree_errors(
            [{key: value for key, value in DESIGN_TREE_ROOT.items() if key != "rationale"}]
        )
        self.assertIn("blocks.design_tree[0].rationale must be a non-empty string", settled_gap)

        pruned_with_answer = design_tree_errors(
            [
                {
                    "id": "NODE-01",
                    "label": "Node styling",
                    "question": "Which colours mark a pruned branch?",
                    "status": "pruned",
                    "reason": "Styling is an implementation choice.",
                    "answer": "Grey.",
                }
            ]
        )
        self.assertIn(
            "blocks.design_tree[0].answer is not supported for a pruned node",
            pruned_with_answer,
        )

        pruned_without_reason = design_tree_errors(
            [
                {
                    "id": "NODE-01",
                    "label": "Node styling",
                    "question": "Which colours mark a pruned branch?",
                    "status": "pruned",
                }
            ]
        )
        self.assertIn("blocks.design_tree[0].reason must be a non-empty string", pruned_without_reason)

        unknown_status = design_tree_errors([{**DESIGN_TREE_ROOT, "status": "open"}])
        self.assertIn(
            "blocks.design_tree[0].status must be one of: settled, pruned, deferred",
            unknown_status,
        )

    def test_design_tree_requires_a_known_source_and_research_evidence(self) -> None:
        unknown_source = design_tree_errors([{**DESIGN_TREE_ROOT, "source": "agent"}])
        self.assertIn(
            "blocks.design_tree[0].source must be one of: user, research",
            unknown_source,
        )

        research_without_evidence = design_tree_errors(
            [{**DESIGN_TREE_ROOT, "source": "research"}]
        )
        self.assertIn(
            "blocks.design_tree[0].evidence must name at least one finding for a research answer",
            research_without_evidence,
        )

    def test_design_tree_deferred_node_must_link_an_existing_open_question(self) -> None:
        deferred = {
            "id": "NODE-01",
            "label": "Depth limit",
            "question": "How deep may the tree grow?",
            "status": "deferred",
        }

        unlinked = design_tree_errors([deferred])
        self.assertIn(
            "blocks.design_tree[0].relates_to must name an open question id for a deferred node",
            unlinked,
        )

        missing_question = design_tree_errors(
            [{**deferred, "relates_to": ["QUESTION-09"]}],
            open_questions=[{"id": "QUESTION-01", "question": "How deep may a tree grow?"}],
        )
        self.assertIn(
            "blocks.design_tree[0].relates_to references missing entity id: QUESTION-09",
            missing_question,
        )

    def test_design_tree_rejects_wrong_prefixes_duplicates_and_empty_branches(self) -> None:
        wrong_prefix = design_tree_errors([{**DESIGN_TREE_ROOT, "id": "DEC-09"}])
        self.assertIn(
            "blocks.design_tree[0].id must look like NODE-01 and use the node prefix",
            wrong_prefix,
        )

        duplicate = design_tree_errors(
            [{**DESIGN_TREE_ROOT, "children": [dict(DESIGN_TREE_ROOT)]}]
        )
        self.assertIn("duplicate entity id: node-01", duplicate)

        empty_block = design_tree_errors([])
        self.assertIn(
            "blocks.design_tree must be a non-empty array of design tree nodes",
            empty_block,
        )

        empty_children = design_tree_errors([{**DESIGN_TREE_ROOT, "children": []}])
        self.assertIn(
            "blocks.design_tree[0].children must be a non-empty array of design tree nodes",
            empty_children,
        )

    def test_design_tree_rejects_every_field_a_status_does_not_own(self) -> None:
        settled_with_reason = design_tree_errors(
            [{**DESIGN_TREE_ROOT, "reason": "Out of scope."}]
        )
        self.assertIn(
            "blocks.design_tree[0].reason is not supported for a settled node",
            settled_with_reason,
        )

        settled_without_source = design_tree_errors(
            [{key: value for key, value in DESIGN_TREE_ROOT.items() if key != "source"}]
        )
        self.assertIn(
            "blocks.design_tree[0].source must be a non-empty string",
            settled_without_source,
        )

        deferred = {
            "id": "NODE-01",
            "label": "Depth limit",
            "question": "How deep may the tree grow?",
            "status": "deferred",
            "relates_to": ["QUESTION-01"],
        }
        questions = [{"id": "QUESTION-01", "question": "How deep may a tree grow?"}]
        for field, value in (
            ("answer", "Ten."),
            ("rationale", "Because."),
            ("source", "user"),
            ("superseded_answer", "Five."),
            ("reason", "Out of scope."),
        ):
            with self.subTest(field=field):
                message = design_tree_errors(
                    [{**deferred, field: value}], open_questions=questions
                )
                self.assertIn(
                    f"blocks.design_tree[0].{field} is not supported for a deferred node",
                    message,
                )
        for field, value in (("source", "user"), ("superseded_answer", "Five.")):
            with self.subTest(status="pruned", field=field):
                message = design_tree_errors(
                    [
                        {
                            "id": "NODE-01",
                            "label": "Node styling",
                            "question": "Which colours mark a pruned branch?",
                            "status": "pruned",
                            "reason": "Styling is an implementation choice.",
                            field: value,
                        }
                    ]
                )
                self.assertIn(
                    f"blocks.design_tree[0].{field} is not supported for a pruned node",
                    message,
                )

    def test_a_deeply_nested_design_tree_validates_and_renders(self) -> None:
        depth = sys.getrecursionlimit()
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
                "question": "Does depth stay a manifest concern?",
                "status": "settled",
                "answer": "Yes.",
                "source": "user",
                "rationale": "Traversal is iterative.",
                "children": [node],
            }

        normalized = BUNDLE.validate_manifest(design_tree_manifest([node]))
        document = BUNDLE.render_document(normalized)

        self.assertEqual(depth, document.count('class="tree-node"'))
        self.assertIn(f'id="node-{depth:04d}"', document)

    def test_design_tree_nodes_stay_off_the_coverage_board(self) -> None:
        manifest = design_tree_manifest(
            [DESIGN_TREE_ROOT],
            requirements=[
                {
                    "id": "REQ-01",
                    "title": "Publish the tree",
                    "description": "The bundle shows the interview tree.",
                    "exception": "Validation is selected in a later revision.",
                }
            ],
        )

        report = coverage_report(BUNDLE.validate_manifest(manifest)["blocks"])

        self.assertEqual(1, report["tracked"])
        self.assertNotIn("node-01", report["aspects"])

    def test_validation_reports_internal_field_paths_directly(self) -> None:
        manifest = base_manifest()
        manifest["blocks"] = {
            "architecture_diagram": {
                "description": "Invalid edge.",
                "native": {
                    "nodes": [{"id": "gateway", "label": "Gateway"}],
                    "edges": [{"from": "gateway", "to": "service", "label": "Route"}],
                },
            }
        }

        with self.assertRaises(BUNDLE.ManifestError) as raised:
            BUNDLE.validate_manifest(manifest)

        self.assertIn(
            "blocks.architecture_diagram.native.edges[0].to must reference a node id",
            str(raised.exception),
        )
