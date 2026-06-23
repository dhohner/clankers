"""Schema and rendering specifications for PRD manifests."""

from __future__ import annotations

import re
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

ENTITY_ID_PATTERN = re.compile(r"^(req|dec|risk|question|test)-[a-z0-9][a-z0-9-]*$")


def normalize_entity_id(value: str) -> str:
    return value.strip().lower()


def entity_label(entity_id: str) -> str:
    prefix, _, suffix = entity_id.partition("-")
    return f"{prefix.upper()}-{suffix.upper()}"


__all__ = [
    "BLOCK_SPECS",
    "ENTITY_ID_PATTERN",
    "ENTITY_OPTIONAL_FIELDS_BY_BLOCK",
    "GENERATED_METADATA_LABELS",
    "INITIATIVE_TYPES",
    "MANIFEST_FIELDS",
    "REVIEW_SURFACES",
    "SLUG_PATTERN",
    "TEMPLATE_MARKER_PATTERN",
    "BlockSpec",
    "entity_label",
    "normalize_entity_id",
]