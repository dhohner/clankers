#!/usr/bin/env python3
"""Generate a portable PRD review bundle from a JSON manifest."""

from __future__ import annotations

import argparse
import html
import json
import math
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
GENERATED_METADATA_LABELS = {"initiative", "review surfaces", "output"}


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
    "executive_summary": BlockSpec("Executive summary", "The proposed product change at a glance.", "framing", "all", "summary"),
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
    "wireframes": BlockSpec("Wireframes", "Screen concepts used to review layout and hierarchy.", "visual-experience", "all", "frames", ("screen", "intent")),
    "before_after": BlockSpec("Before and after", "The visible change from the current experience.", "visual-experience", "all", "cards", ("before", "after")),
    "annotated_screens": BlockSpec("Annotated screen states", "Important states and the behavior each communicates.", "visual-experience", "validation", "frames", ("state", "annotation")),
    "prototype": BlockSpec("Read-only prototype", "Behavioral states available for review.", "visual-experience", "all", "prototype"),
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
    optional_fields: set[str] | None = None,
) -> list[dict[str, Any]]:
    if not isinstance(value, list) or not value:
        errors.append(f"{path} must be a non-empty array")
        return []
    result: list[dict[str, Any]] = []
    optional_fields = optional_fields or set()
    for index, item in enumerate(value):
        item_path = f"{path}[{index}]"
        if not isinstance(item, dict):
            errors.append(f"{item_path} must be an object")
            continue
        _reject_unknown_fields(item, set(fields) | optional_fields, item_path, errors)
        normalized: dict[str, Any] = {
            field: _non_empty_string(item.get(field), f"{item_path}.{field}", errors)
            for field in fields
        }
        if "id" in optional_fields and "id" in item:
            normalized["id"] = _non_empty_string(item.get("id"), f"{item_path}.id", errors)
        for list_field in ("relates_to", "validates", "validation", "evidence"):
            if list_field in optional_fields and list_field in item:
                normalized[list_field] = _string_list(item.get(list_field), f"{item_path}.{list_field}", errors)
        if "exception" in optional_fields and "exception" in item:
            normalized["exception"] = _non_empty_string(item.get("exception"), f"{item_path}.exception", errors)
        result.append(normalized)
    return result


def _optional_object_list(
    value: Any,
    path: str,
    fields: tuple[str, ...],
    errors: list[str],
) -> list[dict[str, str]]:
    if value is None:
        return []
    if value == []:
        return []
    return _object_list(value, path, fields, errors)


def _validate_frames(
    value: Any,
    path: str,
    fields: tuple[str, ...],
    errors: list[str],
) -> list[dict[str, Any]]:
    if not isinstance(value, list) or not value:
        errors.append(f"{path} must be a non-empty array")
        return []
    result: list[dict[str, Any]] = []
    for index, item in enumerate(value):
        item_path = f"{path}[{index}]"
        if not isinstance(item, dict):
            errors.append(f"{item_path} must be an object")
            continue
        _reject_unknown_fields(item, set(fields) | {"regions"}, item_path, errors)
        normalized = {
            field: _non_empty_string(item.get(field), f"{item_path}.{field}", errors)
            for field in fields
        }
        normalized["regions"] = _optional_object_list(
            item.get("regions"),
            f"{item_path}.regions",
            ("label", "detail"),
            errors,
        )
        result.append(normalized)
    return result


