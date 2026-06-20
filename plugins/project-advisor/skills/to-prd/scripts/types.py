"""Typed manifest models shared across generator modules.

These types describe the normalized manifest contract returned by validation and
consumed by rendering and bundle publication. They give future schema versions a
stable place to evolve without forcing every module boundary back to
``dict[str, Any]``.
"""

from __future__ import annotations

from typing import TypeAlias, TypedDict


class MetricItem(TypedDict):
    label: str
    value: str
    description: str


class SummaryBlock(TypedDict):
    metrics: list[MetricItem]
    recommendation: str


class ProblemBlock(TypedDict):
    statement: str
    evidence: list[str]


ScopeBlock = TypedDict("ScopeBlock", {"in": list[str], "out": list[str]})


class DiagramNode(TypedDict):
    id: str
    label: str


DiagramEdge = TypedDict("DiagramEdge", {"from": str, "to": str, "label": str})


class NativeDiagram(TypedDict):
    nodes: list[DiagramNode]
    edges: list[DiagramEdge]


class DiagramBlock(TypedDict):
    description: str
    source: str
    native: NativeDiagram | None


class TableBlock(TypedDict):
    columns: list[str]
    rows: list[list[str]]


class RegionItem(TypedDict):
    label: str
    detail: str


class FrameItem(TypedDict):
    regions: list[RegionItem]


class WireframeItem(FrameItem):
    screen: str
    intent: str


class AnnotatedScreenItem(FrameItem):
    state: str
    annotation: str


class PrototypeField(TypedDict):
    label: str
    value: str


class PrototypeState(TypedDict):
    label: str
    behavior: str
    content: list[PrototypeField]


class PrototypeBlock(TypedDict):
    description: str
    states: list[PrototypeState]


class CodeSample(TypedDict):
    reference: str
    language: str
    code: str
    annotation: str


class TraceableEntity(TypedDict, total=False):
    id: str
    label: str
    relates_to: list[str]
    evidence: list[str]


class RequirementItem(TraceableEntity, total=False):
    title: str
    description: str
    validation: list[str]
    exception: str


class DecisionItem(TraceableEntity, total=False):
    decision: str
    rationale: str


class RiskItem(TraceableEntity, total=False):
    risk: str
    mitigation: str


class TestingStrategyItem(TraceableEntity, total=False):
    target: str
    expected_outcome: str
    validates: list[str]


class OpenQuestionItem(TraceableEntity, total=False):
    question: str


CardItem: TypeAlias = dict[str, str]
CardBlock: TypeAlias = list[CardItem]
StringBlock: TypeAlias = list[str]
WireframesBlock: TypeAlias = list[WireframeItem]
AnnotatedScreensBlock: TypeAlias = list[AnnotatedScreenItem]
RequirementsBlock: TypeAlias = list[RequirementItem]
DecisionsBlock: TypeAlias = list[DecisionItem]
RisksBlock: TypeAlias = list[RiskItem]
TestingStrategyBlock: TypeAlias = list[TestingStrategyItem]
OpenQuestionsBlock: TypeAlias = list[OpenQuestionItem]
AnnotatedCodeBlock: TypeAlias = list[CodeSample]

NormalizedBlock: TypeAlias = (
    SummaryBlock
    | ProblemBlock
    | ScopeBlock
    | DiagramBlock
    | TableBlock
    | PrototypeBlock
    | CardBlock
    | StringBlock
    | WireframesBlock
    | AnnotatedScreensBlock
    | RequirementsBlock
    | DecisionsBlock
    | RisksBlock
    | TestingStrategyBlock
    | OpenQuestionsBlock
    | AnnotatedCodeBlock
)


class NormalizedBlocks(TypedDict, total=False):
    executive_summary: SummaryBlock
    problem: ProblemBlock
    goals: CardBlock
    non_goals: StringBlock
    personas: CardBlock
    user_stories: CardBlock
    journeys: CardBlock
    workflow_diagram: DiagramBlock
    state_transition_matrix: TableBlock
    failure_paths: CardBlock
    requirements: RequirementsBlock
    capability_map: CardBlock
    scope: ScopeBlock
    business_rules: CardBlock
    decisions: DecisionsBlock
    alternatives: CardBlock
    wireframes: WireframesBlock
    before_after: CardBlock
    annotated_screens: AnnotatedScreensBlock
    prototype: PrototypeBlock
    ui_flow: DiagramBlock
    design_direction: CardBlock
    architecture_diagram: DiagramBlock
    data_flow_diagram: DiagramBlock
    system_context: DiagramBlock
    api_contract: CardBlock
    data_model: CardBlock
    event_lifecycle: DiagramBlock
    file_symbol_map: CardBlock
    annotated_code: AnnotatedCodeBlock
    dependencies: CardBlock
    risks: RisksBlock
    security_privacy: CardBlock
    rollout: CardBlock
    testing_strategy: TestingStrategyBlock
    traceability_matrix: TableBlock
    open_questions: OpenQuestionsBlock
    repository_grounding: CardBlock


class NormalizedManifest(TypedDict):
    schema_version: int
    slug: str
    title: str
    summary: str
    status: str
    initiative_type: str
    review_surfaces: list[str]
    metadata: dict[str, str]
    blocks: NormalizedBlocks


__all__ = [
    "AnnotatedCodeBlock",
    "AnnotatedScreenItem",
    "AnnotatedScreensBlock",
    "CardBlock",
    "CardItem",
    "CodeSample",
    "DecisionItem",
    "DecisionsBlock",
    "DiagramBlock",
    "DiagramEdge",
    "DiagramNode",
    "MetricItem",
    "NativeDiagram",
    "NormalizedBlock",
    "NormalizedBlocks",
    "NormalizedManifest",
    "OpenQuestionItem",
    "OpenQuestionsBlock",
    "ProblemBlock",
    "PrototypeBlock",
    "PrototypeField",
    "PrototypeState",
    "RegionItem",
    "RequirementItem",
    "RequirementsBlock",
    "RiskItem",
    "RisksBlock",
    "ScopeBlock",
    "StringBlock",
    "SummaryBlock",
    "TableBlock",
    "TestingStrategyBlock",
    "TestingStrategyItem",
    "TraceableEntity",
    "WireframeItem",
    "WireframesBlock",
]