---
# A style file is a Markdown file with YAML frontmatter.
# Copy this file into a style directory and edit it:
#   user:    <agent dir>/output-styles/    normally ~/.pi/agent/output-styles/
#   project: <cwd>/.pi/output-styles/      read only in a trusted project
# The style appears in the next session under /output-style and --output-style.

# `description` is required and must be non-empty.
# The selector shows it next to the style name.
description: Answers in as few words as the question allows.

# `name` is optional and defaults to the filename without ".md",
# so this file resolves to "terse" with or without this field.
name: terse

# `mode` is optional and allows "append" and "replace"; the default is "append".
# "append" adds the body below Pi's system prompt; "replace" substitutes
# Pi's response guidance with the body. Read the README before using "replace".
mode: append
---

Answer in one or two sentences.
Skip preamble, restatement of the question, and closing offers of further help.
