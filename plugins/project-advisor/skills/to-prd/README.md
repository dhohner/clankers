# Write a PRD

The `to-prd` skill turns a product idea or PRD review note into a validated local review bundle.
The agent owns product judgment, repository grounding, uncertainty, and block selection.
The generator owns schema validation, escaping, canonical rendering, asset copying, structural validation, and atomic publication.

## Output

```text
action-items/PRD-<slug>/
├── index.html
├── prd.yaml
└── assets/
    ├── app.js
    ├── favicon.svg
    ├── styles.css
    └── fonts/
```

`prd.yaml` is the normalized planning source and records the interview design tree beside the decisions.
`index.html` is the human review surface.
The bundle copies its assets, including two OFL-licensed fonts and their license texts.
A reviewer therefore needs no plugin and sees identical typography on every machine.

The bundle is a screen artifact and does not support printing.
Diagrams load Mermaid from `cdn.jsdelivr.net` at review time and fall back to their text source without a network.

## Workflow

`SKILL.md` holds the loop: ground the decision, author the manifest, publish and inspect, hold the review gate.
The agent asks each interview round in the local browser with `interview ask`, and holds the review gate in the chat.
Acceptance sets `status: Accepted` in the published `prd.yaml`, which `to-issues` and `to-agent-tasks` read.
Review feedback on an existing PRD re-enters the loop as a revision of a scratch copy of `prd.yaml`.
[references/manifest-contract.md](references/manifest-contract.md) describes the manifest versions and the rules the CLI does not print.

## CLI

From the repository root, publish a bundle with:

```sh
python3 plugins/project-advisor/skills/to-prd/scripts/__main__.py validate plugins/project-advisor/skills/to-prd/examples/minimal-prd.yaml
python3 plugins/project-advisor/skills/to-prd/scripts/__main__.py generate plugins/project-advisor/skills/to-prd/examples/minimal-prd.yaml
python3 plugins/project-advisor/skills/to-prd/scripts/__main__.py inspect action-items/PRD-minimal-prd/
```

Commands:

