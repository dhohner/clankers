from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path

import support

from interview_support import InterviewTestCase, ServerFixture
from scripts.cli import parse_args
from scripts.cli.commands import COMMANDS
from scripts.cli.support import CliFailure
from scripts.toon import dumps
from toon_oracle import decode
from toon_reader import read_toon_string


class ToonWriterTests(unittest.TestCase):
    def test_rejects_unsupported_values_instead_of_changing_their_meaning(self) -> None:
        cycle = []
        cycle.append(cycle)
        cases = [
            object(),
            b"bytes",
            (1, 2),
            {1, 2},
            Decimal("1.25"),
            datetime(2026, 1, 1, tzinfo=UTC),
            float("nan"),
            float("inf"),
            float("-inf"),
            {1: "non-string key"},
            "\ud800",
            {"\udfff": "invalid key"},
            cycle,
        ]
        for value in cases:
            with (
                self.subTest(type=type(value).__name__, value=repr(value)),
                self.assertRaisesRegex(
                    (TypeError, ValueError), r"Cannot encode TOON at \$\['nested'\]\[0\]\['bad'\]"
                ),
            ):
                dumps({"valid": "first", "nested": [{"bad": value}]})

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


FIXTURES = Path(__file__).parent / "fixtures" / "toon"


def assert_json_equal(test: unittest.TestCase, actual, expected) -> None:
    """Compare JSON types too: Python otherwise considers True equal to 1."""
    pending = [(actual, expected)]
    while pending:
        item, wanted = pending.pop()
        if type(wanted) in (int, float):
            test.assertIn(type(item), (int, float))
        else:
            test.assertIs(type(item), type(wanted))
        if isinstance(wanted, dict):
            test.assertEqual(item.keys(), wanted.keys())
            pending.extend((item[key], wanted[key]) for key in wanted)
        elif isinstance(wanted, list):
            test.assertEqual(len(item), len(wanted))
            pending.extend(zip(item, wanted, strict=True))
        else:
            test.assertEqual(item, wanted)


