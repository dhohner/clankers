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
from dataclasses import dataclass
from pathlib import Path
from typing import Any


SCRIPT_DIR = Path(__file__).resolve().parent
SOURCE_DIR = SCRIPT_DIR.parent / "bundle"
TEMPLATE_PATH = SOURCE_DIR / "index.template.html"
ASSET_DIR = SOURCE_DIR / "assets"
SLUG_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
TEMPLATE_MARKER_PATTERN = re.compile(r"\{\{[A-Z0-9_]+\}\}")
INITIATIVE_TYPES = {
    "ui-heavy",
    "workflow-heavy",
    "api-heavy",
    "data-heavy",
    "architecture-heavy",
    "mixed",
    "small-feature",
}
REVIEW_SURFACES = {
    "document",
    "workflow",
    "ui",
    "api",
    "data",
    "architecture",
}
MANIFEST_FIELDS = {
    "schema_version",
    "slug",
    "title",
    "summary",
    "status",
    "initiative_type",
    "review_surfaces",
    "metadata",
    "blocks",
}
GENERATED_METADATA_LABELS = {"initiative", "review surfaces"}


@dataclass(frozen=True)
class BlockSpec:
    title: str
    description: str
    category: str
    review_area: str
    kind: str
    fields: tuple[str, ...] = ()
    id_prefix: str | None = None
    label_prefix: str | None = None


BLOCK_SPECS: dict[str, BlockSpec] = {
    "problem": BlockSpec("Problem and evidence", "Why this outcome matters now.", "framing", "all", "problem"),
    "goals": BlockSpec("Goals and success measures", "Observable outcomes for the initiative.", "framing", "validation", "cards", ("goal", "success_signal")),
    "non_goals": BlockSpec("Non-goals", "Outcomes this initiative intentionally does not pursue.", "framing", "decisions", "list"),
    "personas": BlockSpec("Personas and actors", "Who participates and what changes for them.", "people-workflow", "all", "cards", ("actor", "need", "outcome")),
    "user_stories": BlockSpec("User stories", "User-centered behavior the product must enable.", "people-workflow", "validation", "cards", ("story", "acceptance")),
    "journeys": BlockSpec("Current and future journey", "How the experience changes from today to the target state.", "people-workflow", "all", "cards", ("current", "future")),
    "workflow_diagram": BlockSpec("Workflow diagram", "The sequence reviewers need to align on.", "people-workflow", "all", "diagram"),
    "state_transition_matrix": BlockSpec("State-transition matrix", "Allowed states, triggers, and resulting behavior.", "people-workflow", "validation", "table"),
    "failure_paths": BlockSpec("Failure and fallback paths", "Expected behavior when the happy path cannot complete.", "people-workflow", "validation", "cards", ("scenario", "fallback")),
    "requirements": BlockSpec("Requirements", "Behavior the delivered product must support.", "product-definition", "validation decisions", "cards", ("title", "description"), "req", "REQ"),
    "capability_map": BlockSpec("Capability map", "Product capabilities and the outcomes they enable.", "product-definition", "all", "cards", ("capability", "outcome")),
    "scope": BlockSpec("Scope boundaries", "Explicit limits for implementation planning.", "product-definition", "decisions", "scope"),
    "business_rules": BlockSpec("Business rules", "Durable rules that constrain product behavior.", "product-definition", "validation decisions", "cards", ("rule", "rationale")),
    "decisions": BlockSpec("Decision log", "Settled choices that shape delivery.", "product-definition", "decisions", "cards", ("decision", "rationale"), "dec", "DEC"),
    "alternatives": BlockSpec("Alternatives and tradeoffs", "Options considered and why they were not selected.", "product-definition", "decisions", "cards", ("option", "tradeoff")),
    "wireframes": BlockSpec("Wireframes", "Screen concepts used to review layout and hierarchy.", "visual-experience", "all", "cards", ("screen", "intent")),
    "before_after": BlockSpec("Before and after", "The visible change from the current experience.", "visual-experience", "all", "cards", ("before", "after")),
    "annotated_screens": BlockSpec("Annotated screen states", "Important states and the behavior each communicates.", "visual-experience", "validation", "cards", ("state", "annotation")),
    "prototype": BlockSpec("Read-only prototype", "Behavioral states available for review.", "visual-experience", "all", "cards", ("state", "behavior")),
    "ui_flow": BlockSpec("UI flow", "How reviewers move between interface states.", "visual-experience", "all", "diagram"),
    "design_direction": BlockSpec("Design direction", "Principles guiding the proposed visual experience.", "visual-experience", "decisions", "cards", ("principle", "application")),
    "architecture_diagram": BlockSpec("Architecture diagram", "System boundaries and responsibilities relevant to the initiative.", "technical-contracts", "decisions", "diagram"),
    "data_flow_diagram": BlockSpec("Data-flow diagram", "How information moves through the proposed system.", "technical-contracts", "all", "diagram"),
    "system_context": BlockSpec("System context", "External actors, systems, and boundaries.", "technical-contracts", "all", "diagram"),
    "api_contract": BlockSpec("API contract", "Interfaces and observable behavior consumers depend on.", "technical-contracts", "validation decisions", "cards", ("contract", "behavior")),
    "data_model": BlockSpec("Data model", "Entities and relationships introduced or changed.", "technical-contracts", "validation decisions", "cards", ("entity", "definition")),
    "event_lifecycle": BlockSpec("Event or state lifecycle", "Lifecycle transitions that implementations must preserve.", "technical-contracts", "validation", "diagram"),
    "file_symbol_map": BlockSpec("File and symbol map", "Repository locations expected to participate in delivery.", "technical-contracts", "all", "cards", ("reference", "role")),
    "annotated_code": BlockSpec("Annotated code or diff", "Code evidence that clarifies a contract or constraint.", "technical-contracts", "all", "code"),
    "dependencies": BlockSpec("Dependencies", "External work or capabilities required for delivery.", "delivery-assurance", "decisions", "cards", ("dependency", "impact")),
    "risks": BlockSpec("Risks and mitigations", "Known failure modes and responses.", "delivery-assurance", "decisions validation", "cards", ("risk", "mitigation"), "risk", "RISK"),
    "security_privacy": BlockSpec("Security and privacy", "Sensitive data, access, and abuse considerations.", "delivery-assurance", "validation decisions", "cards", ("concern", "response")),
    "rollout": BlockSpec("Rollout and migration", "How the outcome reaches users safely.", "delivery-assurance", "validation", "cards", ("phase", "outcome")),
    "testing_strategy": BlockSpec("Testing strategy", "Observable proof that the requirements work.", "delivery-assurance", "validation", "cards", ("target", "expected_outcome"), "test", "TEST"),
    "traceability_matrix": BlockSpec("Traceability matrix", "Relationships between product intent and verification.", "delivery-assurance", "validation decisions", "table"),
    "open_questions": BlockSpec("Open questions", "Decisions that still need explicit confirmation.", "delivery-assurance", "decisions", "questions", id_prefix="question", label_prefix="QUESTION"),
    "repository_grounding": BlockSpec("Repository grounding", "Evidence that informed the product shape.", "delivery-assurance", "all", "cards", ("reference", "observation", "implication")),
}


