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
        self.assertIn("Traceability view", document)
        self.assertIn("Evidence only:", document)
        self.assertIn("not mandatory implementation instructions", document)
        self.assertIn("scripts/bundle.py::generate_bundle", document)

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
