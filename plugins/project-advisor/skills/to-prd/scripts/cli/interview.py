"""The `interview` command group, which prints TOON and uses AXI exit codes."""

from __future__ import annotations

import argparse
import shlex
import sys
from collections.abc import Callable
from pathlib import Path
from typing import Any, NoReturn

from ..interview import Round, RoundError, validate_round
from ..interview.client import (
    ServerUnavailable,
    base_url,
    end_server,
    notify_delivery,
    open_page,
    page_url,
    server_responds,
    start_server,
    wait_for_result,
)
from ..interview.record import answered_fields
from ..interview.registry import unregister
from ..interview.server import BROWSER_DISCONNECTED
from ..interview.session import (
    ENDED,
    NO_SESSION,
    RoundAnswers,
    SessionFiles,
    SessionState,
    SessionSummary,
    open_round_ids,
    read_state,
    record_delivery,
    server_running,
    session_lock,
    store_round,
    stored_answers,
    stored_round,
    summarize,
    write_state,
)
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
The other commands print YAML.
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
    session = resolve_session(args.session_dir, f"ask <session-dir> {_quoted(args.round_file)}")
    round_ = load_round(args.round_file, session)
    files = SessionFiles(session)
    # The link goes to the user only when the browser did not open it.
    link = None
    with session_lock(files):
        state = read_state(files)
        if _is_ended(state):
            return _ended_payload(session, round=round_["id"])
        answers = _open_or_replay(files, round_, args.round_file)
        if answers is not None:
            _record_replay(files, state, round_["id"])
            return _answered_payload(session, round_, answers)
        if not server_responds(files, state):
            if server_running(files):
                raise _failure(
                    "server_unresponsive",
                    "server",
                    f"the interview server of {display_path(session)} runs but does not answer",
                    "Wait, then run the same interview ask again. The session keeps the round.",
                    _ask_again(session, args.round_file),
                    session=display_path(session),
                    round=round_["id"],
                )
            previous_port = state.get("port") if state is not None else None
            state = _start_server(
                files,
                "Run the same interview ask again. The session keeps the round.",
                _ask_again(session, args.round_file),
            )
            # A page that is still open reconnects to a server on its previous port.
            if state["port"] != previous_port:
                url = page_url(state)
                if not open_page(url):
                    link = url
    print(
        f"interview ask: waiting for {round_['id']} at {base_url(state)}/ "
        f"(session {display_path(session)})",
        file=sys.stderr,
        flush=True,
    )
    try:
        result = wait_for_result(state, round_["id"])
    except ServerUnavailable as error:
        state = read_state(files)
        if _is_ended(state):
            return _ended_payload(session, round=round_["id"])
        raise _failure(
            "server_stopped",
            "server",
            str(error),
            "Run the same interview ask again. The session keeps the round.",
            _ask_again(session, args.round_file),
            session=display_path(session),
            round=round_["id"],
        ) from error
    if result["state"] == ENDED:
        return _ended_payload(session, round=round_["id"])
    if result["state"] == BROWSER_DISCONNECTED:
        return _disconnected_payload(session, round_, args.round_file, link)
    return _answered_payload(session, round_, result["answers"])


def command_open(args: argparse.Namespace) -> dict[str, Any]:
    session = resolve_session(args.session_dir, "open <session-dir>")
    files = SessionFiles(session)
    if not files.state.exists():
        raise _no_session(session)
    with session_lock(files):
        state = read_state(files)
        if state is None:
            raise _no_session(session)
        if _is_ended(state):
            return _ended_payload(session)
        if not server_responds(files, state):
            if server_running(files):
                raise _failure(
                    "server_unresponsive",
                    "server",
                    f"the interview server of {display_path(session)} runs but does not answer",
                    "Wait, then run interview open again.",
                    [_interview_command(f"open {_quoted(session)}"), *_ask_next(files)[1:]],
                    session=display_path(session),
                )
            state = _start_server(
                files,
                "Run interview open again. The session keeps its rounds.",
                [_interview_command(f"open {_quoted(session)}"), *_ask_next(files)[1:]],
            )
        url = page_url(state)
        return _opened_payload(files, None if open_page(url) else url)


def command_status(args: argparse.Namespace) -> dict[str, Any]:
    session = resolve_session(args.session_dir, "status <session-dir>")
    files = SessionFiles(session)
    # A directory without a session gets no lock file, so the status leaves it unchanged.
    if not files.state.exists():
        return _status_payload(files, summarize(files), running=False)
    with session_lock(files):
        return _status_payload(files, summarize(files), running=server_running(files))


def command_end(args: argparse.Namespace) -> dict[str, Any]:
    session = resolve_session(args.session_dir, "end <session-dir>")
    files = SessionFiles(session)
    if not files.state.exists():
        raise _no_session(session)
    with session_lock(files):
        state = read_state(files)
        if state is None:
            raise _no_session(session)
        try:
            end_server(files, state)
        except ServerUnavailable as error:
            raise _failure(
                "server_not_stopped",
                "server",
                str(error),
                "Run interview end again. The end is complete once the server stops.",
                [_interview_command(f"end {_quoted(session)}")],
                session=display_path(session),
            ) from error
        # A server that crashed left its registry entry behind.
        unregister(session)
        if state["state"] != ENDED:
            write_state(files, {"state": ENDED})
    return _ended_payload(session)


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