class ManifestError(ValueError):
    """Raised when a manifest does not satisfy the version 1 contract."""


def _json_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    duplicates: list[str] = []
    for key, value in pairs:
        if key in result:
            duplicates.append(key)
        result[key] = value
    if duplicates:
        raise ManifestError(
            "JSON object contains duplicate key(s): " + ", ".join(sorted(set(duplicates)))
        )
    return result


def _non_empty_string(value: Any, path: str, errors: list[str]) -> str:
    if not isinstance(value, str) or not value.strip():
        errors.append(f"{path} must be a non-empty string")
        return ""
    return value.strip()


def _string_list(
    value: Any,
    path: str,
    errors: list[str],
) -> list[str]:
    if not isinstance(value, list) or not value:
        errors.append(f"{path} must be a non-empty array of strings")
        return []
    result: list[str] = []
    for index, item in enumerate(value):
        text = _non_empty_string(item, f"{path}[{index}]", errors)
        if text:
            result.append(text)
    return result


def _reject_unknown_fields(
    value: dict[str, Any],
    allowed: set[str],
    path: str,
    errors: list[str],
) -> None:
    for field in sorted(set(value) - allowed):
        errors.append(f"{path}.{field} is not supported for this block")


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
        _reject_unknown_fields(item, set(fields), item_path, errors)
        result.append(
            {
                field: _non_empty_string(item.get(field), f"{item_path}.{field}", errors)
                for field in fields
            }
        )
    return result


