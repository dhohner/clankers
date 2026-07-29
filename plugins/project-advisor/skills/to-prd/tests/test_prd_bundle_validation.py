from __future__ import annotations

import unittest

from support import BUNDLE, EVIDENCE_REFERENCE, base_manifest


class PrdBundleValidationTests(unittest.TestCase):
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
        self.assertIn("Coverage complete", document)
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
