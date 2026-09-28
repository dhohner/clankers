"""Files of one interview session under `<session-dir>/interview/`.

The CLI and the server share these files, and they are the source of truth for the
session state, the stored rounds, the submitted answers, and the answers an ask returned.
"""

from __future__ import annotations

import contextlib
import fcntl
import json
import os
import tempfile
from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal, NotRequired, TypedDict

from .rounds import ROUND_ID_PATTERN, Round

ACTIVE = "active"
ENDED = "ended"
# Summary states besides ENDED: no state file, a stored round without answers, or answers
# for every stored round.
NO_SESSION = "no_session"
ROUND_OPEN = "round_open"
ROUND_ANSWERED = "round_answered"
PRIVATE_DIR_MODE = 0o700


class SessionState(TypedDict):
    state: Literal["active", "ended"]
    # The token, the address and the server pid exist only while the session is active.
    token: NotRequired[str]
    host: NotRequired[str]
    port: NotRequired[int]
    pid: NotRequired[int]


class QuestionAnswer(TypedDict):
    node: str
    choice: Literal["option", "written", "decide_later", "out_of_scope"]
    selected: list[str]
    written: str
    reason: str
    note: str


class RoundAnswers(TypedDict):
    round: str
    answers: list[QuestionAnswer]
    comment: str


@dataclass(frozen=True)
class SessionSummary:
    state: Literal["no_session", "round_open", "round_answered", "ended"]
    rounds_asked: int
    rounds_answered: int
    # The answers with the choice `decide_later`, over all answered rounds.
    questions_deferred: int


@dataclass(frozen=True)
class SessionFiles:
    session: Path

    @property
    def directory(self) -> Path:
        return self.session / "interview"

    @property
    def state(self) -> Path:
        return self.directory / "state.json"

    @property
    def rounds(self) -> Path:
        return self.directory / "rounds"

    @property
    def answers(self) -> Path:
        return self.directory / "answers"

    @property
    def delivered(self) -> Path:
        return self.directory / "delivered"

    @property
    def lock(self) -> Path:
        return self.directory / "lock"

    @property
    def server_lock(self) -> Path:
        return self.directory / "server.lock"

    def round_path(self, round_id: str) -> Path:
        return self.rounds / f"{round_id}.json"

    def answers_path(self, round_id: str) -> Path:
        return self.answers / f"{round_id}.json"

    def delivered_path(self, round_id: str) -> Path:
        return self.delivered / f"{round_id}.json"


@contextlib.contextmanager
def session_lock(files: SessionFiles) -> Iterator[None]:
    """Hold an exclusive lock that serializes CLI commands for one session."""
    files.directory.mkdir(mode=PRIVATE_DIR_MODE, exist_ok=True)
    descriptor = os.open(files.lock, os.O_RDWR | os.O_CREAT, 0o600)
    try:
        fcntl.flock(descriptor, fcntl.LOCK_EX)
        yield
    finally:
        os.close(descriptor)


def acquire_server_lock(files: SessionFiles) -> int | None:
    """Take the lock that the server of the session holds for its lifetime.

    Return the locked descriptor, which releases the lock when closed, or None while another
    process holds the lock. The kernel releases the lock when its holder exits, so a free
    lock proves that no server runs for the session.
    """
    files.directory.mkdir(mode=PRIVATE_DIR_MODE, exist_ok=True)
    descriptor = os.open(files.server_lock, os.O_RDWR | os.O_CREAT, 0o600)
    try:
        fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        os.close(descriptor)
        return None
    return descriptor


def server_running(files: SessionFiles) -> bool:
    descriptor = acquire_server_lock(files)
    if descriptor is None:
        return True
    os.close(descriptor)
    return False


def read_state(files: SessionFiles) -> SessionState | None:
    return _read_json(files.state)


def write_state(files: SessionFiles, state: SessionState) -> None:
    write_json_atomic(files.state, state)


def stored_round(files: SessionFiles, round_id: str) -> Round | None:
    return _read_json(files.round_path(round_id))


def store_round(files: SessionFiles, round_: Round) -> None:
    write_json_atomic(files.round_path(round_["id"]), round_)


def stored_answers(files: SessionFiles, round_id: str) -> RoundAnswers | None:
    return _read_json(files.answers_path(round_id))


def store_answers(files: SessionFiles, answers: RoundAnswers) -> None:
    write_json_atomic(files.answers_path(answers["round"]), answers)


def record_delivery(files: SessionFiles, round_id: str) -> None:
    """Record that an ask returned the answers of the round; a repeat leaves the same record."""
    write_json_atomic(files.delivered_path(round_id), {"round": round_id})


def is_delivered(files: SessionFiles, round_id: str) -> bool:
    return files.delivered_path(round_id).exists()


def stored_round_ids(files: SessionFiles) -> list[str]:
    if not files.rounds.is_dir():
        return []
    return sorted(
        path.stem for path in files.rounds.glob("*.json") if ROUND_ID_PATTERN.fullmatch(path.stem)
    )


def open_round_ids(files: SessionFiles) -> list[str]:
    """Return the ids of the stored rounds that have no stored answers."""
    return [
        round_id
        for round_id in stored_round_ids(files)
        if not files.answers_path(round_id).exists()
    ]


def summarize(files: SessionFiles) -> SessionSummary:
    """Return the session state and its round counts; without a state file, all counts are 0."""
    state = read_state(files)
    if state is None:
        return SessionSummary(NO_SESSION, 0, 0, 0)
    round_ids = stored_round_ids(files)
    answered = [
        answers
        for answers in (stored_answers(files, round_id) for round_id in round_ids)
        if answers is not None
    ]
    deferred = sum(
        answer["choice"] == "decide_later" for round_ in answered for answer in round_["answers"]
    )
    if state["state"] == ENDED:
        summary_state = ENDED
    elif len(answered) < len(round_ids):
        summary_state = ROUND_OPEN
    else:
        summary_state = ROUND_ANSWERED
    return SessionSummary(summary_state, len(round_ids), len(answered), deferred)


def write_json_atomic(path: Path, value: Any) -> None:
    """Write JSON with mode 0600 so a crash leaves either the old file or the complete new one."""
    path.parent.mkdir(mode=PRIVATE_DIR_MODE, parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(
        dir=path.parent, prefix=f".{path.name}.", suffix=".tmp"
    )
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
            json.dump(value, stream, ensure_ascii=False, indent=2)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    except BaseException:
        with contextlib.suppress(FileNotFoundError):
            os.unlink(temporary)
        raise
    _fsync_directory(path.parent)


def _fsync_directory(path: Path) -> None:
    descriptor = os.open(path, os.O_RDONLY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def _read_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return None


__all__ = [
    "ACTIVE",
    "ENDED",
    "NO_SESSION",
    "ROUND_ANSWERED",
    "ROUND_OPEN",
    "QuestionAnswer",
    "RoundAnswers",
    "SessionFiles",
    "SessionState",
    "SessionSummary",
    "acquire_server_lock",
    "is_delivered",
    "open_round_ids",
    "read_state",
    "record_delivery",
    "server_running",
    "session_lock",
    "store_answers",
    "store_round",
    "stored_answers",
    "stored_round",
    "stored_round_ids",
    "summarize",
    "write_json_atomic",
    "write_state",
]