def _validate_block(name: str, value: Any, errors: list[str]) -> Any:
    spec = BLOCK_SPECS[name]
    path = f"blocks.{name}"
    if spec.kind == "cards":
        return _object_list(value, path, spec.fields, errors)
    if spec.kind == "list" or spec.kind == "questions":
        return _string_list(value, path, errors)
    if spec.kind == "problem":
        if not isinstance(value, dict):
            errors.append(f"{path} must be an object")
            return {"statement": "", "evidence": []}
        _reject_unknown_fields(value, {"statement", "evidence"}, path, errors)
        return {
            "statement": _non_empty_string(value.get("statement"), f"{path}.statement", errors),
            "evidence": _string_list(value.get("evidence"), f"{path}.evidence", errors),
        }
    if spec.kind == "scope":
        if not isinstance(value, dict):
            errors.append(f"{path} must be an object")
            return {"in": [], "out": []}
        _reject_unknown_fields(value, {"in", "out"}, path, errors)
        return {
            "in": _string_list(value.get("in"), f"{path}.in", errors),
            "out": _string_list(value.get("out"), f"{path}.out", errors),
        }
    if spec.kind == "diagram":
        if not isinstance(value, dict):
            errors.append(f"{path} must be an object")
            return {"description": "", "source": ""}
        _reject_unknown_fields(value, {"description", "source"}, path, errors)
        source = value.get("source", "")
        if source is None:
            source = ""
        elif not isinstance(source, str):
            errors.append(f"{path}.source must be a string when present")
            source = ""
        return {
            "description": _non_empty_string(value.get("description"), f"{path}.description", errors),
            "source": source.strip(),
        }
    if spec.kind == "table":
        if not isinstance(value, dict):
            errors.append(f"{path} must be an object")
            return {"columns": [], "rows": []}
        _reject_unknown_fields(value, {"columns", "rows"}, path, errors)
        columns = _string_list(value.get("columns"), f"{path}.columns", errors)
        rows = value.get("rows")
        normalized_rows: list[list[str]] = []
        if not isinstance(rows, list) or not rows:
            errors.append(f"{path}.rows must be a non-empty array of row arrays")
        else:
            for row_index, row in enumerate(rows):
                row_path = f"{path}.rows[{row_index}]"
                if not isinstance(row, list):
                    errors.append(f"{row_path} must be an array")
                    continue
                if len(row) != len(columns):
                    errors.append(
                        f"{row_path} must contain {len(columns)} values to match {path}.columns"
                    )
                normalized_rows.append(
                    [
                        _non_empty_string(cell, f"{row_path}[{cell_index}]", errors)
                        for cell_index, cell in enumerate(row)
                    ]
                )
        return {"columns": columns, "rows": normalized_rows}
    if spec.kind == "code":
        return _object_list(value, path, ("reference", "language", "code", "annotation"), errors)
    raise RuntimeError(f"unsupported renderer kind: {spec.kind}")


def validate_manifest(raw: Any) -> dict[str, Any]:
    errors: list[str] = []
    if not isinstance(raw, dict):
        raise ManifestError("manifest must be a JSON object")

    for field in sorted(set(raw) - MANIFEST_FIELDS):
        errors.append(f"{field} is not a supported manifest field")

    schema_version = raw.get("schema_version")
    if not isinstance(schema_version, int) or isinstance(schema_version, bool) or schema_version != 1:
        errors.append("schema_version must be the number 1")

    slug = _non_empty_string(raw.get("slug"), "slug", errors)
    if slug and not SLUG_PATTERN.fullmatch(slug):
        errors.append("slug must contain only lowercase letters, numbers, and single hyphens")

    initiative_type = _non_empty_string(raw.get("initiative_type"), "initiative_type", errors)
    if initiative_type and initiative_type not in INITIATIVE_TYPES:
        errors.append(
            "initiative_type must be one of: " + ", ".join(sorted(INITIATIVE_TYPES))
        )

    surfaces = _string_list(raw.get("review_surfaces"), "review_surfaces", errors)
    for index, surface in enumerate(surfaces):
        if surface not in REVIEW_SURFACES:
            errors.append(
                f"review_surfaces[{index}] must be one of: "
                + ", ".join(sorted(REVIEW_SURFACES))
            )
    if len(surfaces) != len(set(surfaces)):
        errors.append("review_surfaces must not contain duplicates")

    normalized: dict[str, Any] = {
        "schema_version": 1,
        "slug": slug,
        "title": _non_empty_string(raw.get("title"), "title", errors),
        "summary": _non_empty_string(raw.get("summary"), "summary", errors),
        "status": _non_empty_string(raw.get("status"), "status", errors),
        "initiative_type": initiative_type,
        "review_surfaces": surfaces,
    }

    metadata = raw.get("metadata")
    if not isinstance(metadata, dict) or not metadata:
        errors.append("metadata must be a non-empty object of string values")
        normalized["metadata"] = {}
    else:
        normalized_metadata: dict[str, str] = {}
        normalized_labels: set[str] = set()
        for key, value in metadata.items():
            if not isinstance(key, str) or not key.strip():
                errors.append("metadata keys must be non-empty strings")
                continue
            label = key.strip()
            normalized_label = label.casefold()
            if normalized_label in GENERATED_METADATA_LABELS:
                errors.append(f"metadata.{label} is reserved for generated metadata")
                continue
            if normalized_label in normalized_labels:
                errors.append(
                    f"metadata contains duplicate label after normalization: {label}"
                )
                continue
            text = _non_empty_string(value, f"metadata.{key}", errors)
            if text:
                normalized_metadata[label] = text
                normalized_labels.add(normalized_label)
        normalized["metadata"] = normalized_metadata

    blocks = raw.get("blocks")
    if not isinstance(blocks, dict) or not blocks:
        errors.append("blocks must be a non-empty object of selected PRD blocks")
        blocks = {}
    unknown_blocks = sorted(set(blocks) - set(BLOCK_SPECS))
    if unknown_blocks:
        errors.append(
            "blocks contains unsupported block name(s): "
            + ", ".join(unknown_blocks)
            + "; supported names are: "
            + ", ".join(BLOCK_SPECS)
        )
    normalized["blocks"] = {
        name: _validate_block(name, blocks[name], errors)
        for name in BLOCK_SPECS
        if name in blocks
    }

    if errors:
        raise ManifestError("\n".join(f"- {message}" for message in errors))
    return normalized


