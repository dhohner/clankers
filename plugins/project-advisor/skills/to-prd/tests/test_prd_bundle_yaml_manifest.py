from __future__ import annotations

import unittest

from support import dump_yaml, load_yaml


class PrdBundleYamlManifestTests(unittest.TestCase):
    def test_round_trips_quoted_keys_and_single_quoted_scalars(self) -> None:
        value = {
            "metadata": {
                "Owner: team": "A",
                "Release #": "1",
                "Plain": "can't fail",
            },
            "items": ["https://example.test/path", "plain"],
        }

        self.assertEqual(load_yaml(dump_yaml(value)), value)
        self.assertEqual(load_yaml("title: 'can''t fail'\n"), {"title": "can't fail"})

    def test_block_scalars(self) -> None:
        value = {
            "diagram": {"source": "A --> B\nB --> C"},
            "notes": "one\ntwo\n",
            "items": ["first\nsecond", []],
            "records": [{"code": "alpha\nbeta", "label": "kept", "refs": []}],
        }

        self.assertEqual(
            load_yaml("diagram:\n  source: |-\n    A --> B\n    B --> C\n"),
            {"diagram": {"source": "A --> B\nB --> C"}},
        )
        self.assertEqual(
            load_yaml("summary: >-\n  one\n  two\n\n  three\n"),
            {"summary": "one two\n\nthree"},
        )
        self.assertEqual(load_yaml(dump_yaml(value)), value)
        self.assertEqual(load_yaml(dump_yaml([])), [])
        self.assertEqual(load_yaml(dump_yaml({})), {})

    def test_flow_collections_and_scalar_errors_report_source_line(self) -> None:
        self.assertEqual(
            load_yaml("review_surfaces: [document, ui]\nmetadata: {Owner: Test}\n"),
            {"review_surfaces": ["document", "ui"], "metadata": {"Owner": "Test"}},
        )
        self.assertEqual(
            load_yaml("items:\n  - {Owner: Test}\n"),
            {"items": [{"Owner": "Test"}]},
        )

        with self.assertRaises(ValueError) as raised:
            load_yaml('title: ok\nsummary: "unterminated\n')

        self.assertEqual(raised.exception.line, 2)

    def test_rejects_empty_tab_indented_and_duplicate_key_documents(self) -> None:
        for text in (
            "# comment only\n",
            "root:\n\tchild: value\n",
            "title: one\ntitle: two\n",
            '{"title":"one","title":"two"}',
        ):
            with self.subTest(text=text):
                with self.assertRaises(ValueError):
                    load_yaml(text)


if __name__ == "__main__":
    unittest.main()
