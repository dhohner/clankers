"""Filesystem bundle generation for rendered PRDs."""

from __future__ import annotations

import json
import shutil
import tempfile
from pathlib import Path

from .output_validation import validate_generated_bundle
from .paths import ASSET_DIR
from .rendering import render_document
from .types import NormalizedManifest


def generate_bundle(manifest: NormalizedManifest, output_root: Path, force: bool = False) -> Path:
    display_target = output_root / f"PRD-{manifest['slug']}"
    output_root = output_root.resolve()
    target = output_root / f"PRD-{manifest['slug']}"
    if (target.exists() or target.is_symlink()) and not force:
        raise FileExistsError(
            f"{target} already exists; pass --force to replace the generated bundle"
        )

    output_root.mkdir(parents=True, exist_ok=True)
    temp_path = Path(tempfile.mkdtemp(prefix=f".PRD-{manifest['slug']}-", dir=output_root))
    backup_root: Path | None = None
    backup_path: Path | None = None
    try:
        (temp_path / "index.html").write_text(
            render_document(manifest, display_target),
            encoding="utf-8",
        )
        (temp_path / "prd.json").write_text(
            json.dumps(manifest, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        shutil.copytree(ASSET_DIR, temp_path / "assets", copy_function=shutil.copy2)
        validate_generated_bundle(temp_path)
        if target.exists() or target.is_symlink():
            backup_root = Path(
                tempfile.mkdtemp(prefix=f".PRD-{manifest['slug']}-backup-", dir=output_root)
            )
            backup_path = backup_root / "previous"
            target.rename(backup_path)
        try:
            temp_path.rename(target)
        except Exception:
            if (
                backup_path is not None
                and (backup_path.exists() or backup_path.is_symlink())
                and not target.exists()
                and not target.is_symlink()
            ):
                backup_path.rename(target)
            raise
        if backup_root is not None:
            shutil.rmtree(backup_root)
    except Exception:
        if temp_path.exists():
            shutil.rmtree(temp_path)
        if (
            backup_root is not None
            and backup_root.exists()
            and backup_path is not None
            and not backup_path.exists()
            and not backup_path.is_symlink()
        ):
            shutil.rmtree(backup_root)
        raise
    return target


__all__ = ["generate_bundle"]
