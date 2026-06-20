#!/usr/bin/env python3
"""Generate a portable PRD review bundle from a JSON manifest."""

from __future__ import annotations

import argparse
import html
import json
import re
import shutil
import sys
import tempfile
from pathlib import Path
from typing import Any


SCRIPT_DIR = Path(__file__).resolve().parent
SOURCE_DIR = SCRIPT_DIR.parent / "bundle"
TEMPLATE_PATH = SOURCE_DIR / "index.template.html"
ASSET_DIR = SOURCE_DIR / "assets"
SLUG_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
TEMPLATE_MARKER_PATTERN = re.compile(r"\{\{[A-Z0-9_]+\}\}")


class ManifestError(ValueError):
    """Raised when a manifest does not satisfy the version 1 contract."""


def _non_empty_string(value: Any, path: str, errors: list[str]) -> str:
    if not isinstance(value, str) or not value.strip():
        errors.append(f"{path} must be a non-empty string")
        return ""
    return value.strip()


def _string_list(value: Any, path: str, errors: list[str]) -> list[str]:
    if not isinstance(value, list) or not value:
        errors.append(f"{path} must be a non-empty array of strings")
        return []

    result: list[str] = []
    for index, item in enumerate(value):
        text = _non_empty_string(item, f"{path}[{index}]", errors)
        if text:
            result.append(text)
    return result


def _object_list(
    value: Any,
    path: str,
    fields: tuple[str, ...],
    errors: list[str],
) -> list[dict[str, str]]:
    if not isinstance(value, list) or not value:
        errors.append(f"{path} must be a non-empty array")
        return []

    result: list[dict[str, str]] = []
    for index, item in enumerate(value):
        item_path = f"{path}[{index}]"
        if not isinstance(item, dict):
            errors.append(f"{item_path} must be an object")
            continue
        normalized = {
            field: _non_empty_string(item.get(field), f"{item_path}.{field}", errors)
            for field in fields
        }
        result.append(normalized)
    return result


def validate_manifest(raw: Any) -> dict[str, Any]:
    errors: list[str] = []
    if not isinstance(raw, dict):
        raise ManifestError("manifest must be a JSON object")

    schema_version = raw.get("schema_version")
    if (
        not isinstance(schema_version, int)
        or isinstance(schema_version, bool)
        or schema_version != 1
    ):
        errors.append("schema_version must be the number 1")

    slug = _non_empty_string(raw.get("slug"), "slug", errors)
    if slug and not SLUG_PATTERN.fullmatch(slug):
        errors.append(
            "slug must contain only lowercase letters, numbers, and single hyphens"
        )

    normalized: dict[str, Any] = {
        "schema_version": 1,
        "slug": slug,
        "title": _non_empty_string(raw.get("title"), "title", errors),
        "summary": _non_empty_string(raw.get("summary"), "summary", errors),
        "status": _non_empty_string(raw.get("status"), "status", errors),
    }

    metadata = raw.get("metadata")
    if not isinstance(metadata, dict) or not metadata:
        errors.append("metadata must be a non-empty object of string values")
        normalized["metadata"] = {}
    else:
        normalized_metadata: dict[str, str] = {}
        for key, value in metadata.items():
            if not isinstance(key, str) or not key.strip():
                errors.append("metadata keys must be non-empty strings")
                continue
            text = _non_empty_string(value, f"metadata.{key}", errors)
            if text:
                normalized_metadata[key.strip()] = text
        normalized["metadata"] = normalized_metadata

    sections = raw.get("sections")
    if not isinstance(sections, dict):
        errors.append("sections must be an object")
        sections = {}

    normalized_sections: dict[str, Any] = {
        "problem": {
            "statement": _non_empty_string(
                _nested(sections, "problem", "statement"),
                "sections.problem.statement",
                errors,
            ),
            "evidence": _string_list(
                _nested(sections, "problem", "evidence"),
                "sections.problem.evidence",
                errors,
            ),
        },
        "goals": _object_list(
            sections.get("goals"),
            "sections.goals",
            ("goal", "success_signal"),
            errors,
        ),
        "users": _object_list(
            sections.get("users"),
            "sections.users",
            ("actor", "need", "outcome"),
            errors,
        ),
        "requirements": _object_list(
            sections.get("requirements"),
            "sections.requirements",
            ("title", "description"),
            errors,
        ),
        "decisions": _object_list(
            sections.get("decisions"),
            "sections.decisions",
            ("decision", "rationale"),
            errors,
        ),
        "validation": _object_list(
            sections.get("validation"),
            "sections.validation",
            ("target", "expected_outcome"),
            errors,
        ),
        "scope": {
            "in": _string_list(
                _nested(sections, "scope", "in"),
                "sections.scope.in",
                errors,
            ),
            "out": _string_list(
                _nested(sections, "scope", "out"),
                "sections.scope.out",
                errors,
            ),
        },
        "rollout": _object_list(
            sections.get("rollout"),
            "sections.rollout",
            ("phase", "outcome"),
            errors,
        ),
        "risks": _object_list(
            sections.get("risks"),
            "sections.risks",
            ("risk", "mitigation"),
            errors,
        ),
        "repository_grounding": _object_list(
            sections.get("repository_grounding"),
            "sections.repository_grounding",
            ("reference", "observation", "implication"),
            errors,
        ),
    }

    questions = sections.get("open_questions", [])
    if questions is None:
        questions = []
    if not isinstance(questions, list):
        errors.append("sections.open_questions must be an array of strings when present")
        normalized_sections["open_questions"] = []
    else:
        normalized_questions: list[str] = []
        for index, question in enumerate(questions):
            text = _non_empty_string(
                question, f"sections.open_questions[{index}]", errors
            )
            if text:
                normalized_questions.append(text)
        normalized_sections["open_questions"] = normalized_questions

    normalized["sections"] = normalized_sections

    if errors:
        raise ManifestError("\n".join(f"- {message}" for message in errors))
    return normalized


