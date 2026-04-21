# PRD: Self-Service Order History

## Problem

Customers currently contact support to answer simple questions about older orders, invoice access, and delivery status. This increases support volume and delays resolution for more complex issues.

## Goal

Let signed-in customers review their completed and in-progress orders in the customer portal, filter the list to find a specific order quickly, and open invoice documents without contacting support.

## Primary user story

As a returning customer, I want to review my past orders and invoices so that I can answer routine questions myself.

## Scope

- Show a chronological order history in the customer portal.
- Allow filtering by order status and date range.
- Show key order details: order number, date, total amount, status, and delivery summary.
- Allow opening the invoice PDF for orders that already have an invoice.
- Show a clear empty state when no orders match the current filters.

## Out of scope

- Order cancellation.
- Editing an order after submission.
- Reissuing invoices.

## Functional requirements

### Browsing and filtering

- Customers can open an "Order history" area from the account section.
- The list defaults to the most recent orders first.
- Customers can filter by status: all, processing, shipped, delivered, cancelled.
- Customers can filter by date range using preset ranges: last 30 days, last 90 days, last 12 months.
- The interface keeps the selected filters while the customer navigates into an order and back.

### Order details

- Selecting an order opens a detail view with delivery address, line items, payment summary, and shipment milestones.
- If an invoice is available, the customer can open it from both the list row and the detail view.
- If an invoice is not yet available, the UI explains that clearly.

### Edge cases

- If the customer has no orders, show a first-time empty state instead of an empty table.
- If filters remove all results, show a filtered empty state and a way to clear filters.
- If invoice retrieval fails, the customer sees a retryable error without losing the current page state.

## Non-functional requirements

- The order list must feel responsive for customers with hundreds of orders.
- Only the authenticated customer can access their own order history and invoice links.
- Invoice access must be auditable.

## Existing system context

- Order data already exists in the commerce backend and is exposed internally through a service consumed by the portal.
- Invoice PDFs are stored in the document service.
- The current portal uses a React frontend and a BFF layer.
- The operations team wants invoice accesses logged for compliance.

## Success measures

- Reduce support contacts about order history and invoice requests.
- Customers can find a specific order or invoice without contacting support.
