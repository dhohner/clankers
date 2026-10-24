# Task 01 execution evidence

Task: `action-items/agent-tasks/01-verify-toon-encoding.md`.
Starting HEAD: `236cd788400d3e8d63bb850b6aca6cf0f482cb2b`.

## Initial working tree

The working tree initially had no tracked modifications and the following untracked files:

```text
action-items/PRD-toon-cli-contract/assets/app.js
action-items/PRD-toon-cli-contract/assets/favicon.svg
action-items/PRD-toon-cli-contract/assets/fonts/OFL-Manrope.txt
action-items/PRD-toon-cli-contract/assets/fonts/manrope.woff2
action-items/PRD-toon-cli-contract/assets/styles.css
action-items/PRD-toon-cli-contract/index.html
action-items/PRD-toon-cli-contract/prd.yaml
action-items/agent-tasks/01-verify-toon-encoding.md
action-items/agent-tasks/02-unify-cli-responses.md
action-items/agent-tasks/03-guide-command-recovery.md
action-items/agent-tasks/04-bound-discovery-output.md
action-items/agent-tasks/05-build-promotion-evaluation.md
action-items/agent-tasks/06-record-agent-trial-evidence.md
action-items/agent-tasks/07-promote-toon-responses.md
action-items/toon-cli-task-map.md
plugins/scribe/skills/humanizer/SKILL.md
```

At the start of the G1 followup, HEAD was still `236cd788400d3e8d63bb850b6aca6cf0f482cb2b`.
All task files listed below were already staged as additions or modifications.
`action-items/` and `plugins/scribe/skills/humanizer/` were still untracked.
The followup changes only `scripts/toon.py`, the focused test module, this evidence file, and `README.md` in the working tree.

## Files changed for this task

Paths below are relative to `plugins/project-advisor/skills/to-prd/`:

- `scripts/toon.py`
- `tests/test_prd_bundle_interview_toon.py`
- `tests/toon_oracle.py`
- `tests/fixtures/toon/README.md`
- `tests/fixtures/toon/VALIDATION.md`
- `tests/fixtures/toon/SPEC.md`
- `tests/fixtures/toon/LICENSE`
- All nine upstream JSON files in `tests/fixtures/toon/encode/`
- `tests/vendor/toon_format-1.2.0-py3-none-any.whl`
- `tests/vendor/toon-format-LICENSE`

## Decision ledger

| Executor choice | Decision and rationale |
| --- | --- |
| Specification version | Pin v3.0.0 at commit `c09f73b267323190f61de5b91563fa579b3b7c5e`, matching existing empty array syntax and flat tables with published fixtures. |
| Independent decoder strategy | Vendor the unchanged official `toon-format` 1.2.0 wheel, whose separate lexer and parser accept this v3.0 syntax; calibrate that overlap against 114 upstream cases. Python zip import keeps development validation offline and needs no installed package or Node runtime. For deep collection checks, encode at the existing recursion limit, temporarily raise it only while the recursive external decoder runs, and restore it before iterative value/type comparison. |
| Fixture organization | Copy upstream encode fixtures, specification, and license into `tests/fixtures/toon/`; place the wheel and its license in `tests/vendor/`; extend the existing focused test module so the specified command runs every new test. |
| Internal encoder structure | Validate the complete JSON value before building output; reject unsupported built-in domain values with paths; track ancestors to reject cycles while accepting repeated references; allow tables only where the grammar permits them. Support every JSON root form for the upstream fixtures. Keep ordinary integer conversion and use standard library Decimal formatting when Python's string conversion limit would reject a finite integer. Validation and output traversal use explicit iterator stacks; first fields carried by list items use a prefix while retaining logical depth. Encoding does not alter the interpreter recursion limit. |

Assumptions: the supported host representations are built-in JSON types, with strings containing Unicode scalar values and string object keys.
JSON numbers permit the specification's equivalence of negative zero with zero and integral floats with integers.
The task expressly requires rejecting destructive nonfinite normalization.
The 33 fixtures requesting unsupported formatting options are outside the encoder's fixed configuration, as documented in `README.md`.
There are no unresolved material choices and no named task blockers.