def _nested(mapping: dict[str, Any], *keys: str) -> Any:
    value: Any = mapping
    for key in keys:
        if not isinstance(value, dict):
            return None
        value = value.get(key)
    return value


def _escape(value: str) -> str:
    return html.escape(value, quote=True)


def _paragraphs(items: list[str]) -> str:
    return "\n".join(f"<p>{_escape(item)}</p>" for item in items)


def _list(items: list[str]) -> str:
    return "<ul>" + "".join(f"<li>{_escape(item)}</li>" for item in items) + "</ul>"


def _cards(
    items: list[dict[str, str]],
    title_key: str,
    body_key: str,
    id_prefix: str | None = None,
    label_prefix: str | None = None,
) -> str:
    def render_card(index: int, item: dict[str, str]) -> str:
        identity = ""
        if id_prefix and label_prefix:
            anchor = f"{id_prefix}-{index:02d}"
            label = f"{label_prefix}-{index:02d}"
            identity = (
                f'<a class="entity-id" href="#{anchor}" '
                f'aria-label="Link to {label}">{label}</a>'
            )
            opening = f'<article id="{anchor}" class="card entity-card">'
        else:
            opening = '<article class="card">'
        return "".join(
            (
                opening,
                identity,
                f"<h3>{_escape(item[title_key])}</h3>",
                f"<p>{_escape(item[body_key])}</p>",
                "</article>",
            )
        )

    return "\n".join(
        render_card(index, item)
        for index, item in enumerate(items, start=1)
    )


