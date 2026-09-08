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

# `mode` is optional and accepts only "append", which is also the default.
# The body is appended to the chained system prompt without replacing existing instructions.
mode: append
---

Answer in one or two sentences.
Skip preamble, restatement of the question, and closing offers of further help.
