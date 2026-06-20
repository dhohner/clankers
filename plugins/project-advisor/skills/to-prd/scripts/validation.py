"""Manifest validation and traceability normalization."""

from __future__ import annotations

from typing import Any

from .spec import (
    BLOCK_SPECS,
    ENTITY_ID_PATTERN,
    ENTITY_OPTIONAL_FIELDS_BY_BLOCK,
    GENERATED_METADATA_LABELS,
    INITIATIVE_TYPES,
    MANIFEST_FIELDS,
    REVIEW_SURFACES,
    SLUG_PATTERN,
    entity_label,
    normalize_entity_id,
)
from .types import NormalizedBlocks, NormalizedManifest


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
                normalized[list_field] = _string_list(
                    item.get(list_field),
                    f"{item_path}.{list_field}",
                    errors,
                )
        if "exception" in optional_fields and "exception" in item:
            normalized["exception"] = _non_empty_string(
                item.get("exception"),
                f"{item_path}.exception",
                errors,
            )
        result.append(normalized)
    return result


def _optional_object_list(
    value: Any,
    path: str,
    fields: tuple[str, ...],
    errors: list[str],
) -> list[dict[str, Any]]:
    if value is None or value == []:
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
    description = _non_empty_string(value.get("description"), f"{path}.description", errors)
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
        _reject_unknown_fields(state, {"label", "behavior", "content"}, state_path, errors)
        states.append(
            {
                "label": _non_empty_string(state.get("label"), f"{state_path}.label", errors),
                "behavior": _non_empty_string(state.get("behavior"), f"{state_path}.behavior", errors),
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
    edges = _optional_object_list(value.get("edges"), f"{path}.edges", ("from", "to", "label"), errors)
    known_ids = set(node_ids)
    for index, edge in enumerate(edges):
        for endpoint in ("from", "to"):
            if edge[endpoint] and edge[endpoint] not in known_ids:
                errors.append(f"{path}.edges[{index}].{endpoint} must reference a node id")
    return {"nodes": nodes, "edges": edges}


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
        optional_fields = ENTITY_OPTIONAL_FIELDS_BY_BLOCK.get(name)
        return _object_list(value, path, spec.fields, errors, optional_fields)
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
                    normalized[list_field] = _string_list(
                        item.get(list_field),
                        f"{item_path}.{list_field}",
                        errors,
                    )
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
                    errors.append(f"{row_path} must contain {len(columns)} values to match {path}.columns")
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


def _assign_and_validate_traceability(blocks: NormalizedBlocks, errors: list[str]) -> None:
    entity_ids: dict[str, str] = {}
    validation_links: dict[str, set[str]] = {}
    requirements: list[dict[str, Any]] = []

    for block_name, items in blocks.items():
        spec = BLOCK_SPECS[block_name]
        if not spec.id_prefix or not spec.label_prefix:
            continue
        text_field = "question" if block_name == "open_questions" else spec.fields[0]
        for index, item in enumerate(items, start=1):
            default_id = f"{spec.id_prefix}-{index:02d}"
            entity_id = normalize_entity_id(item.get("id", default_id))
            item["id"] = entity_id
            item["label"] = entity_label(entity_id)
            if not ENTITY_ID_PATTERN.fullmatch(entity_id) or not entity_id.startswith(f"{spec.id_prefix}-"):
                errors.append(
                    f"blocks.{block_name}[{index - 1}].id must look like {spec.label_prefix}-01 and use the {spec.id_prefix} prefix"
                )
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
                    normalized_requirement_id = normalize_entity_id(requirement_id)
                    validation_links.setdefault(normalized_requirement_id, set()).add(entity_id)
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
                    reference_id = normalize_entity_id(reference)
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
            normalize_entity_id(reference)
            for reference in requirement.get("validation", [])
        } | validation_links.get(requirement_id, set())
        requirement["validation"] = sorted(linked_tests)
        if not linked_tests and not requirement.get("exception"):
            errors.append(
                f"{entity_ids.get(requirement_id, requirement_id)} must connect to a validation outcome or include an exception"
            )


def validate_manifest(raw: Any) -> NormalizedManifest:
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
        errors.append("initiative_type must be one of: " + ", ".join(sorted(INITIATIVE_TYPES)))

    surfaces = _string_list(raw.get("review_surfaces"), "review_surfaces", errors)
    for index, surface in enumerate(surfaces):
        if surface not in REVIEW_SURFACES:
            errors.append(f"review_surfaces[{index}] must be one of: " + ", ".join(sorted(REVIEW_SURFACES)))
    if len(surfaces) != len(set(surfaces)):
        errors.append("review_surfaces must not contain duplicates")

    normalized: NormalizedManifest = {
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
                errors.append(f"metadata contains duplicate label after normalization: {label}")
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


__all__ = ["ManifestError", "_json_object", "validate_manifest"]