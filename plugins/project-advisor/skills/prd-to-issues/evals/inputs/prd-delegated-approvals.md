# PRD: Delegated Purchase Approvals

## Problem

Purchase approvals stall when the assigned approver is on leave or temporarily unavailable. Requesters have no visibility into who can act instead, and urgent requests are delayed.

## Goal

Allow an approver to delegate approval authority to another eligible manager for a defined period, while preserving auditability and preventing ambiguous ownership.

## Primary user stories

- As an approver, I want to delegate my approvals before I go on leave so urgent requests continue moving.
- As a requester, I want to see who currently owns my approval so I know who can act.
- As a compliance reviewer, I want delegated decisions to be traceable so accountability is preserved.

## Scope

- Approvers can create a delegation with a start date, end date, and delegate approver.
- Only eligible managers in the same business unit can be selected.
- Active delegations reroute new approval tasks automatically.
- Existing in-flight requests show the currently responsible approver.
- Audit history records who delegated, to whom, for what period, and who took each resulting action.
- Approvers and delegates receive notifications when a delegation starts and ends.

## Out of scope

- Permanent reassignment of approval chains.
- Multi-step delegation chains.
- Cross-business-unit delegation.

## Functional requirements

### Delegation setup

- Approvers can create, edit, and cancel future delegations.
- Overlapping active delegations for the same approver are not allowed.
- The system explains validation failures clearly, including ineligible delegates and invalid dates.

### Approval routing

- New approval requests created during the active delegation window are assigned to the delegate.
- Requests created before the window keep their current status but must display the responsible approver consistently across list and detail views.
- When the delegation ends, new requests route back to the original approver automatically.

### Audit and notifications

- Delegation creation, update, cancellation, activation, expiration, and approval actions must be auditable.
- Email and in-product notifications are sent at delegation start and delegation end.
- Compliance users can review delegation history for a requester or approver without database access.

## Non-functional requirements

- Approval routing changes must be reliable even around midnight timezone boundaries.
- Delegation status should update without requiring manual intervention from operations.
- The solution must support future reporting on delegation usage.

## Existing system context

- The approval product currently uses a workflow engine, a manager hierarchy service, and a notification service.
- The manager directory already exposes business-unit membership and active employment status.
- The team has discussed adding a delegation table and extending the approval assignment API, but the PRD intentionally does not prescribe the implementation path.

## Success measures

- Fewer approval delays caused by approver absence.
- Requesters can identify the active approver without asking support.
- Compliance can trace delegated decisions end to end.