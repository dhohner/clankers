# Reservation export and recovery

This brief is settled except for the audit question below.
The approved breakdown has two tickets: export and download, then recovery after CSV creation fails.
Recovery requires the export and download ticket.

## Export and download

Venue managers export the current filtered reservations from Booking Desk in their current Workspace.
Viewers can read reservations but cannot start an export through either the interface or a direct request.
Exports never include reservations from another Workspace.

The CSV contains exactly `Reservation ID`, `Guest Name`, and `Start Time`, in that order.
Include reservations with and without `Highlight`.
`Highlight` adds no CSV column.
Use the existing filters and leave reservation data unchanged.

- One matching reservation produces a CSV with that reservation.
- 500 matching reservations produce a CSV with all 500.
- 501 matching reservations cause refusal and a request to narrow the filter.
- Zero matching reservations cause refusal and a message that no reservations match.

A completed export provides a Download Link.
Only the creator can use it while in the original Workspace.
Another user and a creator who switches Workspace are denied access.
The Download Link expires exactly 15 minutes after export completion.
At 14 minutes and 59 seconds the creator can download; at 15 minutes access is refused.

The expiration message is exactly "Export again – this link has expired" in the English interface.
It is exactly "Erneut exportieren – dieser Link ist abgelaufen" in the German interface.
After expiration, a venue manager can start a new export.
It uses the current filter and reservations available when it starts.

## Recovery

If CSV creation fails, show a failure message and offer another attempt.
The failed export provides no Download Link.
A retry creates a new export under the export and download contract above, including columns, permissions, limits, and link expiration.
Apply the current filter and current permissions at the start of the retry.
Check changed filters, permissions lost since the failed attempt, and zero or 501 current matches.
An earlier successful export remains downloadable until its original expiration, even if a later export fails.

## Validation

The product success measure is a venue manager exporting 500 filtered reservations and opening the CSV without assistance in a usability session.
This goal evaluates the product and does not govern release.

Release requires that a venue manager can start the offered retry using only the keyboard.
Validate this in a manual keyboard session before accepting the recovery ticket.

## Constraints and open question

Scheduled exports, email delivery, and exports across Workspaces are outside scope.
Engineering chooses storage and transport.

## Open question `OQ-01`

Must export attempts be recorded in an audit log?
Have the compliance owner confirm whether a contractual retention requirement applies.
This decision does not block export delivery.