## Observed red and green evidence

All test names below are in `tests/test_prd_bundle_interview_toon.py`.
Each named test subsequently passed in the final focused run.

| Check | Observed red evidence | Green implementation or restored behavior |
| --- | --- | --- |
| `test_rejects_unsupported_values_instead_of_changing_their_meaning` | The initial encoder silently accepted ten invalid cases; a circular list recursed. A later extension separately failed on surrogate values and keys. | Complete validation rejects unsupported objects, bytes, tuples, sets, Decimal, datetime, nonfinite floats, non-string keys, cycles, and Unicode surrogates with data paths. |
| `test_specification_fixtures_preserve_json_values_and_types` | 41 upstream cases failed because supported JSON root values were treated as dictionaries. | Root dictionaries, arrays, and primitives encode and independently decode; all 114 selected fixture cases match their published text and JSON values. |
| `test_arrays_of_uniform_objects_inside_arrays_use_list_form` | The original encoder emitted a keyless table on a list item line instead of the required nested list form. | Nested anonymous arrays disable table selection; the exact required structure and independent decoding both pass. |
| `test_strings_preserve_content_in_every_structural_position` | Independent decoding discarded a root `#` string, rejected a table with a `#` cell as missing its row, and removed a root byte order mark from data. Restoring the original key regex match also failed the literal assertion for a key ending with a newline. | Quote strings beginning with `#` or U+FEFF and require keys to match the complete identifier pattern; root, key, array, and table positions preserve values. |
| `test_empty_nested_collections_and_reordered_table_fields_remain_distinct` | Replacing nested object output with null caused three assertion failures. | Restoring object output passes the check, including empty collections, first fields opening nested scopes, reordered fields, different fields, aliases, and payload immutability. |
| `test_numeric_boundaries_preserve_numbers_and_boolean_types` | Changing boolean output to numeric `1` or `0` failed the explicit JSON type assertion. | Boolean literals remain separate from numbers; extreme finite floats, subnormal values, negative zero, integral floats, and large integers decode faithfully. |
| `test_integer_encoding_preserves_digits_beyond_the_interpreter_string_limit` | A 5001 digit finite integer failed with Python's 4300 digit conversion limit. | Decimal formatting preserves every digit; the independent decoder's public integer hook verifies the result. |
| `test_schema_validation_and_inspection_payloads_decode_independently` | Increasing every declared array length by one caused independent count failures for all six command payloads. | Correct lengths pass for the complete schema catalog, all block schemas, validation success and failure, generation, and complete bundle inspection. |
| `test_complete_interview_replay_decodes_without_installed_packages` | Omitting `record` fields from encoder output failed the complete expected response assertion. | A real replay in an isolated Python process preserves four answer choices, selected labels, a written answer, reasons, notes, comment, instructions, nested records, and next commands. Stored answer bytes and HTTP result content also remain equal. |
| `test_collections_at_depth_500_preserve_empty_leaves` | Before the fix, all six object, array, and alternating wrapper cases raised RecursionError during output construction. | Output helpers yield child iterators drained by an explicit stack; all six payloads independently decode with empty object and array leaves distinguished. |
| `test_collections_at_depth_1500_preserve_siblings_and_leaf_types` | After fixing output traversal, all three cases still failed in recursive preflight validation. | Validation also uses an explicit iterator stack; object, array, and alternating wrappers preserve siblings, empty leaves, booleans, nulls, numeric strings, and table content. |
| `test_invalid_leaves_and_cycles_at_depth_1500_fail_explicitly` | Removing nonfinite validation caused three failures because NaN and both infinities encoded without an error. | Unsupported leaves, nonfinite numbers, non-string keys, and cycles are explicitly rejected at depth 1500; a subsequent valid encoding succeeds. |

The mutations above were reverted immediately after their failing runs.
They exercise wrong arguments, wrong branch results, omitted content, default object output, and missing input validation.
The initial inspection payload test used the wrong generated bundle name; that setup error was corrected before counting its mutation result as red evidence.

## Requirement evidence map