- `status`: workspace dashboard and the no-argument default.
- `schema [block ...]`: manifest fields, supported blocks, and block examples.
- `template --blocks <block ...>`: valid placeholder manifest for the selected blocks.
- `examples [name]`: bundled manifest examples.
- `validate <prd.yaml>`: validate without writing.
- `generate <prd.yaml>`: generate after validation.
- `inspect <bundle-dir>`: summarize generated structure, assets, anchors, traceability, and validation.
- `interview <command>`: browser interview rounds, described in [Interview](#interview).

Options:

- `--output-root <directory>` changes the bundle parent for `status` and `generate`.
- `--force` replaces an existing bundle with the same slug after the new output validates.
- `--format yaml|text` selects the output format, and non-template commands default to YAML.
  The `interview` commands take no `--format`.
- `--full` expands large `validate` and `inspect` output.

The CLI needs Python 3.14 or newer, without a virtual environment, package installation, or Node.js.
Only `interview ask` and `interview open` use a browser, and they open the local default browser.

## Interview

The `interview` commands ask the rounds of one session on a local page.
A session directory is a scratch directory outside `action-items/`.
It holds the scratch `prd.yaml`, the round files, and the `interview/` directory with the answers and the server state.
Each PRD and each revision starts a new session.

```sh
python3 plugins/project-advisor/skills/to-prd/scripts/__main__.py interview ask <session-dir> <round-file>
python3 plugins/project-advisor/skills/to-prd/scripts/__main__.py interview open <session-dir>
python3 plugins/project-advisor/skills/to-prd/scripts/__main__.py interview status <session-dir>
python3 plugins/project-advisor/skills/to-prd/scripts/__main__.py interview end <session-dir>
```

- `interview ask <session-dir> <round-file>` validates the round file and starts the session server when none runs.
  - It opens the page when the session gets its first server or a new port, so a closed tab needs `interview open`.
  - It blocks until the round has a result, and prints `answered`, `browser_disconnected`, or `ended`.
  - An `answered` result holds each answer with its design tree `record` and the `instructions` to write it.
  - An ask for an answered round prints the stored answers at once.
  - `interview ask --help` prints the round file fields and an example.
- `interview open <session-dir>` opens the page again, and starts the server again when it has stopped.
- `interview status <session-dir>` prints the session state, whether the server runs, and the counts of asked rounds, answered rounds, and deferred questions.
- `interview end <session-dir>` ends the session and stops its server.
  - A second `interview end` on the same session succeeds.

Each `interview` command prints TOON to stdout, for a result and for an error.
Each result and error holds `next` lines with the commands that can follow.

Exit codes:

- `0`: success, including `browser_disconnected` and `ended`.
- `1`: error, such as an invalid round file or a session inside `action-items/`.
- `2`: unknown flag or usage error.

`status` lists the live interview sessions of the current workspace under `interview_sessions`, with the session directory and state of each.
A live session has a running server that a command started from the current directory.

With `TO_PRD_INTERVIEW_BROWSER_LOG` set to a file path, the commands append the page link to that file and open no browser.

### Page checklist

Use `playwright-cli` to check a live interview session in this order:

1. [Conversation and drafts](references/interview-page-checklist.md), including setup.
2. [Connection and submission](references/interview-submission-checklist.md).
3. [Lifecycle and policy](references/interview-lifecycle-checklist.md).

The test suite does not need `playwright-cli` or a browser.

## References

- `references/manifest-contract.md`: manifest versions and rules the CLI schema does not print.
- `references/review-checklist.md`: full bundle checklist when inspection is insufficient.
- `references/interview-page-checklist.md`: browser setup, conversation, and draft checks with `playwright-cli`.
- `references/interview-submission-checklist.md`: connection, submission, and competing tab checks.
- `references/interview-lifecycle-checklist.md`: round history, session lifecycle, and page policy checks.
- `examples/minimal-prd.yaml`: smallest valid manifest.
- `examples/basic-prd.yaml`: broad mixed-initiative example.
- `examples/fixtures/*.yaml`: focused examples by initiative type.
- `bundle/`: canonical HTML shell and versioned assets.
- `evals/`: regression prompts and expectations.

## Test

Run the suite from the repository root.
`pnpm test:py:fast` skips the harness self-tests of the time limits and the watchdog.

```sh
pnpm test:py
pnpm test:py:fast
```

The runner starts one `unittest` process for each `tests/test_prd_bundle_*.py` module, including the `interview` modules.
It prints the full output of each failing module, lists each skipped test with its reason, and ends with the ten slowest tests.
It also runs single modules or tests, each in its own process:

```sh
cd plugins/project-advisor/skills/to-prd
python3 tests/run_parallel.py
python3 tests/run_parallel.py test_prd_bundle_interview_toon
python3 tests/run_parallel.py test_prd_bundle_interview_toon.ToonWriterTests.test_prints_scalars_as_key_value_lines
```

The tests import their helpers as top-level modules, so plain `unittest` needs the tests directory on `PYTHONPATH`, or `discover` for the whole suite:

```sh
cd plugins/project-advisor/skills/to-prd
PYTHONPATH=tests python3 -m unittest --durations 10 test_prd_bundle_interview_toon
python3 -m unittest discover --durations 10 tests 'test_prd_bundle_*.py'
```

The interview tests fail any test that runs longer than about a second.
On a slow or loaded machine, set `TO_PRD_TEST_TIME_SCALE` to a positive factor for every time limit, such as `3`:

```sh
TO_PRD_TEST_TIME_SCALE=3 pnpm test:py
```

Lint and format the CLI with [ruff](https://docs.astral.sh/ruff/), configured in `ruff.toml`:

```sh
cd plugins/project-advisor/skills/to-prd
uvx ruff check .
uvx ruff format --check .
```

Ruff is a development tool only, so the CLI still runs with a bare `python3`.