def _validate_prototype(value: Any, path: str, errors: list[str]) -> dict[str, Any]:
    if isinstance(value, list):
        states = _object_list(value, path, ("state", "behavior"), errors)
        return {
            "description": "Switch between the defined states to review behavior.",
            "states": [
                {
                    "label": state["state"],
                    "behavior": state["behavior"],
                    "content": [],
                }
                for state in states
            ],
        }
    if not isinstance(value, dict):
        errors.append(f"{path} must be an object")
        return {"description": "", "states": []}
    _reject_unknown_fields(value, {"description", "states"}, path, errors)
    description = _non_empty_string(
        value.get("description"),
        f"{path}.description",
        errors,
    )
    raw_states = value.get("states")
    if not isinstance(raw_states, list) or not raw_states:
        errors.append(f"{path}.states must be a non-empty array")
        return {"description": description, "states": []}
    states: list[dict[str, Any]] = []
    for index, state in enumerate(raw_states):
        state_path = f"{path}.states[{index}]"
        if not isinstance(state, dict):
            errors.append(f"{state_path} must be an object")
            continue
        _reject_unknown_fields(
            state,
            {"label", "behavior", "content"},
            state_path,
            errors,
        )
        states.append(
            {
                "label": _non_empty_string(
                    state.get("label"),
                    f"{state_path}.label",
                    errors,
                ),
                "behavior": _non_empty_string(
                    state.get("behavior"),
                    f"{state_path}.behavior",
                    errors,
                ),
                "content": _optional_object_list(
                    state.get("content"),
                    f"{state_path}.content",
                    ("label", "value"),
                    errors,
                ),
            }
        )
    return {"description": description, "states": states}


def _validate_native_diagram(
    value: Any,
    path: str,
    errors: list[str],
) -> dict[str, Any] | None:
    if value is None:
        return None
    if not isinstance(value, dict):
        errors.append(f"{path} must be an object")
        return {"nodes": [], "edges": []}
    _reject_unknown_fields(value, {"nodes", "edges"}, path, errors)
    nodes = _object_list(value.get("nodes"), f"{path}.nodes", ("id", "label"), errors)
    node_ids = [node["id"] for node in nodes]
    if len(node_ids) != len(set(node_ids)):
        errors.append(f"{path}.nodes must use unique ids")
    edges = _optional_object_list(
        value.get("edges"),
        f"{path}.edges",
        ("from", "to", "label"),
        errors,
    )
    known_ids = set(node_ids)
    for index, edge in enumerate(edges):
        for endpoint in ("from", "to"):
            if edge[endpoint] and edge[endpoint] not in known_ids:
                errors.append(
                    f"{path}.edges[{index}].{endpoint} must reference a node id"
                )
    return {"nodes": nodes, "edges": edges}


ENTITY_OPTIONAL_FIELDS_BY_BLOCK = {
    "requirements": {"id", "relates_to", "validation", "evidence", "exception"},
    "decisions": {"id", "relates_to", "evidence"},
    "risks": {"id", "relates_to", "evidence"},
    "testing_strategy": {"id", "relates_to", "validates", "evidence"},
}


def _normalize_entity_id(value: str) -> str:
    return value.strip().lower()


