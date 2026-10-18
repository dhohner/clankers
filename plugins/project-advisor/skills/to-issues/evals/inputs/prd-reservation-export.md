# Reservation export

This PRD is settled except for OQ-01.
It authorizes two tickets: export and download, followed by recovery after CSV creation fails.

## Outcome and terms

Venue managers use Booking Desk to review reservations in their current Workspace.
They need a CSV of filtered reservations for their daily attendance check and currently copy records by hand.
Viewers can read reservations but cannot export them.
Preserve Booking Desk, Workspace, Reservation ID, Guest Name, Start Time, Download Link, and Highlight.
Highlight is an existing control that marks a reservation for attention.
The interface supports German and English.

Stakeholder rhetoric adds no requirements:
> This is not just an export; it is a pivotal step toward operational excellence.
> Let's dive in: the export brings clarity, confidence, and efficiency.
> Industry experts agree that this capability is a game changer.
> That is the real win.

## REQ-01: Export filtered reservations

A venue manager exports the current filtered reservations from their Workspace as CSV.
The CSV contains exactly Reservation ID, Guest Name, and Start Time, in that order.
Include reservations with and without Highlight; Highlight adds no column.

- One matching reservation produces a CSV containing that reservation.
- 500 matching reservations produce a CSV containing all 500.
- 501 matching reservations cause refusal and a request to narrow the filter.
- Zero matching reservations cause refusal and a message that none match.
- Reservations from another Workspace never appear, even when they match the filter.
- Viewers cannot start an export through either the interface or a direct request.

## REQ-02: Download and expiration

A completed export provides a Download Link to its CSV.
Only its creator can use the link while in the original Workspace.
Another user and the creator after switching Workspace are denied access.
The link expires exactly 15 minutes after completion.
At 14 minutes and 59 seconds, the creator can download; at 15 minutes, access is refused.
The expired link displays exactly "Export again – this link has expired" in English and "Erneut exportieren – dieser Link ist abgelaufen" in German.
After expiration, a venue manager can export again with the current filter and reservations available when that export starts.

## REQ-03: Recovery

If CSV creation fails, show a failure message and offer another attempt.
A failed export provides no Download Link.
Another attempt applies the current filter, permissions, and size limits.
A link from an earlier successful export remains valid until its original expiration.

## Constraints and evaluation

Use existing reservation filters without adding filters or changing reservation data.
Scheduled exports, email delivery, and exports across Workspaces are outside scope.
Engineering chooses storage and transport.
The success measure is a venue manager exporting 500 filtered reservations and opening the CSV without assistance in a usability session.

## OQ-01

Must export attempts be recorded in an audit log?
The compliance owner must confirm whether a contractual retention requirement applies.
This decision does not block export delivery.
