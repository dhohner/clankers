"""The `interview` command group, which prints TOON and uses AXI exit codes."""

from __future__ import annotations

import argparse
import shlex
from collections.abc import Callable
from pathlib import Path
from typing import Any, NoReturn

from ..interview import Round, RoundError, validate_round
from ..toon import dumps
from ..yaml_manifest import YamlError, loads
from .support import display_path, next_command

EXIT_OK = 0
EXIT_ERROR = 1
EXIT_USAGE = 2
COMMANDS = ("ask", "open", "status", "end")
SESSION_EXCLUDED_DIR = "action-items"

GROUP_EPILOG = """\
Each interview command prints TOON to stdout, for a result and for an error.
Exit codes: 0 success, 1 error, 2 unknown flag or usage error.
No command reads terminal input.
"""

ROUND_FILE_HELP = """\
The round file is YAML or JSON:

  # id: ROUND-<digits>, names the round
  id: ROUND-01
  questions:
    # node: NODE-<digits>, unique in the round
    - node: NODE-03
      label: Storage
      question: Where does the session keep answers?
      # multi_select: true or false
      multi_select: false
      # options: at least one, labels unique
      options:
        - label: Session directory
          description: Files next to the scratch prd.yaml.
          # recommended: exactly one for single-select, at least one for multi-select
          recommended: true

An invalid round prints every fault with a path and a fix, exits with 1, and opens no round.
Prints TOON to stdout.
"""


class UsageError(Exception):
    pass


class InterviewFailure(Exception):
    def __init__(self, payload: dict[str, Any]) -> None:
        super().__init__(payload["code"])
        self.payload = payload


class ToonArgumentParser(argparse.ArgumentParser):
    """Raise usage errors so the caller prints them as TOON instead of plain usage text."""

    def error(self, message: str) -> NoReturn:
        raise UsageError(message)