def _validate_block(name: str, value: Any, errors: list[str]) -> Any:
    spec = BLOCK_SPECS[name]
    path = f"blocks.{name}"
    if spec.kind == "summary":
        if not isinstance(value, dict):
            errors.append(f"{path} must be an object")
            return {"metrics": [], "recommendation": ""}
        _reject_unknown_fields(value, {"metrics", "recommendation"}, path, errors)
        return {
            "metrics": _object_list(
                value.get("metrics"),
                f"{path}.metrics",
                ("label", "value", "description"),
                errors,
            ),
            "recommendation": _non_empty_string(
                value.get("recommendation"),
                f"{path}.recommendation",
                errors,
            ),
        }
    if spec.kind == "cards":
        optional = ENTITY_OPTIONAL_FIELDS_BY_BLOCK.get(name)
        return _object_list(value, path, spec.fields, errors, optional)
    if spec.kind == "frames":
        return _validate_frames(value, path, spec.fields, errors)
    if spec.kind == "prototype":
        return _validate_prototype(value, path, errors)
    if spec.kind == "list":
        return _string_list(value, path, errors)
    if spec.kind == "questions":
        if not isinstance(value, list) or not value:
            errors.append(f"{path} must be a non-empty array of strings or question objects")
            return []
        questions: list[dict[str, Any]] = []
        for index, item in enumerate(value):
            item_path = f"{path}[{index}]"
            if isinstance(item, str):
                text = _non_empty_string(item, item_path, errors)
                questions.append({"question": text})
                continue
            if not isinstance(item, dict):
                errors.append(f"{item_path} must be a string or object")
                continue
            _reject_unknown_fields(item, {"id", "question", "relates_to", "evidence"}, item_path, errors)
            normalized: dict[str, Any] = {
                "question": _non_empty_string(item.get("question"), f"{item_path}.question", errors)
            }
            if "id" in item:
                normalized["id"] = _non_empty_string(item.get("id"), f"{item_path}.id", errors)
            for list_field in ("relates_to", "evidence"):
                if list_field in item:
                    normalized[list_field] = _string_list(item.get(list_field), f"{item_path}.{list_field}", errors)
            questions.append(normalized)
        return questions
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
            return {"description": "", "source": "", "native": None}
        _reject_unknown_fields(value, {"description", "source", "native"}, path, errors)
        source = value.get("source", "")
        if source is None:
            source = ""
        elif not isinstance(source, str):
            errors.append(f"{path}.source must be a string when present")
            source = ""
        native = _validate_native_diagram(value.get("native"), f"{path}.native", errors)
        if source.strip() and native is not None:
            errors.append(f"{path} must use either source or native, not both")
        return {
            "description": _non_empty_string(value.get("description"), f"{path}.description", errors),
            "source": source.strip(),
            "native": native,
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


ENTITY_ID_PATTERN = re.compile(r"^(req|dec|risk|question|test)-[a-z0-9][a-z0-9-]*$")


def _entity_label(entity_id: str) -> str:
    prefix, _, suffix = entity_id.partition("-")
    return f"{prefix.upper()}-{suffix.upper()}"


def _assign_and_validate_traceability(blocks: dict[str, Any], errors: list[str]) -> None:
    entity_ids: dict[str, str] = {}
    validation_links: dict[str, set[str]] = {}
    requirements: list[dict[str, Any]] = []

    for block_name, items in blocks.items():
        spec = BLOCK_SPECS[block_name]
        if not spec.id_prefix or not spec.label_prefix:
            continue
        if block_name == "open_questions":
            iterable = items
            text_field = "question"
        else:
            iterable = items
            text_field = spec.fields[0]
        for index, item in enumerate(iterable, start=1):
            default_id = f"{spec.id_prefix}-{index:02d}"
            entity_id = _normalize_entity_id(item.get("id", default_id))
            item["id"] = entity_id
            item["label"] = _entity_label(entity_id)
            if not ENTITY_ID_PATTERN.fullmatch(entity_id) or not entity_id.startswith(f"{spec.id_prefix}-"):
                errors.append(f"blocks.{block_name}[{index - 1}].id must look like {spec.label_prefix}-01 and use the {spec.id_prefix} prefix")
            if entity_id in entity_ids:
                errors.append(f"duplicate entity id: {entity_id}")
            else:
                entity_ids[entity_id] = f"blocks.{block_name}[{index - 1}]"
            item.setdefault("relates_to", [])
            item.setdefault("evidence", [])
            if block_name == "requirements":
                requirements.append(item)
            if block_name == "testing_strategy":
                for requirement_id in item.get("validates", []):
                    normalized_requirement_id = _normalize_entity_id(requirement_id)
                    validation_links.setdefault(normalized_requirement_id, set()).add(entity_id)
            # Touch the main text field so malformed question objects are still easy to locate in debuggers.
            item.get(text_field)

    for block_name, items in blocks.items():
        spec = BLOCK_SPECS[block_name]
        if not spec.id_prefix:
            continue
        for index, item in enumerate(items, start=1):
            item_path = f"blocks.{block_name}[{index - 1}]"
            for field in ("relates_to", "validates", "validation"):
                normalized_refs = []
                for reference in item.get(field, []):
                    reference_id = _normalize_entity_id(reference)
                    normalized_refs.append(reference_id)
                    if reference_id not in entity_ids:
                        errors.append(f"{item_path}.{field} references missing entity id: {reference}")
                    if block_name == "requirements" and field == "validation" and not reference_id.startswith("test-"):
                        errors.append(f"{item_path}.validation must reference a TEST entity id: {reference}")
                    if block_name == "testing_strategy" and field == "validates" and not reference_id.startswith("req-"):
                        errors.append(f"{item_path}.validates must reference a REQ entity id: {reference}")
                if field in item:
                    item[field] = normalized_refs

    for requirement in requirements:
        requirement_id = requirement["id"]
        linked_tests = {
            _normalize_entity_id(reference)
            for reference in requirement.get("validation", [])
        } | validation_links.get(requirement_id, set())
        requirement["validation"] = sorted(linked_tests)
        if not linked_tests and not requirement.get("exception"):
            errors.append(
                f"{entity_ids.get(requirement_id, requirement_id)} must connect to a validation outcome or include an exception"
            )


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
    _assign_and_validate_traceability(normalized["blocks"], errors)

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


def _render_relationship_links(label: str, references: list[str]) -> str:
    if not references:
        return ""
    links = ", ".join(
        f'<a href="#{_escape(reference)}">{_escape(_entity_label(reference))}</a>'
        for reference in references
    )
    return f'<p class="entity-links"><strong>{_escape(label)}:</strong> {links}</p>'


def _render_evidence_items(references: list[str]) -> str:
    if not references:
        return ""
    evidence = ", ".join(f"<code>{_escape(reference)}</code>" for reference in references)
    return f'<p class="entity-evidence"><strong>Evidence:</strong> {evidence}</p>'


def _render_cards(name: str, items: list[dict[str, Any]], spec: BlockSpec) -> str:
    if name == "requirements":
        requirements: list[str] = []
        for index, item in enumerate(items, start=1):
            entity_id = item.get("id", f"{spec.id_prefix}-{index:02d}")
            label = item.get("label", _entity_label(entity_id))
            relationships = "".join(
                [
                    _render_relationship_links("Related", item.get("relates_to", [])),
                    _render_relationship_links("Validation", item.get("validation", [])),
                    _render_evidence_items(item.get("evidence", [])),
                    (
                        f'<p class="entity-exception"><strong>Validation exception:</strong> {_escape(item["exception"])}</p>'
                        if item.get("exception")
                        else ""
                    ),
                ]
            )
            requirements.append(
                f'<article id="{_escape(entity_id)}">'
                f'<a class="entity-id" href="#{_escape(entity_id)}" '
                f'aria-label="Link to {_escape(label)}">{_escape(label)}</a>'
                f'<div><h3>{_escape(item["title"])}</h3>'
                f'<p>{_escape(item["description"])}</p>{relationships}</div></article>'
            )
        return '<div class="requirement-list">' + "".join(requirements) + "</div>"

    cards: list[str] = []
    for index, item in enumerate(items, start=1):
        identity = ""
        anchor = ""
        if spec.id_prefix and spec.label_prefix:
            entity_id = item.get("id", f"{spec.id_prefix}-{index:02d}")
            label = item.get("label", _entity_label(entity_id))
            anchor = f' id="{_escape(entity_id)}"'
            identity = (
                f'<a class="entity-id" href="#{_escape(entity_id)}" '
                f'aria-label="Link to {_escape(label)}">{_escape(label)}</a>'
            )
        primary, *secondary = spec.fields
        details = "".join(
            f"<p><strong>{_escape(_field_label(field))}:</strong> {_escape(item[field])}</p>"
            for field in secondary
        )
        relationships = "".join(
            [
                _render_relationship_links("Related", item.get("relates_to", [])),
                _render_relationship_links("Validation", item.get("validation", [])),
                _render_relationship_links("Validates", item.get("validates", [])),
                _render_evidence_items(item.get("evidence", [])),
                (
                    f'<p class="entity-exception"><strong>Validation exception:</strong> {_escape(item["exception"])}</p>'
                    if item.get("exception")
                    else ""
                ),
            ]
        )
        cards.append(
            f'<article{anchor} class="card{" entity-card" if anchor else ""}">'
            f"{identity}<h3>{_escape(item[primary])}</h3>{details}{relationships}</article>"
        )
    if name == "goals":
        rows = "".join(
            "<tr>"
            f"<td>GOAL-{index:02d}</td>"
            f"<td>{_escape(item['goal'])}</td>"
            f"<td>{_escape(item['success_signal'])}</td>"
            "</tr>"
            for index, item in enumerate(items, start=1)
        )
        return (
            '<div class="table-wrap"><table><thead><tr>'
            f"<th>ID</th><th>Goal</th><th>Success signal</th>"
            f"</tr></thead><tbody>{rows}</tbody></table></div>"
        )
    if name == "rollout":
        return '<ol class="timeline">' + "".join(
            f"<li><span>Phase {index}</span>"
            f"<div><h3>{_escape(item['phase'])}</h3>"
            f"<p>{_escape(item['outcome'])}</p></div></li>"
            for index, item in enumerate(items, start=1)
        ) + "</ol>"
    if name == "repository_grounding":
        rows = "".join(
            "<tr>"
            f"<td><code>{_escape(item['reference'])}</code></td>"
            f"<td>{_escape(item['observation'])}</td>"
            f"<td>{_escape(item['implication'])}</td>"
            "</tr>"
            for item in items
        )
        return (
            '<div class="table-wrap"><table><thead><tr>'
            "<th>Evidence</th><th>Observed constraint</th><th>Implication</th>"
            f"</tr></thead><tbody>{rows}</tbody></table></div>"
        )
    grid_class = {
        "decisions": "decision-grid",
        "risks": "risk-list",
        "testing_strategy": "validation-list",
        "capability_map": "block-grid",
    }.get(name, "card-grid")
    return f'<div class="{grid_class}">' + "".join(cards) + "</div>"


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


def _render_visual_heading(kind: str, description: str, description_id: str) -> str:
    return (
        '<div class="visual-heading">'
        f'<span class="review-aid-label">{_escape(kind)} · Review aid</span>'
        '<span>Behavioral intent, not final production design</span>'
        "</div>"
        f'<p id="{description_id}" class="visual-description">'
        f"{_escape(description)}</p>"
    )


def _render_frames(name: str, items: list[dict[str, Any]], spec: BlockSpec) -> str:
    frames: list[str] = []
    primary, secondary = spec.fields
    visual_kind = "Annotated state" if name == "annotated_screens" else "Wireframe"
    for index, item in enumerate(items, start=1):
        regions = item["regions"] or [
            {
                "label": _field_label(secondary),
                "detail": item[secondary],
            }
        ]
        rendered_regions = "".join(
            '<div class="screen-region">'
            f"<strong>{_escape(region['label'])}</strong>"
            f"<span>{_escape(region['detail'])}</span></div>"
            for region in regions
        )
        description_id = f"{name}-visual-{index}-description"
        frames.append(
            f'<figure class="visual-surface screen-surface" '
            f'aria-labelledby="{description_id}">'
            f"{_render_visual_heading(visual_kind, item[secondary], description_id)}"
            '<div class="screen-chrome">'
            '<div class="screen-toolbar" aria-hidden="true"><i></i><i></i><i></i></div>'
            f'<div class="screen-canvas"><span class="screen-title">'
            f"{_escape(item[primary])}</span>{rendered_regions}</div></div>"
            f"<figcaption>{_escape(item[primary])}</figcaption></figure>"
        )
    return '<div class="visual-grid">' + "".join(frames) + "</div>"


def _render_native_diagram(
    name: str,
    description: str,
    native: dict[str, Any],
) -> str:
    nodes = native["nodes"]
    width = 760
    node_width = 180
    node_height = 70
    column_gap = 58
    row_gap = 55
    columns = min(3, len(nodes)) or 1
    rows = math.ceil(len(nodes) / columns)
    height = rows * node_height + max(0, rows - 1) * row_gap + 52
    positions: dict[str, tuple[int, int]] = {}
    total_width = columns * node_width + max(0, columns - 1) * column_gap
    start_x = max(20, (width - total_width) // 2)
    node_markup: list[str] = []
    for index, node in enumerate(nodes):
        row = index // columns
        row_column = index % columns
        column = row_column if row % 2 == 0 else columns - row_column - 1
        x = start_x + column * (node_width + column_gap)
        y = 26 + row * (node_height + row_gap)
        positions[node["id"]] = (x, y)
        node_markup.append(
            f'<g class="native-node"><rect x="{x}" y="{y}" width="{node_width}" '
            f'height="{node_height}" rx="12"></rect>'
            f'<foreignObject x="{x + 10}" y="{y + 8}" width="{node_width - 20}" '
            f'height="{node_height - 16}"><div xmlns="http://www.w3.org/1999/xhtml" '
            f'class="native-node-label">{_escape(node["label"])}</div>'
            "</foreignObject></g>"
        )
    edge_markup: list[str] = []
    for edge in native["edges"]:
        if edge["from"] not in positions or edge["to"] not in positions:
            continue
        from_x, from_y = positions[edge["from"]]
        to_x, to_y = positions[edge["to"]]
        from_center_x = from_x + node_width // 2
        from_center_y = from_y + node_height // 2
        to_center_x = to_x + node_width // 2
        to_center_y = to_y + node_height // 2
        delta_x = to_center_x - from_center_x
        delta_y = to_center_y - from_center_y
        if from_y == to_y:
            direction = 1 if delta_x >= 0 else -1
            x1 = from_center_x + direction * node_width // 2
            y1 = from_center_y
            x2 = to_center_x - direction * (node_width // 2 + 10)
            y2 = to_center_y
            path = f"M {x1} {y1} L {x2} {y2}"
            label_x = (x1 + x2) // 2
            label_y = y1 - 9
        elif from_x == to_x:
            direction = 1 if delta_y >= 0 else -1
            x1 = from_center_x
            y1 = from_center_y + direction * node_height // 2
            x2 = to_center_x
            y2 = to_center_y - direction * (node_height // 2 + 10)
            path = f"M {x1} {y1} L {x2} {y2}"
            label_x = x1 + 12
            label_y = (y1 + y2) // 2 - 4
        else:
            direction = 1 if delta_y >= 0 else -1
            x1 = from_center_x
            y1 = from_center_y + direction * node_height // 2
            x2 = to_center_x
            y2 = to_center_y - direction * (node_height // 2 + 10)
            bend_y = (y1 + y2) // 2
            path = (
                f"M {x1} {y1} L {x1} {bend_y} "
                f"L {x2} {bend_y} L {x2} {y2}"
            )
            label_x = (x1 + x2) // 2
            label_y = bend_y - 9
        label = (
            f'<text class="native-edge-label" x="{label_x}" '
            f'y="{label_y}" text-anchor="middle">{_escape(edge["label"])}</text>'
            if edge["label"]
            else ""
        )
        edge_markup.append(
            f'<path d="{path}" marker-end="url(#{name}-arrow)">'
            f"</path>{label}"
        )
    description_id = f"{name}-visual-description"
    return (
        f'<figure class="diagram-surface native-diagram" '
        f'aria-labelledby="{description_id}">'
        f'<p id="{description_id}" class="visual-description">{_escape(description)}</p>'
        '<div class="diagram-canvas">'
        f'<svg viewBox="0 0 {width} {height}" role="img" '
        f'aria-labelledby="{description_id}" preserveAspectRatio="xMidYMid meet">'
        f'<defs><marker id="{name}-arrow" viewBox="0 0 10 10" refX="8" refY="5" '
        'markerWidth="7" markerHeight="7" orient="auto-start-reverse">'
        '<path d="M 0 0 L 10 5 L 0 10 z"></path></marker></defs>'
        f'<g class="native-edges">{"".join(edge_markup)}</g>'
        f'{"".join(node_markup)}</svg></div>'
        "<figcaption>Structured HTML and SVG generated from manifest content.</figcaption>"
        "</figure>"
    )


def _render_mermaid_diagram(name: str, value: dict[str, Any]) -> str:
    description_id = f"{name}-visual-description"
    source_id = f"{name}-mermaid-source"
    return (
        f'<figure class="diagram-surface mermaid-diagram" '
        f'aria-labelledby="{description_id}">'
        f'<p id="{description_id}" class="visual-description">{_escape(value["description"])}</p>'
        f'<div class="mermaid-canvas" data-mermaid-source="{source_id}" '
        'aria-hidden="true"><p class="visual-loading">Rendering diagram…</p></div>'
        '<details class="diagram-source-details" open>'
        '<summary>Diagram source and text fallback</summary>'
        f'<pre id="{source_id}" class="diagram-source"><code>'
        f'{_escape(value["source"])}</code></pre></details>'
        '<figcaption>Rendered from Mermaid source using the approved CDN.</figcaption>'
        "</figure>"
    )


def _render_prototype(value: dict[str, Any]) -> str:
    description_id = "prototype-visual-description"
    tabs: list[str] = []
    panels: list[str] = []
    for index, state in enumerate(value["states"]):
        selected = index == 0
        state_id = f"prototype-state-{index + 1}"
        tab_id = f"prototype-tab-{index + 1}"
        tabs.append(
            f'<button id="{tab_id}" type="button" role="tab" '
            f'aria-selected="{str(selected).lower()}" aria-controls="{state_id}" '
            f'tabindex="{"0" if selected else "-1"}">{_escape(state["label"])}</button>'
        )
        content = "".join(
            '<div class="prototype-field">'
            f"<span>{_escape(item['label'])}</span>"
            f"<strong>{_escape(item['value'])}</strong></div>"
            for item in state["content"]
        )
        panels.append(
            f'<section id="{state_id}" class="prototype-state" role="tabpanel" '
            f'aria-labelledby="{tab_id}" data-state-label="{_escape(state["label"])}"'
            f'{" hidden" if not selected else ""}>'
            f'<p class="prototype-behavior">{_escape(state["behavior"])}</p>'
            f'<div class="prototype-content">{content}</div></section>'
        )
    return (
        f'<figure class="prototype prototype-surface" '
        f'aria-labelledby="{description_id}">'
        '<div class="prototype-toolbar"><div><span class="prototype-dot"></span>'
        f'<strong id="{description_id}">{_escape(value["description"])}</strong></div>'
        '<div class="prototype-tabs" role="tablist" aria-label="Prototype states">'
        f'{"".join(tabs)}</div></div><div class="prototype-stage">{"".join(panels)}</div>'
        '<figcaption>State switching is local, temporary, and does not persist data.</figcaption>'
        "</figure>"
    )


def _render_block_content(name: str, value: Any, spec: BlockSpec) -> str:
    if spec.kind == "summary":
        metrics = "".join(
            '<article class="metric">'
            f"<span>{_escape(item['label'])}</span>"
            f"<strong>{_escape(item['value'])}</strong>"
            f"<p>{_escape(item['description'])}</p></article>"
            for item in value["metrics"]
        )
        return (
            f'<div class="metric-grid">{metrics}</div>'
            '<div class="callout"><strong>Recommendation</strong>'
            f"<p>{_escape(value['recommendation'])}</p></div>"
        )
    if spec.kind == "cards":
        return _render_cards(name, value, spec)
    if spec.kind == "frames":
        return _render_frames(name, value, spec)
    if spec.kind == "prototype":
        return _render_prototype(value)
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
        if value["source"]:
            return _render_mermaid_diagram(name, value)
        if value["native"] is not None:
            return _render_native_diagram(name, value["description"], value["native"])
        return (
            '<figure class="diagram-brief">'
            '<div>'
            f"<p>{_escape(value['description'])}</p></div>"
            "<figcaption>Text-first diagram brief; visual rendering is optional.</figcaption>"
            "</figure>"
        )
    if spec.kind == "table":
        return _render_table(value)
    if spec.kind == "questions":
        rows: list[str] = []
        for index, question in enumerate(value, start=1):
            entity_id = question.get("id", f"question-{index:02d}")
            label = question.get("label", _entity_label(entity_id))
            links = "".join(
                [
                    _render_relationship_links("Related", question.get("relates_to", [])),
                    _render_evidence_items(question.get("evidence", [])),
                ]
            )
            rows.append(
                f'<article id="{_escape(entity_id)}">'
                f'<a class="entity-id" href="#{_escape(entity_id)}" '
                f'aria-label="Link to {_escape(label)}">{_escape(label)}</a>'
                f"<h3>{_escape(question['question'])}</h3>{links}</article>"
            )
        return f'<div class="question-list">{"".join(rows)}</div>'
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


def _iter_entities(blocks: dict[str, Any]) -> list[tuple[str, str, str, dict[str, Any]]]:
    entities: list[tuple[str, str, str, dict[str, Any]]] = []
    for block_name, items in blocks.items():
        spec = BLOCK_SPECS[block_name]
        if not spec.id_prefix:
            continue
        title_field = "question" if spec.kind == "questions" else spec.fields[0]
        for item in items:
            entities.append((block_name, item["id"], item.get(title_field, ""), item))
    return entities


def _render_traceability_links(references: list[str]) -> str:
    if not references:
        return "—"
    return ", ".join(
        f'<a href="#{_escape(reference)}">{_escape(_entity_label(reference))}</a>'
        for reference in references
    )


def _render_traceability_view(blocks: dict[str, Any]) -> str:
    entities = _iter_entities(blocks)
    if not entities:
        return ""
    rows: list[str] = []
    for block_name, entity_id, title, item in entities:
        links = item.get("relates_to", []) + item.get("validation", []) + item.get("validates", [])
        connected = _render_traceability_links(links)
        evidence = ", ".join(f"<code>{_escape(reference)}</code>" for reference in item.get("evidence", [])) or "—"
        exception = _escape(item.get("exception", "")) if item.get("exception") else "—"
        rows.append(
            "<tr>"
            f'<td><a href="#{_escape(entity_id)}">{_escape(item.get("label", _entity_label(entity_id)))}</a></td>'
            f"<td>{_escape(BLOCK_SPECS[block_name].title)}</td>"
            f"<td>{_escape(title)}</td>"
            f"<td>{connected}</td>"
            f"<td>{evidence}</td>"
            f"<td>{exception}</td>"
            "</tr>"
        )
    return (
        '<section id="traceability" class="section" data-block="traceability" data-block-category="delivery-assurance" '
        'data-review-area="validation decisions" aria-labelledby="traceability-heading">'
        '<div class="section-heading"><span>TR</span><div><h2 id="traceability-heading">'
        '<a href="#traceability">Traceability view</a></h2>'
        '<p>Generated relationships between requirements, decisions, risks, questions, and validation outcomes.</p>'
        '</div></div><div class="table-wrap traceability-table"><table><thead><tr>'
        '<th>ID</th><th>Type</th><th>Statement</th><th>Connected entities</th><th>Evidence</th><th>Exception</th>'
        f'</tr></thead><tbody>{"".join(rows)}</tbody></table></div></section>'
    )


def render_document(manifest: dict[str, Any]) -> str:
    metadata_items: dict[str, str] = {}
    for label, value in manifest["metadata"].items():
        if label.casefold() == "review mode":
            metadata_items["Output"] = f"action-items/PRD-{manifest['slug']}/"
        metadata_items[label] = value
    if "Output" not in metadata_items:
        metadata_items["Output"] = f"action-items/PRD-{manifest['slug']}/"
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
        if name == "repository_grounding":
            content = (
                '<p class="evidence-disclaimer"><strong>Evidence only:</strong> referenced paths and symbols support product statements; they are not mandatory implementation instructions.</p>'
                f"{content}"
            )
        if name in {"scope"}:
            content = (
                '<details class="supporting-detail" open>'
                f"<summary>Review {html.escape(spec.title.lower())}</summary>"
                f"{content}</details>"
            )
        navigation.append(f'<a href="#{name}">{_escape(spec.title)}</a>')
        rendered_blocks.append(
            f'<section id="{name}" class="section" data-block="{name}" '
            f'data-block-category="{spec.category}" data-review-area="{spec.review_area}" '
            f'aria-labelledby="{heading_id}">'
            '<div class="section-heading">'
            f"<span>{number:02d}</span><div><h2 id=\"{heading_id}\">"
            f'<a href="#{name}">{_escape(spec.title)}</a></h2>'
            f"<p>{_escape(spec.description)}</p></div></div>"
            f"{content}</section>"
        )

    traceability_view = _render_traceability_view(manifest["blocks"])
    if traceability_view:
        navigation.append('<a href="#traceability">Traceability</a>')
        rendered_blocks.append(traceability_view)

    has_supporting_details = any(
        name == "scope" or BLOCK_SPECS[name].kind == "diagram"
        for name in manifest["blocks"]
    )
    replacements = {
        "{{TITLE}}": _escape(manifest["title"]),
        "{{SUMMARY}}": _escape(manifest["summary"]),
        "{{STATUS}}": _escape(manifest["status"]),
        "{{METADATA}}": metadata,
        "{{NAVIGATION}}": "\n".join(navigation),
        "{{DETAILS_CONTROL}}": (
            '<button id="collapse-all" type="button" aria-pressed="false">'
            "Collapse details</button>"
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
