from __future__ import annotations

import argparse
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from support import BUNDLE, EXAMPLE, load_example_manifest
from scripts import output_validation
from scripts import yaml_manifest
from scripts.cli import bundle_commands, catalog_examples, support


class PrdBundlePerformanceTests(unittest.TestCase):
    def test_bundle_anchor_checks_do_not_search_the_id_list(self) -> None:
        class MembershipGuard(list):
            def __contains__(self, value):
                raise AssertionError("Anchor membership must use an index")

        original_init = output_validation._DocumentParser.__init__

        def initialize(parser):
            original_init(parser)
            parser.ids = MembershipGuard()

        with tempfile.TemporaryDirectory() as directory:
            manifest = BUNDLE.validate_manifest(load_example_manifest())
            bundle = BUNDLE.generate_bundle(manifest, Path(directory))
            with patch.object(output_validation._DocumentParser, "__init__", initialize):
                self.assertIsNone(BUNDLE.validate_generated_bundle(bundle))

    def test_inspect_parses_each_document_once_and_preserves_full_output(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            manifest = BUNDLE.validate_manifest(load_example_manifest())
            bundle = BUNDLE.generate_bundle(manifest, Path(directory))
            index = bundle / "index.html"
            index.write_text(
                index.read_text(encoding="utf-8")
                + '<i id="extra space"></i><a href="#extra%20space">Extra</a>',
                encoding="utf-8",
            )
            original_feed = output_validation.HTMLParser.feed
            original_read = Path.read_text
            with (
                patch.object(Path, "read_text", autospec=True, side_effect=original_read) as read,
                patch.object(yaml_manifest, "_loads", wraps=yaml_manifest._loads) as loads,
                patch.object(
                    output_validation.HTMLParser, "feed", autospec=True,
                    side_effect=original_feed,
                ) as feed,
                patch.object(
                    output_validation, "validate_manifest",
                    wraps=output_validation.validate_manifest,
                ) as validate,
            ):
                result = bundle_commands.command_inspect(
                    argparse.Namespace(bundle=bundle, full=True)
                )
            self.assertEqual(
                [call.args[0] for call in read.call_args_list],
                [bundle / "prd.yaml", index],
            )
            self.assertEqual(loads.call_count, 1)
            self.assertEqual(feed.call_count, 1)
            self.assertEqual(validate.call_count, 1)
            self.assertEqual(result["normalized_manifest"], manifest)
            self.assertIn("extra space", result["html_ids"])
            self.assertIn("extra%20space", result["fragment_links"])
            self.assertEqual(result["anchors"]["broken"], ["extra%20space"])
            self.assertEqual(result["anchors"]["count"], len(result["html_ids"]))
            self.assertEqual(result["validation"], {"manifest": "ok", "bundle": "ok"})

    def test_inspect_keeps_structured_validation_failures(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            bundle = Path(directory)
            with self.assertRaises(support.CliFailure) as raised:
                bundle_commands.command_inspect(
                    argparse.Namespace(bundle=bundle, full=False)
                )
            self.assertEqual(raised.exception.payload["code"], "bundle_invalid")
            self.assertEqual(raised.exception.payload["total_errors"], 2)

    def test_validation_payload_counts_language_candidates_once(self) -> None:
        manifest = BUNDLE.validate_manifest(load_example_manifest())
        original = support._count_german_candidates
        for summary, expected_count in (("An English summary", 0), ("Mit einem Beispiel", 1)):
            with self.subTest(summary=summary):
                manifest["summary"] = summary
                count = original(manifest)
                self.assertEqual(count, expected_count)
                with patch.object(
                    support, "_count_german_candidates", wraps=original,
                ) as counter:
                    result = support.validation_payload(manifest, EXAMPLE)
                root_calls = sum(call.args[0] is manifest for call in counter.call_args_list)
                self.assertEqual(root_calls, 1)
                self.assertEqual(result["summary"]["untranslated_german_candidates"], count)
                expected_warnings = (
                    [f"review {count} possible untranslated German string(s)"] if count else []
                )
                self.assertEqual(result["warnings"], expected_warnings)

    def test_named_examples_only_read_matching_files(self) -> None:
        for name in ("minimal-prd", "minimal-prd.yaml"):
            with self.subTest(name=name):
                with patch.object(
                    catalog_examples, "_example_item", wraps=catalog_examples._example_item,
                ) as read:
                    result = catalog_examples.command_examples(argparse.Namespace(name=name))
                self.assertEqual(read.call_count, 1)
                self.assertEqual(result["examples"][0]["name"], "minimal-prd")
                self.assertIn("title", result["examples"][0])

    def test_unknown_example_reads_no_manifests(self) -> None:
        with patch.object(catalog_examples, "_example_item") as read:
            with self.assertRaises(support.CliFailure) as raised:
                catalog_examples.command_examples(argparse.Namespace(name="absent"))
        read.assert_not_called()
        self.assertEqual(raised.exception.payload["code"], "example_unknown")

    def test_unfiltered_examples_keep_the_catalog_order(self) -> None:
        paths = catalog_examples._example_paths()
        with patch.object(
            catalog_examples, "_example_item", wraps=catalog_examples._example_item,
        ) as read:
            result = catalog_examples.command_examples(argparse.Namespace(name=None))
        self.assertEqual(read.call_count, len(paths))
        self.assertEqual(
            [item["name"] for item in result["examples"]],
            [path.stem for path in paths],
        )
        self.assertEqual(result["examples"][0]["name"], "minimal-prd")