def _escape(value: str) -> str:
    return html.escape(value, quote=True)


def _list(items: list[str]) -> str:
    return '<ul class="content-list">' + "".join(
        f"<li>{_escape(item)}</li>" for item in items
    ) + "</ul>"


def _field_label(field: str) -> str:
    return field.replace("_", " ").capitalize()


def _render_cards(items: list[dict[str, str]], spec: BlockSpec) -> str:
    cards: list[str] = []
    for index, item in enumerate(items, start=1):
        identity = ""
        anchor = ""
        if spec.id_prefix and spec.label_prefix:
            anchor = f' id="{spec.id_prefix}-{index:02d}"'
            label = f"{spec.label_prefix}-{index:02d}"
            identity = (
                f'<a class="entity-id" href="#{spec.id_prefix}-{index:02d}" '
                f'aria-label="Link to {label}">{label}</a>'
            )
        primary, *secondary = spec.fields
        details = "".join(
            f"<p><strong>{_escape(_field_label(field))}:</strong> {_escape(item[field])}</p>"
            for field in secondary
        )
        cards.append(
            f'<article{anchor} class="card{" entity-card" if anchor else ""}">'
            f"{identity}<h3>{_escape(item[primary])}</h3>{details}</article>"
        )
    return '<div class="card-grid">' + "".join(cards) + "</div>"


def _render_table(value: dict[str, Any]) -> str:
    head = "".join(f"<th>{_escape(column)}</th>" for column in value["columns"])
    rows = "".join(
        "<tr>" + "".join(f"<td>{_escape(cell)}</td>" for cell in row) + "</tr>"
        for row in value["rows"]
    )
    return (
        '<div class="table-wrap"><table><thead><tr>'
        f"{head}</tr></thead><tbody>{rows}</tbody></table></div>"
    )