These executor observations are supported by independent verifier pass 2, which classified every Required behavior and Acceptance item as covered.
Test names are abbreviated by their distinctive suffixes from the table above.

| Task item | Implementation and observed evidence |
| --- | --- |
| Required behavior 1: REQ-09, RISK-02, REQ-10, DEC-07 | Independent fixture and payload decoding, strict JSON type comparison, preflight validation, and isolated Python 3.14 interview replay cover conformance, oracle independence, and the operational dependency boundary. |
| Required behavior 2: pin specification and fixture source | Encoder documentation and `README.md` pin the commit; manual verification compared the specification, license, and all nine fixture files byte for byte with that commit. |
| Required behavior 3: supported values and JSON types | `specification_fixtures`, `strings`, `numeric_boundaries`, `integer_encoding`, `empty_nested_collections`, and the depth 500/1500 checks pass; 10000 additional deterministic payloads through depth eight preserve values and types and match the staged encoder's bytes. |
| Required behavior 4: all listed string, scalar, collection, and table cases | The 114 fixtures plus `strings`, `empty_nested_collections`, and `numeric_boundaries` exercise quoted delimiters, Unicode, multiline data, numeric strings, booleans, nulls, every empty type, nested collections, uniform tables, and different object fields. |
| Required behavior 5: returned array lengths | Lengths use the actual list size; upstream exact text checks and independent strict decoding pass. The length mutation failed for real payloads. |
| Required behavior 6: reject unsupported internal values | `rejects_unsupported_values` checks explicit error paths; validation occurs before output construction. |
| Required behavior 7: representative schema, validation, inspection, and complete interview | `schema_validation_and_inspection` and `complete_interview_replay` pass against real command and HTTP interfaces. |
| Required behavior 8: Python 3.14 and standard library operation | `complete_interview_replay` invokes the CLI through the Python 3.14 executable with `-I -S`; the full Python suite also passes. |
| Required behavior 9: development oracle boundary | Only `tests/toon_oracle.py` imports the wheel; the isolated operational process succeeds without site packages or the test path. |
| Acceptance TEST-13 | All 114 specification cases, representative payload checks, and the depth 500/1500 checks independently decode to the supported values and types. |
| Acceptance: explicit invalid value failures | `rejects_unsupported_values` passes, including NaN and both infinities. |
| Acceptance: distinguish empty and nested collections | `empty_nested_collections`, upstream array/object fixtures, and the depth 500/1500 checks pass; empty object, empty array, empty string, and null remain distinct. |
| Acceptance: table headers, widths, and lengths agree | Published expected table text matches; strict independent decoding checks widths and counts; reordered and quoted field cases pass; five deliberately malformed count/width examples were independently rejected. |
| Acceptance TEST-14 | The complete interview replay runs with Python 3.14 and `-I -S`; 340 tests in the full Python suite pass. |

## Validation commands and boundaries

Commands run from the repository root.
Their targets were local Python processes, temporary documents and interview sessions, loopback HTTP servers, and local tool caches.
Test helpers isolated interview registries and suppressed real browser opening.
`pnpm` also refreshed local `node_modules` from the existing lockfile.
Public fixture and package downloads were read operations; no command deployed or mutated shared or remote state.

### New behavior coverage

```sh
uv run --no-project --isolated --python 3.14 python plugins/project-advisor/skills/to-prd/tests/run_parallel.py test_prd_bundle_interview_toon
```

Observed after the G1 fix: 25 tests passed, including 114 specification subcases and all twelve new test methods.
The interview subprocess used the same Python 3.14 interpreter with `-I -S`.

### Regression coverage

```sh
pnpm test:py:fast
pnpm test:py
```

Observed after the G1 fix: 330 tests passed in the requested fast suite; 340 tests passed in the full suite.
Neither run reported skipped tests.

### Manual verification

```sh
pnpm lint:py
git diff --check
```

Observed: Ruff lint and formatting checks passed, and both staged and unstaged diffs had no whitespace errors.
These checks provide no additional evidence about behavior.

