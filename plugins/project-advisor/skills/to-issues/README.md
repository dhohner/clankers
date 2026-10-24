# To issues

Turn PRDs, feature briefs, technical requirements, and Gherkin scenarios into Jira work items that experienced engineers can verify independently.
Product tickets cover thin vertical slices; infrastructure tickets cover usable platform capabilities and prerequisite contracts.
The skill writes one Markdown file per slice to `action-items/jira-issues/` by default, using HTML compatible with Jira.

## Usage

```text
"Convert the PRD into Jira issues"
"Split the accepted prd.yaml from the to-prd bundle into Jira-ready slices"
"Break this PRD into Jira issues in English"
```

## Options

You can supply mode, language, and profile independently and in any order.

| Argument | Values | When omitted |
| --- | --- | --- |
| Source mode | `default`, `brief` | Inferred from the source |
| Ticket language | `de`, `en` | `de` |
| Ticket profile | `product`, `infrastructure` | Inferred from the outcome |

`default` accepts a full PRD or an accepted `to-prd` bundle and includes breakdown approval.
`brief` accepts unpackaged requirements or scenarios and asks only for clarification needed to define the slices.

## Workflow and references

[SKILL.md](SKILL.md) defines the workflow, argument selection, and completion checks.
The detailed rules are in these references:

- Intake: [PRDs and accepted bundles](references/intake-default.md), [briefs and scenarios](references/intake-brief.md).
- Ticket design and writing: [slice design](references/slice-design.md), [ticket content and prose](references/ticket-content.md), [infrastructure](references/infrastructure.md).
- Language: [German terminology and wording](references/language-de.md), [English terminology and wording](references/language-en.md).
- Formatting: [Jira structure](references/jira-format.md).

## Templates and examples

| Profile | German template | English template | German example | English example |
| --- | --- | --- | --- | --- |
| Product | [Template](templates/product-de.md) | [Template](templates/product-en.md) | [Example](examples/product-de.md) | [Example](examples/product-en.md) |
| Infrastructure | [Template](templates/infrastructure-de.md) | [Template](templates/infrastructure-en.md) | [Azure pipeline](examples/infrastructure-de.md) | [Azure pipeline](examples/infrastructure-en.md) |

## Author

Daniel Hohner
