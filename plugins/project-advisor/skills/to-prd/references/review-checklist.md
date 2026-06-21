# PRD Bundle Review Checklist

Apply this checklist after the generator succeeds and before requesting human acceptance.

## Structure and portability

- `index.html`, `prd.json`, and every referenced local asset exist inside `action-items/PRD-<slug>/`.
- The copied files under `assets/` are the generator's versioned assets; the bundle does not depend on a virtual environment, package install, or machine-specific absolute asset path.
- IDs are unique and stable across regeneration when the underlying requirement, decision, risk, question, or validation outcome has not changed.
- Fragment links resolve, local asset links stay inside the bundle, and no placeholder or template marker remains.
- The normalized `prd.json` represents the same initiative and content shown in `index.html`.

## Product quality and traceability

- Problem, outcome, users, scope, requirements, decisions, risks, testing intent, and open questions are coherent.
- Confirmed decisions, provisional assumptions, and open questions are not presented as the same certainty level.
- Each requirement has a stable ID and connects to a validation outcome or an explicit exception.
- Material relationships among requirements, decisions, risks, questions, evidence, and tests are reviewable.
- Repository evidence supports product statements without turning suggested file or symbol locations into mandatory implementation instructions.
- A later issue-splitting pass can use the accepted PRD without rediscovering the initiative shape.

## Responsive and interaction review

- At a desktop width, navigation remains usable while content scrolls and does not obscure the document.
- At a narrow/mobile width, no meaningful content is clipped or requires unintended horizontal scrolling.
- Navigation, anchors, collapsible details, and read-only prototype controls remain keyboard-operable.
- Prototype states are explicitly read-only, do not persist changes, and retain understandable content without interaction.
- Reduced-motion behavior does not hide content or block navigation.

## Accessibility

- Heading order, landmarks, labels, focus order, and contrast support document review.
- Diagrams, wireframes, and prototypes include a useful description or structured text equivalent.
- Diagram rendering failure leaves the source meaning available.
- Visual meaning is not communicated by color alone.

## Print

- Print output includes all required sections and expands content hidden only for interactive review.
- Navigation and controls do not consume print space or become required to understand the document.
- Tables, diagrams, prototypes, and traceability content remain legible and do not lose critical labels at page boundaries.
- Asset references resolve when printing or saving the local bundle as PDF.

## Visual relevance

- Every visual surface clarifies a decision, workflow, state, hierarchy, or contract that prose alone would make harder to review.
- UI-heavy PRDs show useful states or flows; workflow-heavy PRDs expose transitions and failure paths; API, data, and architecture-heavy PRDs visualize only the contracts or boundaries that require alignment.
- Decorative, redundant, empty, or misleading visuals are omitted.
- The document remains readable when optional blocks are absent.

Fix failures in the manifest or generator, regenerate, and repeat the relevant checks. If visual tooling is unavailable, complete the structural checks and explicitly leave responsive, print, and rendered accessibility checks for human review.