A local Python probe using `random.Random(904)` independently decoded 3000 generated JSON payloads at nesting depths up to five with exact JSON type comparison; all passed.
The probe also confirmed that five malformed array/table counts or row widths raise errors.
Read operations against the pinned GitHub commit confirmed byte equality of the specification, license, and nine fixture files.
The vendored wheel's SHA256 matched PyPI's published digest.

After the G1 fix, a probe with `random.Random(904)` independently decoded 10000 generated JSON payloads through depth eight and compared their output byte for byte with the staged encoder; all passed.
An isolated Python 3.14.9 process with `-I -S` encoded all four object/array wrapper and empty leaf combinations at depths 500 and 2000 with the recursion limit remaining 1000.
At depth 500, the original standard library JSON round trip also passed for each payload.

## Independent verification and task state

The user supplied a complete report from independent verifier pass 1.
It reported no blocked validation and classified every item as covered except Required behavior 1 and 3, Acceptance TEST-13, and the acceptance item for distinguishing nested collections.
Those four classifications shared gap G1: valid object and array chains at depth 500 exhausted the recursive encoder's call stack even though standard library JSON could round trip them.

The verifier reported passing the original 22 focused tests, 327 fast tests, and 337 full tests, with no skips, plus lint and whitespace checks.
Its adversarial probes reported successful string, numeric, large integer, mixed collection, alias, invalid input, malformed document, interview persistence, HTTP, isolated operational command, and oracle provenance checks.
The reported additional probes included 12534 string round trips, 11996 finite float cases, 10000 generated payloads through depth six, three large signed integers, 17 invalid values, and eight malformed documents.
These results are attributed to the supplied verifier report rather than new executor runs.

### G1 disposition

G1 is valid and within the supported JSON contract.
The executor reproduced all four reported failures on Python 3.14.9 with recursion limit 1000 before changing code.
Output traversal and preflight validation now use explicit stacks.
The three new tests above cover the original depth 500 boundary, valid collections beyond the default recursion limit, and invalid leaves and cycles at depth 1500.
The updated focused, fast, full, lint, and whitespace checks all pass as recorded above.
No gap was rejected and no task behavior is blocked.

### Final verifier pass 2

The user supplied a complete report from a fresh verifier rerun against working files matching the index.
The verifier reported that the staged diff fingerprint remained identical throughout verification and that it made no edits.
It classified all nine Required behavior items and all five Acceptance items as covered, confirmed G1 resolved, and found no gaps or blocked items.

New behavior coverage reported by the verifier:

- The focused validation command passed all 25 tests, including 114 specification cases.
- The original depth 500 reproduction passed, as did 27 additional independently decoded payloads at depths 500, 1500, and 2000.
- Additional probes passed 12534 string round trips, 11996 finite float cases, three large signed integers, and 10000 generated mixed payloads.
- Alias identity and payload content were preserved.
- Seventeen invalid cases were rejected before construction both ordinarily and at depth 2000, with no partial stdout and successful subsequent valid encoding.
- The oracle rejected eight malformed documents, and the comparison helper rejected seven deliberate value, type, and shape mismatches.
- Complete interview replay preserved answer content, stored answer bytes, and HTTP results.
- The depth tests failed against the baseline encoder loaded in memory.

Regression coverage reported by the verifier: `pnpm test:py:fast` passed 330 tests and `pnpm test:py` passed 340 tests.
No tests reported skips.

Manual verification reported by the verifier: lint, formatting, and staged whitespace checks passed.
Isolated Python 3.14 execution with `-I -S` encoded all eight object/array and empty leaf cases at depths 500 and 2000 while retaining recursion limit 1000.
Isolated operational success and failure paths passed with expected exits.
Specification, license, and fixture files matched their pinned source; PyPI digest, wheel license, and all 11 RECORD digest and size checks passed.
These results are attributed to the supplied verifier report rather than new executor runs.

Two independent passes have been reported, within the default limit of three.
There are no remaining gaps, rejected gaps, blocked behavior, or untested required items.
The 33 optional formatting fixture cases remain outside the fixed encoder contract, with the boundary recorded in `README.md`.
The task is marked `done` because the final independent verifier supplied full coverage.
