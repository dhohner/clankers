# Jira issue structure

Use the selected language and profile's raw template unless the user requests another format.
Preserve its panel classes, inline styles, section order, fixed labels, and Gherkin keywords.
Templates and examples are linked from `SKILL.md`.

## Shared structure

1. Open with the capability and its purpose.
2. Render one `jePanel_dashed` panel per named acceptance scenario.
3. Finish with one notes list, using bold entry labels and nested lists for multiple points.

Keep `jePanel_info` limited to the acceptance header and close it before the scenario panels.
Keep `jePanel_idea` limited to the notes header and close it before the sibling `<ul>`.
Use the template's colored Gherkin keywords and navy scenario headings.
Keep panel styling consistent across ticket languages.
In German tickets, escape umlauts and sharp s as HTML entities as shown in the template.
Omit empty notes and use real list elements rather than typed checkboxes.

## Profile differences

- Product: open with the template's user story; always include `Was umgesetzt werden soll` or `What to build` in notes.
- Infrastructure: open with a short outcome paragraph naming the capability and consumer or operator; always include scope and verification and evidence in notes, using the selected language's labels.

Color the opening's persona or consumer `#ff8c00`, capability `#008000`, and stated benefit, purpose, or scope `#2980b9`.
Keep product story connectors uncolored and use only benefits or purposes supported by the source.
For infrastructure, use the template's first scenario keyword palette for every scenario.

Keep acceptance and verification prose in one column so it remains readable without custom styling.
Use tables only for a source requirement for a matrix or comparison that benefits from columns.
Keep long criteria, procedures, and evidence narratives out of table cells.
