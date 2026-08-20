"""Schema and rendering specifications for PRD manifests."""

from __future__ import annotations

import re
from collections.abc import Iterator
from dataclasses import dataclass

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
REQUIRED_SURFACES_BY_INITIATIVE = {
    "small-feature": {"document"},
    "ui-heavy": {"document", "ui"},
    "workflow-heavy": {"document", "workflow"},
    "api-heavy": {"document", "api"},
    "data-heavy": {"document", "data"},
    "architecture-heavy": {"document", "architecture"},
    "mixed": {"document"},
}
SCHEMA_VERSIONS = (1, 2)
CURRENT_SCHEMA_VERSION = 2
# Version 2 requires the design tree. Version 1 keeps it optional, so a manifest
# published before the tree existed stays valid without a back-filled tree.
DESIGN_TREE_REQUIRED_FROM_VERSION = 2
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


DESIGN_TREE_STATUSES = ("settled", "pruned", "deferred")
DESIGN_TREE_SOURCES = ("user", "research")
DESIGN_TREE_NODE_FIELDS = ("id", "label", "question", "status")
DESIGN_TREE_NODE_OPTIONAL_FIELDS = ("children", "relates_to", "evidence")
# Each status owns the fields that record why the branch ended the way it did,
# so a field that belongs to one status is an error on the others.
DESIGN_TREE_REQUIRED_FIELDS_BY_STATUS = {
    "settled": ("answer", "source", "rationale"),
    "pruned": ("reason",),
    "deferred": (),
}
DESIGN_TREE_EXTRA_FIELDS_BY_STATUS = {
    "settled": ("superseded_answer",),
    "pruned": (),
    "deferred": (),
}
DESIGN_TREE_STATUS_FIELDS = {
    field
    for status in DESIGN_TREE_STATUSES
    for field in DESIGN_TREE_REQUIRED_FIELDS_BY_STATUS[status]
    + DESIGN_TREE_EXTRA_FIELDS_BY_STATUS[status]
}


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
    "design_tree": BlockSpec("Design tree", "The interview branches behind the settled decisions.", "product-definition", "decisions", "tree", id_prefix="node", label_prefix="NODE"),
    "alternatives": BlockSpec("Alternatives and tradeoffs", "Options considered and why they were not selected.", "product-definition", "decisions", "cards", ("option", "tradeoff")),
    "wireframes": BlockSpec("Wireframes", "Screen concepts used to review layout and hierarchy.", "visual-experience", "all", "frames", ("screen", "intent")),
    "before_after": BlockSpec("Before and after", "The visible change from the current experience.", "visual-experience", "all", "cards", ("before", "after")),
    "annotated_screens": BlockSpec("Annotated screen states", "Important states and the behavior each communicates.", "visual-experience", "validation", "frames", ("state", "annotation")),
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

ENTITY_OPTIONAL_FIELDS_BY_BLOCK = {
    "requirements": {"id", "relates_to", "validation", "evidence", "exception"},
    "decisions": {"id", "relates_to", "evidence"},
    "risks": {"id", "relates_to", "evidence"},
    "testing_strategy": {"id", "relates_to", "validates", "evidence"},
}

ENTITY_ID_PATTERN = re.compile(r"^(req|dec|risk|question|test|node)-[a-z0-9][a-z0-9-]*$")


def normalize_entity_id(value: str) -> str:
    return value.strip().lower()


def entity_label(entity_id: str) -> str:
    prefix, _, suffix = entity_id.partition("-")
    return f"{prefix.upper()}-{suffix.upper()}"


# A tree block publishes as one graph, so its nodes carry no anchor of their own
# and a reference to a node points at the block section that draws it.
_TREE_BLOCK_BY_ID_PREFIX = {
    spec.id_prefix: name
    for name, spec in BLOCK_SPECS.items()
    if spec.kind == "tree" and spec.id_prefix
}


def entity_anchor(entity_id: str) -> str:
    """Return the in-page anchor that a reference to this entity may link to."""

    prefix, _, _ = entity_id.partition("-")
    return _TREE_BLOCK_BY_ID_PREFIX.get(prefix, entity_id)


def iter_tree_nodes(nodes: list[dict]) -> Iterator[dict]:
    """Yield every design tree node in document order, parents before children.

    The walk is iterative because tree depth comes from author input, and a
    recursive walk would raise RecursionError instead of a manifest error.
    """
    stack = list(reversed(nodes))
    while stack:
        node = stack.pop()
        yield node
        stack.extend(reversed(node.get("children", [])))


__all__ = [
    "BLOCK_SPECS",
    "CURRENT_SCHEMA_VERSION",
    "DESIGN_TREE_EXTRA_FIELDS_BY_STATUS",
    "DESIGN_TREE_NODE_FIELDS",
    "DESIGN_TREE_NODE_OPTIONAL_FIELDS",
    "DESIGN_TREE_REQUIRED_FIELDS_BY_STATUS",
    "DESIGN_TREE_REQUIRED_FROM_VERSION",
    "DESIGN_TREE_SOURCES",
    "DESIGN_TREE_STATUSES",
    "DESIGN_TREE_STATUS_FIELDS",
    "ENTITY_ID_PATTERN",
    "ENTITY_OPTIONAL_FIELDS_BY_BLOCK",
    "GENERATED_METADATA_LABELS",
    "INITIATIVE_TYPES",
    "MANIFEST_FIELDS",
    "REQUIRED_SURFACES_BY_INITIATIVE",
    "REVIEW_SURFACES",
    "SCHEMA_VERSIONS",
    "SLUG_PATTERN",
    "TEMPLATE_MARKER_PATTERN",
    "BlockSpec",
    "entity_anchor",
    "entity_label",
    "iter_tree_nodes",
    "normalize_entity_id",
]
