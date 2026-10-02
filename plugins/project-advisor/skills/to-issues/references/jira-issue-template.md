# Jira issue template

Apply these structural rules to every generated Jira issue unless the user requests another format.
The panel classes, inline styles, and section order match across ticket languages.

Use the selected language's raw template, fixed labels, and Gherkin keywords.
Apply that language's register to the remaining prose.

## Structural rules

- Preserve the exact panel classes, inline styles, and section order shown in the selected template unless the user explicitly requests another format.
- Write every label, header, and Gherkin keyword in the selected ticket language, and never mix labels from both templates in one ticket.
- Keep `jePanel_info` limited to the acceptance-criteria header paragraph, then close it before all `jePanel_dashed` scenario panels.
- Render one `jePanel_dashed` panel per named acceptance scenario.
- Use the Gherkin keywords of the selected language with the displayed colors.
  - `de` uses `Angenommen`, `Wenn`, `Dann`, and optional `Und`.
  - `en` uses `Given`, `When`, `Then`, and optional `And`.
- Keep the user-story connectors uncolored and use `#ff8c00` for the persona, `#008000` for the capability, and `#2980b9` for the benefit.
- Always render `jePanel_idea` with only the notes header paragraph, close it, then render note content as a sibling `<ul>` with one `<li>` per included entry.
- Always include the *what to build* entry: `Was umgesetzt werden soll` in `de`, `What to build` in `en`.
- Include the *blocked by*, *technical notes*, *assumptions*, *dependencies*, *risks*, and *open questions* entries only when they carry real information.
- Escape German umlauts and sharp s as HTML entities in the `de` template, as spelled there.
  - The `en` template needs no entities.
- Render multiple points inside one note entry as a nested `<ul>`; a single point may be inline.
- Acceptance criteria use scenario panels rather than checkbox lists.
