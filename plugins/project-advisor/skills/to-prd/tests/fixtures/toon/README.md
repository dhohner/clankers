# TOON conformance provenance

## Specification and fixtures

The encoder targets TOON **v3.0.0**, at [`toon-format/spec` commit `c09f73b267323190f61de5b91563fa579b3b7c5e`](https://github.com/toon-format/spec/tree/c09f73b267323190f61de5b91563fa579b3b7c5e).
`SPEC.md`, `LICENSE`, and all nine files in `encode/` are unmodified copies from that commit.
The fixture source directory is [`tests/fixtures/encode/`](https://github.com/toon-format/spec/tree/c09f73b267323190f61de5b91563fa579b3b7c5e/tests/fixtures/encode).
Some fixture documents retain an earlier `version` field because they originated before v3.0.0.
The repository commit pins the fixture set.

`IndependentToonTests.test_specification_fixtures_preserve_json_values_and_types` runs 114 upstream cases.
It checks the upstream expected text with the independent decoder, compares our encoding to that text, and independently decodes our output against the original JSON input.
Comparison distinguishes booleans from numbers and checks nested JSON types.
It treats integer and floating point representations of the same number as one JSON numeric type.

The remaining 33 upstream cases request tab or pipe delimiters, key folding, flattening, or four spaces of indentation.
These encoder options are outside the fixed comma delimiter, two spaces of indentation, and literal key contract of `scripts/toon.py`.
They remain in the copied files for provenance and are excluded explicitly by their `options` fields.

## Independent decoder

The development oracle is the official Python implementation, [`toon-format` 1.2.0](https://pypi.org/project/toon-format/1.2.0/), distributed by [`toon-format/toon-python`](https://github.com/toon-format/toon-python).
Its unchanged wheel is stored in `tests/vendor/toon_format-1.2.0-py3-none-any.whl`.
Its MIT license is also copied to `tests/vendor/toon-format-LICENSE`.

Wheel source:

```text
https://files.pythonhosted.org/packages/f3/9e/69331571d5b91b3f34f0dcd7c8135bb3241e41c3c3effb4af8f57772a9ca/toon_format-1.2.0-py3-none-any.whl
SHA256 d94db4b088a281a7bbc85e75d7fbd24e6a0ec7bc110edb129285259eca6522c0
```

`tests/toon_oracle.py` imports `toon_format.loads` directly from the wheel using Python's standard zip import support.
Tests need no installation or network access.
The decoder implements specification 4.4 and accepts the v3.0 syntax used here, including legacy empty array headers.
The 114 upstream cases verify this overlap against their published expected values.
No claim is made that the oracle implements v3.0 optional path expansion or every historical decoder recovery rule.

The oracle has its own lexer, recursive parser, unescaping, type inference, array count checks, and table width checks.
It imports no production encoder code or helpers.
Expected values come from upstream JSON fixtures, literal boundary examples, real command payloads, and an interview submitted through the HTTP interface.
The test for a 5001 digit integer uses the decoder's public `parse_int` hook with `int(Decimal(text))` to bypass Python's decimal string conversion limit without losing digits or changing the interpreter's global limit.

The depth tests run the encoder at the existing interpreter recursion limit.
They then temporarily raise the recursion limit for the external decoder, whose parser is recursive, and restore it in `finally` before comparing values and types with an iterative test helper.
This adjustment applies only to development decoding.

The wheel is used only by tests.
Operational encoding imports only the standard library and is exercised through an interview command in a Python 3.14 process with `-I -S`.

## Supported values and normalization

`dumps()` accepts JSON values at the root and in nested collections: built-in dictionaries with string keys, lists, strings of Unicode scalar values, integers, finite floats, booleans, and `None`.
It preserves array order, literal keys, and object encounter order, except that table rows follow the first object's field order as required by specification section 9.3.
Repeated references to a collection are supported; circular collections are rejected.
Other internal types, non-string keys, nonfinite floats, and surrogate code points in keys or values raise `TypeError` or `ValueError` with a data path.
Validation traverses the whole payload before constructing output.
Validation and output traversal use explicit stacks, so collection depth does not consume the encoder's Python call stack.
Output helpers yield lines or child iterators, which a stack drains in encounter order.
The encoder does not alter the interpreter's recursion limit.

Specification sections 2 and 3 normalize negative zero to zero and integral floats to integer form.
Numbers use plain decimal notation without exponents or redundant fractional zeros.
Finite float output preserves the Python numeric value; integer output preserves all digits, including integers beyond Python's default string conversion limit.
JSON has one number type, so Python `2.0` and `2` are equivalent after decoding.
Booleans and numeric strings remain separate types.
The specification's destructive nonfinite to null normalization is rejected at the input boundary, as required by the task contract.

Strings beginning with `#` or U+FEFF are quoted to prevent comment removal or byte order mark removal by the oracle.
This additional quoting is permitted by v3.0 section 7.2.
Control characters other than newline, carriage return, and tab remain literal, as required by v3.0's escape set.
No v4.4 escape or keyed table syntax is emitted.
Arrays carried on a list item line use list form for nested object arrays, as required by v3.0 section 9.4.