def _is_ended(state: SessionState | None) -> bool:
    return state is not None and state["state"] == ENDED


def _open_or_replay(files: SessionFiles, round_: Round, round_file: Path) -> RoundAnswers | None:
    """Store a new round, or return the stored answers of the same round.

    A changed round under a stored round id, or a new round while another round is open,
    fails, so the user's draft of the open round stays intact.
    """
    session = files.session
    stored = stored_round(files, round_["id"])
    if stored is None:
        open_ids = open_round_ids(files)
        if open_ids:
            open_file = files.round_path(open_ids[0])
            raise _failure(
                "round_open",
                "round",
                f"{open_ids[0]} is open, so {round_['id']} cannot open",
                f"Wait for the answers of {open_ids[0]} with its round file, or end the session.",
                _ask_again(session, open_file),
                session=display_path(session),
                round=round_["id"],
                open_round=open_ids[0],
            )
        store_round(files, round_)
        return None
    if stored != round_:
        raise _failure(
            "round_changed",
            "round",
            f"{round_['id']} differs from the round stored under the same id",
            "Give the changed round a new round id, or ask the stored round again.",
            _ask_again(session, files.round_path(round_["id"])),
            session=display_path(session),
            round=round_["id"],
            round_file=display_path(round_file),
        )
    return stored_answers(files, round_["id"])


def _record_replay(files: SessionFiles, state: SessionState | None, round_id: str) -> None:
    """Record that this ask prints the stored answers, and tell the open page.

    Neither step may change the output of the ask, so a failed write leaves the page at
    "round submitted".
    """
    try:
        record_delivery(files, round_id)
    except OSError:
        return
    notify_delivery(files, state, round_id)


def _start_server(files: SessionFiles, fix: str, retry: list[str]) -> SessionState:
    try:
        return start_server(files)
    except ServerUnavailable as error:
        raise _failure(
            "server_start_failed",
            "server",
            str(error),
            fix,
            retry,
            session=display_path(files.session),
        ) from error


def _answered_payload(session: Path, round_: Round, answers: RoundAnswers) -> dict[str, Any]:
    return {
        "status": "answered",
        "session": display_path(session),
        "round": round_["id"],
        **answered_fields(round_, answers),
        "next": [
            _interview_command(f"ask {_quoted(session)} <next-round-file>"),
            _interview_command(f"end {_quoted(session)}"),
        ],
    }


def _status_payload(files: SessionFiles, summary: SessionSummary, running: bool) -> dict[str, Any]:
    session = files.session
    if summary.state == NO_SESSION:
        next_steps = [_interview_command(f"ask {_quoted(session)} <round-file>")]
    elif summary.state == ENDED:
        next_steps = [_interview_command("ask <new-session-dir> <round-file>")]
    else:
        next_steps = _ask_next(files)
    return {
        "status": "ok",
        "session": display_path(session),
        "state": summary.state,
        "server_running": running,
        "rounds_asked": summary.rounds_asked,
        "rounds_answered": summary.rounds_answered,
        "questions_deferred": summary.questions_deferred,
        "next": next_steps,
    }


def _opened_payload(files: SessionFiles, link: str | None) -> dict[str, Any]:
    """Report the opened page, or the link for the user when the browser did not open."""
    if link is None:
        status = "opened"
        message = "The interview page is open in the browser."
    else:
        status = "browser_failed"
        message = "The browser did not open. Give the user the link to the interview page."
    return {
        "status": status,
        "session": display_path(files.session),
        "message": message,
        **({"link": link} if link is not None else {}),
        "next": _ask_next(files),
    }


def _ask_next(files: SessionFiles) -> list[str]:
    """Return the ask for the open round, or for the next round when none is open, and end."""
    open_ids = open_round_ids(files)
    if open_ids:
        return _ask_again(files.session, files.round_path(open_ids[0]))
    return [
        _interview_command(f"ask {_quoted(files.session)} <next-round-file>"),
        _interview_command(f"end {_quoted(files.session)}"),
    ]


def _disconnected_payload(
    session: Path, round_: Round, round_file: Path, link: str | None
) -> dict[str, Any]:
    message = (
        "No interview page is connected, and the round stays open. Ask the user whether "
        "to open the page again or to end the session."
    )
    if link is not None:
        message = f"The browser did not open. Give the user the link. {message}"
    return {
        "status": BROWSER_DISCONNECTED,
        "session": display_path(session),
        "round": round_["id"],
        "message": message,
        **({"link": link} if link is not None else {}),
        "next": [
            _interview_command(f"open {_quoted(session)}"),
            *_ask_again(session, round_file),
        ],
    }


def _ended_payload(session: Path, **fields: Any) -> dict[str, Any]:
    return {
        "status": ENDED,
        "session": display_path(session),
        **fields,
        "message": "The interview session has ended. Start a new session in a new directory.",
        "next": [_interview_command("ask <new-session-dir> <round-file>")],
    }


def _no_session(session: Path) -> InterviewFailure:
    return _failure(
        "no_session",
        "session_dir",
        f"{display_path(session)} has no interview session",
        "Start the session with interview ask and a round file.",
        [_interview_command(f"ask {_quoted(session)} <round-file>")],
        session=display_path(session),
    )


def _ask_again(session: Path, round_file: Path) -> list[str]:
    return [
        _interview_command(f"ask {_quoted(session)} {_quoted(round_file)}"),
        _interview_command(f"end {_quoted(session)}"),
    ]


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