def _build_parser() -> ToonArgumentParser:
    parser = ToonArgumentParser(
        prog="to-prd interview",
        description="Run browser interview rounds for a PRD session. Prints TOON to stdout.",
        epilog=GROUP_EPILOG,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    ask = subparsers.add_parser(
        "ask",
        help="ask one round in the browser and print the answers",
        description="Validate a round file and ask it in the browser. Prints TOON to stdout.",
        epilog=ROUND_FILE_HELP,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    _session_argument(ask)
    ask.add_argument("round_file", type=Path, help="path of one round file")

    for name, summary in (
        ("open", "open the interview page for the session again"),
        ("status", "show the interview state of the session"),
        ("end", "end the interview session"),
    ):
        command = subparsers.add_parser(
            name,
            help=summary,
            description=f"{summary.capitalize()}. Prints TOON to stdout.",
            epilog=GROUP_EPILOG,
            formatter_class=argparse.RawDescriptionHelpFormatter,
        )
        _session_argument(command)
    return parser


def _session_argument(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "session_dir",
        type=Path,
        help=f"existing session directory outside {SESSION_EXCLUDED_DIR}/",
    )


def main(argv: list[str]) -> int:
    try:
        args = _build_parser().parse_args(argv)
    except UsageError as error:
        return _emit(_usage_payload(str(error), argv), EXIT_USAGE)
    try:
        payload = HANDLERS[args.command](args)
    except InterviewFailure as failure:
        return _emit(failure.payload, EXIT_ERROR)
    return _emit(payload, EXIT_OK)


def _emit(payload: dict[str, Any], exit_code: int) -> int:
    print(dumps(payload))
    return exit_code


def command_ask(args: argparse.Namespace) -> dict[str, Any]:
    session = resolve_session(
        args.session_dir, f"ask <session-dir> {_quoted(args.round_file)}"
    )
    round_ = load_round(args.round_file, session)
    raise _not_available(
        "ask",
        session,
        round=round_["id"],
        questions=len(round_["questions"]),
    )


def command_open(args: argparse.Namespace) -> dict[str, Any]:
    raise _not_available("open", resolve_session(args.session_dir, "open <session-dir>"))


def command_status(args: argparse.Namespace) -> dict[str, Any]:
    raise _not_available("status", resolve_session(args.session_dir, "status <session-dir>"))


def command_end(args: argparse.Namespace) -> dict[str, Any]:
    raise _not_available("end", resolve_session(args.session_dir, "end <session-dir>"))


HANDLERS: dict[str, Callable[[argparse.Namespace], dict[str, Any]]] = {
    "ask": command_ask,
    "open": command_open,
    "status": command_status,
    "end": command_end,
}


def resolve_session(path: Path, retry_arguments: str) -> Path:
    """Return the resolved session directory, or fail when it is unusable.

    `retry_arguments` is the full argument template after `interview`, with `<session-dir>`
    in place of the session directory.
    """
    retry = [_interview_command(retry_arguments)]
    try:
        resolved = path.resolve(strict=True)
    except FileNotFoundError as error:
        raise _failure(
            "session_not_found",
            "session_dir",
            f"{path} does not exist",
            "Create the session directory outside action-items/, then run the command again.",
            retry,
            session=str(path),
        ) from error
    except OSError as error:
        raise _failure(
            "session_unreadable",
            "session_dir",
            f"cannot resolve {path}: {error}",
            "Pass a readable session directory.",
            retry,
            session=str(path),
        ) from error
    if SESSION_EXCLUDED_DIR in resolved.parts:
        raise _failure(
            "session_in_action_items",
            "session_dir",
            f"{resolved} is inside {SESSION_EXCLUDED_DIR}/",
            f"Use a scratch session directory outside {SESSION_EXCLUDED_DIR}/.",
            retry,
            session=display_path(resolved),
        )
    if not resolved.is_dir():
        raise _failure(
            "session_not_directory",
            "session_dir",
            f"{resolved} is not a directory",
            "Pass the session directory, not a file inside it.",
            retry,
            session=display_path(resolved),
        )
    return resolved


def load_round(path: Path, session: Path) -> Round:
    """Parse and validate one round file, or fail with every fault found."""
    retry = [_interview_command(f"ask {_quoted(session)} {_quoted(path)}")]
    help_command = _interview_command("ask --help")
    fields = {"session": display_path(session), "round_file": display_path(path)}
    try:
        raw = loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as error:
        raise _failure(
            "round_not_found",
            "round_file",
            f"{path} does not exist",
            "Write the round file, then pass its path.",
            [_interview_command(f"ask {_quoted(session)} <round-file>"), help_command],
            **fields,
        ) from error
    except YamlError as error:
        raise _failure(
            "round_unparseable",
            "round",
            f"line {error.line}, {error}",
            "Repair the YAML or JSON syntax of the round file.",
            [*retry, help_command],
            **fields,
        ) from error
    except (OSError, UnicodeDecodeError) as error:
        raise _failure(
            "round_unreadable",
            "round_file",
            f"cannot read {path}: {error}",
            "Pass a readable UTF-8 round file.",
            [*retry, help_command],
            **fields,
        ) from error
    try:
        return validate_round(raw)
    except RoundError as error:
        raise InterviewFailure(
            _error_payload(
                "round_invalid",
                error.faults,
                [*retry, help_command],
                **fields,
                total_errors=len(error.faults),
            )
        ) from error


def _not_available(command: str, session: Path, **fields: Any) -> InterviewFailure:
    return _failure(
        "not_available",
        "command",
        f"interview {command} is not available yet",
        "Ask the round in the chat until the browser interview is available.",
        [_interview_command("--help")],
        command=f"interview {command}",
        session=display_path(session),
        **fields,
    )


def _usage_payload(message: str, argv: list[str]) -> dict[str, Any]:
    command = argv[0] if argv and argv[0] in COMMANDS else ""
    help_command = _interview_command(f"{command} --help" if command else "--help")
    return _error_payload(
        "usage_error",
        [{"path": "arguments", "message": message, "fix": f"Run {help_command} for the usage."}],
        [help_command],
    )


def _failure(
    code: str,
    path: str,
    message: str,
    fix: str,
    next_steps: list[str],
    **fields: Any,
) -> InterviewFailure:
    fault = {"path": path, "message": message, "fix": fix}
    return InterviewFailure(_error_payload(code, [fault], next_steps, **fields))


def _error_payload(
    code: str,
    faults: list[Any],
    next_steps: list[str],
    **fields: Any,
) -> dict[str, Any]:
    return {"status": "error", "code": code, **fields, "errors": faults, "next": next_steps}


def _interview_command(arguments: str) -> str:
    return next_command(f"interview {arguments}")


def _quoted(path: Path) -> str:
    return shlex.quote(display_path(path))


__all__ = ["main"]
