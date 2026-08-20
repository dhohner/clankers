# Brief: reviewer notes in the PRD bundle

A reviewer has no place to write a remark in `action-items/PRD-<slug>/index.html`.
The reviewer copies a section title into chat, where the remark loses its anchor.

I want the bundle to carry reviewer notes, so a remark stays beside the section it belongs to.

Decisions I have already made:

- A note belongs to one rendered section of the bundle.
- A note stays on the reviewer's own machine; the bundle publishes no note to a server.
- The bundle stays a single local review artifact and keeps working without a network.

Things I have not decided:

- How a note survives a regenerated bundle.
- Whether a reviewer can mark a note as resolved.

Things I do not care about:

- Note storage format and code shape.

One thing nobody here can answer yet:

- Whether the unchosen internal review portal will host bundles next year.

The bundle ships local JavaScript and CSS assets.
Inspect their current behavior before making assumptions.
