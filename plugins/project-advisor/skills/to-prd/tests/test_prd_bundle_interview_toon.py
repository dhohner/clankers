from __future__ import annotations

import unittest

import support  # noqa: F401  # puts the skill directory on sys.path

from scripts.toon import dumps
from toon_reader import read_toon_string


class ToonWriterTests(unittest.TestCase):
    def test_prints_scalars_as_key_value_lines(self) -> None:
        self.assertEqual(
            dumps({"status": "ok", "count": 2, "ratio": 0.5, "open": True, "owner": None}),
            "status: ok\ncount: 2\nratio: 0.5\nopen: true\nowner: null",
        )

    def test_prints_numbers_in_decimal_form_without_exponent(self) -> None:
        self.assertEqual(
            dumps({"small": 1e-07, "large": 1.5e20, "whole": 2.0, "zero": -0.0}),
            "small: 0.0000001\nlarge: 150000000000000000000\nwhole: 2\nzero: 0",
        )

    def test_prints_nested_objects_with_two_space_indent(self) -> None:
        self.assertEqual(
            dumps({"round": {"id": "ROUND-01", "counts": {"questions": 2}}}),
            "round:\n  id: ROUND-01\n  counts:\n    questions: 2",
        )

    def test_prints_scalar_array_inline_with_length(self) -> None:
        self.assertEqual(dumps({"tags": ["alpha", "beta", 3]}), "tags[3]: alpha,beta,3")

    def test_prints_empty_array_as_explicit_zero_length(self) -> None:
        self.assertEqual(dumps({"errors": [], "state": "none"}), "errors[0]:\nstate: none")

    def test_prints_uniform_objects_as_table(self) -> None:
        self.assertEqual(
            dumps(
                {
                    "errors": [
                        {"path": "id", "message": "is missing", "fix": "Add id."},
                        {"path": "questions", "message": "is empty", "fix": "Add one."},
                    ]
                }
            ),
            "errors[2]{path,message,fix}:\n  id,is missing,Add id.\n  questions,is empty,Add one.",
        )

    def test_prints_objects_with_different_fields_as_list_items(self) -> None:
        self.assertEqual(
            dumps({"items": [{"a": 1}, {"b": 2, "c": 3}]}),
            "items[2]:\n  - a: 1\n  - b: 2\n    c: 3",
        )

    def test_prints_nested_values_inside_list_items(self) -> None:
        self.assertEqual(
            dumps({"items": [{"id": "Q", "tags": ["x"], "meta": {"k": "v"}}]}),
            "items[1]:\n  - id: Q\n    tags[1]: x\n    meta:\n      k: v",
        )

    def test_quotes_text_that_would_change_meaning(self) -> None:
        cases = {
            "comma": ("a,b", '"a,b"'),
            "colon": ("key: value", '"key: value"'),
            "double quote": ('say "hi"', '"say \\"hi\\""'),
            "leading space": (" padded", '" padded"'),
            "trailing space": ("padded ", '"padded "'),
            "line break": ("one\ntwo", '"one\\ntwo"'),
            "carriage return": ("one\rtwo", '"one\\rtwo"'),
            "tab": ("one\ttwo", '"one\\ttwo"'),
            "backslash": ("C:\\dir", '"C:\\\\dir"'),
            "empty": ("", '""'),
            "boolean word": ("true", '"true"'),
            "null word": ("null", '"null"'),
            "number text": ("42", '"42"'),
            "decimal text": ("-1.5", '"-1.5"'),
            "leading hyphen": ("- item", '"- item"'),
            "brackets": ("[x]", '"[x]"'),
            "braces": ("{x}", '"{x}"'),
        }
        for name, (text, token) in cases.items():
            with self.subTest(name):
                self.assertEqual(dumps({"text": text}), f"text: {token}")

    def test_leaves_inner_spaces_and_hyphens_unquoted(self) -> None:
        self.assertEqual(
            dumps({"next": "python3 -m scripts interview end <session-dir>"}),
            "next: python3 -m scripts interview end <session-dir>",
        )

    def test_quoted_text_reads_back_to_same_content(self) -> None:
        text = ' lead, "quoted": value\nsecond line\\ end '
        token = dumps({"text": text}).removeprefix("text: ")

        self.assertEqual(read_toon_string(token), text)

    def test_quoted_table_cells_and_array_items_read_back(self) -> None:
        output = dumps({"rows": [{"a": "x,y", "b": "p:q"}], "list": ["m,n"]})

        self.assertEqual(output, 'rows[1]{a,b}:\n  "x,y","p:q"\nlist[1]: "m,n"')
        self.assertEqual(read_toon_string('"x,y"'), "x,y")

    def test_quotes_keys_outside_identifier_form(self) -> None:
        self.assertEqual(
            dumps({"Owner: team": 1, "a b": 2, "dotted.key": 3}),
            '"Owner: team": 1\n"a b": 2\ndotted.key: 3',
        )


if __name__ == "__main__":
    unittest.main()
