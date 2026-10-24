# Infrastructure tickets

## Source and decisions

Capture the capability, consumer or operator, affected systems and environments, binding constraints, operational requirements, and acceptance evidence.
Preserve required technologies and architecture decisions, including implementation details.
Leave unspecified module layouts, scripts, resource names, roles, and tools to engineering.

Resolve decisions before drafting when competing answers would change scope, security, persisted state, ownership, acceptance, or the slice breakdown.
Depending on the source, these may concern:

- Resource and environment scope.
- Supported execution environments, tooling, and network access.
- Bootstrap ownership for identities, trust, permissions, and state backends.
- Deployment permissions, state access, and approval policy.
- State isolation, locking, concurrency, and interrupted execution.

Record other uncertainty under open decisions, including owners or delivery impact when supplied.

## Slice boundaries

Each ticket establishes a usable capability or prerequisite contract with a named consumer and verification method.
Separate ownership or delivery boundaries can justify tickets for federation, state backends, or network access.
Combine small prerequisites with their consumer when that gives a clearer acceptance boundary.
Splitting by Terraform file, module, or pipeline stage alone does not establish an outcome.
State inherited contracts and real predecessors without copying unchanged verification suites.

## Acceptance and evidence

Keep assumptions, risks, external dependencies, and open decisions distinct from settled requirements.
Preserve source requirements for provisioning, repeated execution, failure recovery, ownership, teardown, and observability under operations.
Use system actors or verification boundaries in scenarios when no person acts.

Under the verification and evidence note entry, map methods and expected evidence to named scenarios or cases.
Each scenario needs an identifiable method, environment or system boundary, and expected evidence.
Group shared execution procedures and static checks to avoid repeating them for every criterion.
Describe evidence the implementation must provide without claiming it was observed.

Use configuration inspection for static constraints and actual execution for authentication, authorization, deployment, persistence, and concurrency behavior.
A successful plan alone does not prove apply permissions.
Cover source failure paths and boundaries without inventing failure semantics or thresholds.
Never require credentials, raw tokens, Terraform state contents, or sensitive plan data as ticket evidence.
Use sanitized logs, run references, test results, and appropriately restricted artifacts.