def _render_block_content(name: str, value: Any, spec: BlockSpec) -> str:
    if spec.kind == "cards":
        return _render_cards(value, spec)
    if spec.kind == "list":
        return _list(value)
    if spec.kind == "problem":
        return (
            '<div class="split"><article><h3>Problem statement</h3>'
            f"<p>{_escape(value['statement'])}</p></article>"
            f"<article><h3>Evidence</h3>{_list(value['evidence'])}</article></div>"
        )
    if spec.kind == "scope":
        return (
            '<div class="split"><article><h3>In scope</h3>'
            f"{_list(value['in'])}</article><article><h3>Out of scope</h3>"
            f"{_list(value['out'])}</article></div>"
        )
    if spec.kind == "diagram":
        source = (
            f'<pre class="diagram-source"><code>{_escape(value["source"])}</code></pre>'
            if value["source"]
            else ""
        )
        return (
            '<figure class="diagram-brief">'
            '<div>'
            f"<p>{_escape(value['description'])}</p>{source}</div>"
            "<figcaption>Text-first diagram brief; visual rendering is optional.</figcaption>"
            "</figure>"
        )
    if spec.kind == "table":
        return _render_table(value)
    if spec.kind == "questions":
        items = "".join(
            f'<li id="question-{index:02d}">'
            f'<a class="entity-id" href="#question-{index:02d}" '
            f'aria-label="Link to QUESTION-{index:02d}">QUESTION-{index:02d}</a>'
            f"<span>{_escape(question)}</span></li>"
            for index, question in enumerate(value, start=1)
        )
        return f'<ul class="question-list">{items}</ul>'
    if spec.kind == "code":
        snippets = "".join(
            '<article class="code-sample">'
            f"<h3><code>{_escape(item['reference'])}</code></h3>"
            f"<p>{_escape(item['annotation'])}</p>"
            f'<pre><code data-language="{_escape(item["language"])}">'
            f"{_escape(item['code'])}</code></pre></article>"
            for item in value
        )
        return f'<div class="code-grid">{snippets}</div>'
    raise RuntimeError(f"unsupported renderer kind for {name}: {spec.kind}")


def render_document(manifest: dict[str, Any]) -> str:
    metadata_items = {
        "Initiative": manifest["initiative_type"],
        "Review surfaces": ", ".join(manifest["review_surfaces"]),
        **manifest["metadata"],
    }
    metadata = "".join(
        f"<div><dt>{_escape(label)}</dt><dd>{_escape(value)}</dd></div>"
        for label, value in metadata_items.items()
    )

    navigation = ['<a href="#summary">Summary</a>']
    rendered_blocks: list[str] = []
    for number, (name, value) in enumerate(manifest["blocks"].items(), start=1):
        spec = BLOCK_SPECS[name]
        heading_id = f"{name}-heading"
        content = _render_block_content(name, value, spec)
        if name in {"problem", "scope", "repository_grounding"}:
            content = (
                '<details class="supporting-detail" open>'
                f"<summary>Review {html.escape(spec.title.lower())}</summary>"
                f"{content}</details>"
            )
        navigation.append(f'<a href="#{name}">{_escape(spec.title)}</a>')
        rendered_blocks.append(
            f'<section id="{name}" data-block="{name}" '
            f'data-block-category="{spec.category}" data-review-area="{spec.review_area}" '
            f'aria-labelledby="{heading_id}">'
            '<div class="section-heading">'
            f"<span>{number:02d}</span><div><h2 id=\"{heading_id}\">"
            f'<a href="#{name}">{_escape(spec.title)}</a></h2>'
            f"<p>{_escape(spec.description)}</p></div></div>"
            f"{content}</section>"
        )

    has_supporting_details = any(
        name in manifest["blocks"]
        for name in {"problem", "scope", "repository_grounding"}
    )
    replacements = {
        "{{TITLE}}": _escape(manifest["title"]),
        "{{SUMMARY}}": _escape(manifest["summary"]),
        "{{STATUS}}": _escape(manifest["status"]),
        "{{METADATA}}": metadata,
        "{{NAVIGATION}}": "\n".join(navigation),
        "{{DETAILS_CONTROL}}": (
            '<button id="toggle-details" type="button" aria-pressed="false">'
            "Collapse supporting detail</button>"
            if has_supporting_details
            else ""
        ),
        "{{BLOCKS}}": "\n".join(rendered_blocks),
    }
    template = TEMPLATE_PATH.read_text(encoding="utf-8")
    template_markers = set(TEMPLATE_MARKER_PATTERN.findall(template))
    unknown_markers = sorted(template_markers - replacements.keys())
    if unknown_markers:
        raise RuntimeError(f"template contains unresolved markers: {', '.join(unknown_markers)}")
    missing_markers = sorted(replacements.keys() - template_markers)
    if missing_markers:
        raise RuntimeError(f"template is missing expected markers: {', '.join(missing_markers)}")
    return TEMPLATE_MARKER_PATTERN.sub(lambda match: replacements[match.group(0)], template)


def generate_bundle(manifest: dict[str, Any], output_root: Path, force: bool = False) -> Path:
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
        (temp_path / "index.html").write_text(render_document(manifest), encoding="utf-8")
        shutil.copytree(ASSET_DIR, temp_path / "assets", copy_function=shutil.copy2)
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
            raw_manifest = json.load(manifest_file, object_pairs_hook=_json_object)
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
