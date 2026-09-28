"""One registry file for the user that lists the running interview servers.

Each server adds its entry at start and removes it when it stops. A crashed server leaves
its entry behind until `prune` drops it. Entries hold no token, and every read and write
holds a file lock, so servers that start or stop together keep each other's entries.
"""

from __future__ import annotations

import contextlib
import fcntl
import json
import os
from collections.abc import Callable, Iterator
from pathlib import Path
from typing import Any, TypedDict

from .session import PRIVATE_DIR_MODE, write_json_atomic

DEFAULT_REGISTRY = Path("~/.local/state/to-prd/interview-sessions.json")
# Tests set this to a registry path of their own.
REGISTRY_ENV = "TO_PRD_INTERVIEW_REGISTRY"


class RegistryEntry(TypedDict):
    # The resolved session directory and the working directory of the command that started
    # the server.
    session: str
    workspace: str
    port: int


def registry_path() -> Path:
    return Path(os.environ.get(REGISTRY_ENV) or DEFAULT_REGISTRY).expanduser()


def register(session: Path, workspace: Path, port: int) -> None:
    """Record the server of a session, replacing an earlier entry of the same session."""
    entry: RegistryEntry = {"session": str(session), "workspace": str(workspace), "port": port}
    with _locked_entries(create=True) as entries:
        entries[:] = [item for item in entries if item["session"] != entry["session"]]
        entries.append(entry)


def unregister(session: Path) -> None:
    with _locked_entries(create=False) as entries:
        entries[:] = [item for item in entries if item["session"] != str(session)]


def prune(is_live: Callable[[RegistryEntry], bool]) -> list[RegistryEntry]:
    """Remove every entry that `is_live` rejects, and return the live entries.

    The lock stays held while `is_live` runs, so a server that starts meanwhile cannot lose
    its new entry to the removal of its old one.
    """
    with _locked_entries(create=False) as entries:
        entries[:] = [entry for entry in entries if is_live(entry)]
        return list(entries)


@contextlib.contextmanager
def _locked_entries(*, create: bool) -> Iterator[list[RegistryEntry]]:
    """Yield the entries under the registry lock, and write them back when they changed.

    Without `create`, a missing registry yields no entries and creates no file.
    """
    path = registry_path()
    if not create and not path.exists():
        yield []
        return
    path.parent.mkdir(mode=PRIVATE_DIR_MODE, parents=True, exist_ok=True)
    # The lock sits in its own file, because the atomic write replaces the registry file.
    descriptor = os.open(path.with_name(f"{path.name}.lock"), os.O_RDWR | os.O_CREAT, 0o600)
    try:
        fcntl.flock(descriptor, fcntl.LOCK_EX)
        entries = _read_entries(path)
        before = list(entries)
        yield entries
        if entries != before or not path.exists():
            write_json_atomic(path, {"sessions": entries})
    finally:
        os.close(descriptor)


def _read_entries(path: Path) -> list[RegistryEntry]:
    """Return the well-formed entries; a missing or unreadable registry holds none.

    Every live server records itself again at its next start, so a damaged registry costs
    only the listing of the servers that run now.
    """
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except OSError, ValueError:
        return []
    items = data.get("sessions") if isinstance(data, dict) else None
    if not isinstance(items, list):
        return []
    return [item for item in items if _is_entry(item)]


def _is_entry(item: Any) -> bool:
    return (
        isinstance(item, dict)
        and isinstance(item.get("session"), str)
        and isinstance(item.get("workspace"), str)
        and type(item.get("port")) is int
    )


__all__ = ["REGISTRY_ENV", "RegistryEntry", "prune", "register", "registry_path", "unregister"]