def render_document(manifest: dict[str, Any]) -> str:
    sections = manifest["sections"]
    metadata = "".join(
        (
            "<div>"
            f"<dt>{_escape(label)}</dt>"
            f"<dd>{_escape(value)}</dd>"
            "</div>"
        )
        for label, value in manifest["metadata"].items()
    )
    goals = _cards(sections["goals"], "goal", "success_signal")
    users = "\n".join(
        (
            '<article class="card">'
            f"<h3>{_escape(item['actor'])}</h3>"
            f"<p><strong>Need:</strong> {_escape(item['need'])}</p>"
            f"<p><strong>Outcome:</strong> {_escape(item['outcome'])}</p>"
            "</article>"
        )
        for item in sections["users"]
    )
    requirements = _cards(
        sections["requirements"], "title", "description", "req", "REQ"
    )
    decisions = _cards(
        sections["decisions"], "decision", "rationale", "dec", "DEC"
    )
    validation = _cards(
        sections["validation"], "target", "expected_outcome", "test", "TEST"
    )
    rollout = _cards(sections["rollout"], "phase", "outcome")
    risks = _cards(sections["risks"], "risk", "mitigation", "risk", "RISK")
    grounding_rows = "".join(
        (
            "<tr>"
            f"<td><code>{_escape(item['reference'])}</code></td>"
            f"<td>{_escape(item['observation'])}</td>"
            f"<td>{_escape(item['implication'])}</td>"
            "</tr>"
        )
        for item in sections["repository_grounding"]
    )
    question_section = ""
    if sections["open_questions"]:
        questions = "".join(
            (
                f'<li id="question-{index:02d}">'
                f'<a class="entity-id" href="#question-{index:02d}" '
                f'aria-label="Link to QUESTION-{index:02d}">QUESTION-{index:02d}</a>'
                f"<span>{_escape(question)}</span>"
                "</li>"
            )
            for index, question in enumerate(sections["open_questions"], start=1)
        )
        question_section = (
            '<section id="open-questions" data-review-area="decisions">'
            '<div class="section-heading"><span>10</span><div>'
            '<h2><a href="#open-questions">Open questions</a></h2>'
            "<p>Decisions that still need explicit confirmation.</p>"
            "</div></div>"
            f'<ul class="question-list">{questions}</ul>'
            "</section>"
        )

    replacements = {
        "{{TITLE}}": _escape(manifest["title"]),
        "{{SUMMARY}}": _escape(manifest["summary"]),
        "{{STATUS}}": _escape(manifest["status"]),
        "{{METADATA}}": metadata,
        "{{PROBLEM}}": _paragraphs([sections["problem"]["statement"]]),
        "{{EVIDENCE}}": _list(sections["problem"]["evidence"]),
        "{{GOALS}}": goals,
        "{{USERS}}": users,
        "{{REQUIREMENTS}}": requirements,
        "{{DECISIONS}}": decisions,
        "{{VALIDATION}}": validation,
        "{{IN_SCOPE}}": _list(sections["scope"]["in"]),
        "{{OUT_OF_SCOPE}}": _list(sections["scope"]["out"]),
        "{{ROLLOUT}}": rollout,
        "{{RISKS}}": risks,
        "{{OPEN_QUESTIONS_SECTION}}": question_section,
        "{{OPEN_QUESTIONS_NAV}}": (
            '<a href="#open-questions">Open questions</a>'
            if sections["open_questions"]
            else ""
        ),
        "{{GROUNDING_NUMBER}}": "11" if sections["open_questions"] else "10",
        "{{GROUNDING_ROWS}}": grounding_rows,
    }

    template = TEMPLATE_PATH.read_text(encoding="utf-8")
    template_markers = set(TEMPLATE_MARKER_PATTERN.findall(template))
    unknown_markers = sorted(template_markers - replacements.keys())
    if unknown_markers:
        raise RuntimeError(
            f"template contains unresolved markers: {', '.join(unknown_markers)}"
        )

    missing_markers = sorted(replacements.keys() - template_markers)
    if missing_markers:
        raise RuntimeError(
            f"template is missing expected markers: {', '.join(missing_markers)}"
        )

    return TEMPLATE_MARKER_PATTERN.sub(
        lambda match: replacements[match.group(0)],
        template,
    )


def generate_bundle(
    manifest: dict[str, Any],
    output_root: Path,
    force: bool = False,
) -> Path:
    output_root = output_root.resolve()
    target = output_root / f"PRD-{manifest['slug']}"
    if (target.exists() or target.is_symlink()) and not force:
        raise FileExistsError(
            f"{target} already exists; pass --force to replace the generated bundle"
        )

    output_root.mkdir(parents=True, exist_ok=True)
    temp_path = Path(
        tempfile.mkdtemp(prefix=f".PRD-{manifest['slug']}-", dir=output_root)
    )
    backup_root: Path | None = None
    backup_path: Path | None = None

    try:
        (temp_path / "index.html").write_text(
            render_document(manifest), encoding="utf-8"
        )
        shutil.copytree(ASSET_DIR, temp_path / "assets", copy_function=shutil.copy2)

        if target.exists() or target.is_symlink():
            backup_root = Path(
                tempfile.mkdtemp(
                    prefix=f".PRD-{manifest['slug']}-backup-",
                    dir=output_root,
                )
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


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate action-items/PRD-<slug>/ from a JSON PRD manifest."
    )
    parser.add_argument("manifest", type=Path, help="path to the JSON manifest")
    parser.add_argument(
        "--output-root",
        type=Path,
        default=Path("action-items"),
        help="parent directory for PRD bundles (default: ./action-items)",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="replace an existing generated bundle after a successful build",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        with args.manifest.open(encoding="utf-8") as manifest_file:
            raw_manifest = json.load(manifest_file)
        manifest = validate_manifest(raw_manifest)
        target = generate_bundle(manifest, args.output_root, args.force)
    except json.JSONDecodeError as error:
        print(
            f"error: invalid JSON in {args.manifest}: "
            f"line {error.lineno}, column {error.colno}: {error.msg}",
            file=sys.stderr,
        )
        return 2
    except (ManifestError, FileNotFoundError, FileExistsError, OSError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 2
    except RuntimeError as error:
        print(f"error: generator configuration failed: {error}", file=sys.stderr)
        return 3

    print(target)
    return 0


if __name__ == "__main__":
    sys.exit(main())
