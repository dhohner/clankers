# Documentation Plugin

Packages a writer skill for planning, rewriting, and expanding project documentation in Markdown.

## What It Does

This plugin currently bundles one skill:

- `writer` turns repository code, config, and existing docs into clearer README files, how-to guides, reference pages, migration notes, and architecture docs.

The skill is optimized for practical software documentation work:

- start from the repository instead of generic advice
- use Diataxis as a light organizing tool
- produce concise Markdown that is ready to save
- aim for a calm framework-doc tone

## Usage

```text
"Use the writer skill to rewrite this README so the install steps are easier to scan."
"Draft a migration guide for this breaking config change from the repo."
"Turn these source files into a short API reference page."
```

Example prompts:

- "Improve the terminology and structure of this guide without changing the technical meaning."
- "Write a README for this plugin based on the code and package metadata."
- "Document this feature as a how-to guide with one minimal working example."

## Learn More

Bundled skills:

- `writer`

Skill definition:

- [writer](./skills/writer/SKILL.md)

## Authors

[dhohner](https://github.com/dhohner)