class IndependentToonTests(unittest.TestCase):
    def assert_deep_round_trip(self, payload) -> None:
        recursion_limit = sys.getrecursionlimit()
        try:
            encoded = dumps(payload)
        except RecursionError:
            self.fail("Supported nested JSON payload exhausted the encoder's call stack")
        self.assertEqual(sys.getrecursionlimit(), recursion_limit)
        # The external oracle is recursive; only development decoding needs a larger stack.
        try:
            sys.setrecursionlimit(max(recursion_limit, 10000))
            decoded = decode(encoded)
        finally:
            sys.setrecursionlimit(recursion_limit)
        assert_json_equal(self, decoded, payload)

    def test_collections_at_depth_500_preserve_empty_leaves(self) -> None:
        for wrapper in ("object", "array", "alternating"):
            for leaf in ({}, []):
                with self.subTest(wrapper=wrapper, leaf=type(leaf).__name__):
                    payload = leaf
                    for level in range(500):
                        if wrapper == "object" or wrapper == "alternating" and level % 2:
                            payload = {"x": payload}
                        else:
                            payload = [payload]
                    self.assert_deep_round_trip(payload)

    def test_collections_at_depth_1500_preserve_siblings_and_leaf_types(self) -> None:
        for wrapper in ("object", "array", "alternating"):
            with self.subTest(wrapper=wrapper):
                payload = {
                    "empty_object": {},
                    "empty_array": [],
                    "rows": [{"boolean": True, "value": None}, {"boolean": False, "value": "42"}],
                }
                for level in range(1500):
                    if wrapper == "object" or wrapper == "alternating" and level % 2:
                        payload = {"x": payload, "sibling": level}
                    else:
                        payload = [payload, None]
                self.assert_deep_round_trip(payload)

    def test_invalid_leaves_and_cycles_at_depth_1500_fail_explicitly(self) -> None:
        cycle = []
        cycle.append(cycle)
        for leaf in (object(), float("nan"), float("inf"), float("-inf"), {1: "bad"}, cycle):
            with self.subTest(leaf_type=type(leaf).__name__):
                payload = {"bad": leaf}
                for level in range(1500):
                    payload = {"x": payload} if level % 2 else [payload]
                with self.assertRaisesRegex((TypeError, ValueError), r"Cannot encode TOON at \$"):
                    dumps(payload)
        self.assertEqual(dumps({"after_failure": []}), "after_failure[0]:")

    def test_strings_preserve_content_in_every_structural_position(self) -> None:
        self.assertEqual(dumps({"a\n": 1}), '"a\\n": 1')
        texts = [
            "",
            "42",
            "05",
            "-0",
            "1e-6",
            "+1",
            ".5",
            "1.",
            "true",
            "false",
            "null",
            "a,b",
            "p:q",
            'say "hi"',
            "line one\nline two\r\tend",
            "a\n",
            "C:\\dir",
            " café 你好 🚀 ",
            "e\u0301",
            "é",
            "[0]",
            "{}",
            "-",
            "# comment",
            "\ufeffdata",
            "\x00\x08\x0c\x1f",
            "one\u2028two",
            "one\u2029two",
        ]
        for text in texts:
            for payload in (text, {text: text}, [text], {"rows": [{text: text}]}):
                with self.subTest(text=repr(text), position=type(payload).__name__):
                    assert_json_equal(self, decode(dumps(payload)), payload)

    def test_empty_nested_collections_and_reordered_table_fields_remain_distinct(self) -> None:
        shared = {"empty": []}
        cases = [
            {},
            [],
            {"object": {}, "array": [], "text": "", "null": None},
            {"items": [{}, [], "", None, False, 0]},
            {"items": [{"first": {"child": [[], {}]}, "last": True}]},
            {"items": [{"first": [{"a": 1}, {"a": 2}], "last": 0}]},
            {"items": [{"first": [[1], [2, 3]], "last": {}}]},
            {"rows": [{"a,b": "x,y", "c:d": False}, {"c:d": None, "a,b": ""}]},
            {"rows": [{"a": 1}, {"b": 2, "c": 3}]},
            {"items": [shared, shared]},
        ]
        for payload in cases:
            with self.subTest(payload=payload):
                before = json.dumps(payload, ensure_ascii=False)
                assert_json_equal(self, decode(dumps(payload)), payload)
                self.assertEqual(json.dumps(payload, ensure_ascii=False), before)

    def test_integer_encoding_preserves_digits_beyond_the_interpreter_string_limit(self) -> None:
        value = 10**5000 + 1
        try:
            encoded = dumps({"number": value})
        except ValueError as error:
            self.fail(f"Supported finite integer could not be encoded: {error}")
        self.assertEqual(encoded, "number: 1" + "0" * 4999 + "1")
        assert_json_equal(
            self, decode(encoded, parse_int=lambda text: int(Decimal(text))), {"number": value}
        )

    def test_numeric_boundaries_preserve_numbers_and_boolean_types(self) -> None:
        numbers = [
            -0.0,
            0,
            -1,
            2.0,
            0.1,
            1e-7,
            1e-6,
            1e20,
            1e21,
            5e-324,
            1.7976931348623157e308,
            2**53 + 1,
            10**100 + 1,
        ]
        payload = {"numbers": numbers, "true": True, "false": False, "null": None}
        assert_json_equal(self, decode(dumps(payload)), payload)

    def test_schema_validation_and_inspection_payloads_decode_independently(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            invalid = root / "invalid.yaml"
            invalid.write_text("{}", encoding="utf-8")
            commands = [
                ["schema"],
                ["schema", *support.BUNDLE.BLOCK_SPECS],
                ["validate", str(support.EXAMPLE), "--full"],
                ["generate", str(support.EXAMPLE), "--output-root", str(root)],
                ["inspect", str(root / "PRD-example-review-bundle"), "--full"],
                ["validate", str(invalid), "--full"],
            ]
            for argv in commands:
                with self.subTest(command=argv[0]):
                    args = parse_args(argv)
                    try:
                        payload = COMMANDS[args.command](args)
                    except CliFailure as error:
                        self.assertEqual(argv[0], "validate")
                        payload = error.payload
                    assert_json_equal(self, decode(dumps(payload)), payload)

    def test_arrays_of_uniform_objects_inside_arrays_use_list_form(self) -> None:
        payload = {"items": [[{"id": 1}, {"id": 2}]]}
        encoded = dumps(payload)
        self.assertEqual(encoded, "items[1]:\n  - [2]:\n    - id: 1\n    - id: 2")
        assert_json_equal(self, decode(encoded), payload)

    def test_specification_fixtures_preserve_json_values_and_types(self) -> None:
        for path in sorted((FIXTURES / "encode").glob("*.json")):
            for case in json.loads(path.read_text(encoding="utf-8"))["tests"]:
                options = case.get("options", {})
                if any(
                    (key, value) not in (("delimiter", ","), ("keyFolding", "off"))
                    for key, value in options.items()
                ):
                    continue
                with self.subTest(file=path.name, case=case["name"]):
                    assert_json_equal(self, decode(case["expected"]), case["input"])
                    try:
                        encoded = dumps(case["input"])
                    except AttributeError as error:
                        self.fail(f"Supported JSON root could not be encoded: {error}")
                    self.assertEqual(encoded, case["expected"])
                    assert_json_equal(self, decode(encoded), case["input"])


class IndependentInterviewTests(InterviewTestCase):
    def test_complete_interview_replay_decodes_without_installed_packages(self) -> None:
        round_ = {
            "id": "ROUND-01",
            "questions": [
                {
                    "node": f"NODE-0{index}",
                    "label": f"Question {index}",
                    "question": "What should happen?",
                    "multi_select": index == 1,
                    "options": [
                        {"label": "Local", "description": "Local files.", "recommended": True},
                        {"label": "Remote", "description": "Remote files."},
                    ],
                }
                for index in range(1, 5)
            ],
        }
        submitted = {
            "round": "ROUND-01",
            "comment": 'Review: "café", 你好\nsecond line',
            "answers": [
                {
                    "node": "NODE-01",
                    "choice": "option",
                    "selected": ["Local", "Remote"],
                    "note": "Keep both, please.",
                },
                {"node": "NODE-02", "choice": "written", "written": "Custom, 42\ntrue"},
                {"node": "NODE-03", "choice": "decide_later", "reason": "Needs review."},
                {"node": "NODE-04", "choice": "out_of_scope", "reason": "Later release."},
            ],
        }
        server = ServerFixture(self, self.session, round_)
        status, body = server.submit(submitted)
        self.assertEqual(status, 200, body)
        status, original = server.request("GET", "/api/rounds/ROUND-01/result", token=server.token)
        self.assertEqual(status, 200, original)
        before = {path: path.read_bytes() for path in server.stored_answers()}
        round_file = self.write_round(round_)
        result = subprocess.run(
            [
                sys.executable,
                "-I",
                "-S",
                str(support.ENTRYPOINT),
                "interview",
                "ask",
                str(self.session),
                str(round_file),
            ],
            cwd=support.SKILL_DIR,
            env=support.NO_BROWSER_ENV,
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        payload = decode(result.stdout)
        records = [
            {
                "status": "settled",
                "source": "user",
                "answer": "Local; Remote",
                "rationale": (
                    "Write it from the note and the option descriptions: Local files. Remote files."
                ),
            },
            {
                "status": "settled",
                "source": "user",
                "answer": "Custom, 42\ntrue",
                "rationale": "Write it from the written answer.",
            },
            {
                "status": "deferred",
                "open_question": "What should happen? Blocker: Needs review. Owner: the user.",
                "relates_to": "the id of the new open_questions entry",
            },
            {"status": "pruned", "reason": "Later release."},
        ]
        expected = {
            "status": "answered",
            "session": str(self.session),
            "round": "ROUND-01",
            "instructions": (
                "Write each answer record to the design_tree node with the same NODE id. "
                "For a deferred node, add the open_question text as a new open_questions entry "
                "with a new id, and list that id in the node relates_to."
            ),
            "comment": submitted["comment"],
            "answers": [
                {
                    "node": answer["node"],
                    "label": f"Question {index}",
                    "choice": answer["choice"],
                    "selected": answer.get("selected", []),
                    "written": answer.get("written", ""),
                    "reason": answer.get("reason", ""),
                    "note": answer.get("note", ""),
                    "record": record,
                }
                for index, (answer, record) in enumerate(
                    zip(submitted["answers"], records, strict=True), 1
                )
            ],
            "next": [
                f"python3 scripts/__main__.py interview ask {self.session} <next-round-file>",
                f"python3 scripts/__main__.py interview end {self.session}",
            ],
        }
        assert_json_equal(self, payload, expected)
        status, after = server.request("GET", "/api/rounds/ROUND-01/result", token=server.token)
        self.assertEqual((status, after), (200, original))
        self.assertEqual({path: path.read_bytes() for path in before}, before)


if __name__ == "__main__":
    unittest.main()
