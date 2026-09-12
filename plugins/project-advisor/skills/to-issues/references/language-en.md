# English Ticket Language

Load this reference when the ticket language is `en`.

Write in the register of an English-speaking product team, in plain sentences carrying the vocabulary such a team says out loud in refinement.
Composing the sentence and choosing the terms inside it are separate decisions.
Collapsing them produces tickets that read like a translated or restyled source, because the pull into English reaches the names too.

## Compose sentences, do not carry them over

Compose each sentence in English from the source ledger's meaning.
Phrase it the way an English-speaking product owner would say it out loud, whatever language and register the source used.
Two kinds of source produce the same failure from opposite directions, and both need the same fix.
Rewrite the sentence from its meaning.

A German or other non-English source leaks its word order, its nominalizations, and its connectives.

- Carried over: `As a user I want to be able to manage my saved views.`
- Composed: `As a user I want to manage my saved views.`
- Carried over: `Then the export file is downloaded successfully with all applied filters.`
- Composed: `Then I get an export file that contains only the filtered entries.`
- Carried over: `Then a validation of the redirect URL is performed before the display of the consent screen.`
- Composed: `Then the authorization request is refused before the consent screen appears.`

An English source leaks its own padding, and a ticket inherits it unless the sentence is rewritten.
`Admins are able to revoke access seamlessly` is a PRD sentence rather than an acceptance boundary.
The ticket says `I revoke one app's access and the other connections keep working`.

Strip the constructions that survive that kind of copying: `be able to`, `provide the ability to`, `ensure that`, `in order to`, `leverage`, `utilize`, `facilitate`, `streamline`, and `perform a <noun> of` where a plain verb exists.
State behavior in the present indicative, because a scenario says what happens.
Write `Then I see the invoice for that order`, never `Then the invoice should be displayed` or `Then the invoice must be able to be opened`.
Name the actor when one exists, and use the passive only when the actor is irrelevant or unknown.

## Terms are names

A product, protocol, integration, or interface term is a name.
The developer searches for it in the provider's documentation, in the codebase, and on the screen they are building.
The name is whatever that screen, that documentation, and that code say.
An English ticket breaks it in two directions.

It breaks by inventing a synonym for something already named.
If the screen says `Saved Views`, the ticket says `Saved Views`.
`View Presets` and `stored filter sets` send a developer looking for a surface that exists under a different word.
The same holds for protocol vocabulary, so `Redirect URL` stays `Redirect URL` rather than becoming `callback URL` halfway through the set.

It also breaks by translating a name that the team keeps in another language.
A German term that the interface, the code, and the team's own speech all carry is the name, such as `Freigabe`, `Sachbearbeiter`, `Betriebsrat`, or `Mahnung`.
It stays German inside the English sentence, with an English article around it.

- Translated: `Then the case worker sees the pending release for the order.`
- Composed: `Then the Sachbearbeiter sees the pending Freigabe for the order.`

Translate everything that is not a name.
Ordinary domain nouns and everyday verbs are English, such as `order`, `invoice`, `deadline`, `open`, `save`, `select`, and `list`.
A German word in the source is not by itself evidence that the team says it out loud.
Settle each term by the standup test.
Which word does the team say?
Keep that answer in whichever language it comes.

Name each concept once and reuse that exact name, spelling, and capitalization in every ticket.
Spell a named surface, control, or object the way its label spells it, and keep every other noun lowercase.
That gives `the Saved Views panel`, `a saved view`, `the Redirect URL`, and `the invoice`.
`Delivery Log` here and `delivery history` there, or `Redirect URL` here and `redirect_url` there, read as two things a developer has to reconcile.
Follow the spelling convention the product and repository already use, and default to US spelling when they carry no signal.

## Fixed wording

Use the English panel headers, Gherkin keywords, and note labels exactly as `jira-issue-template.md` spells them.

Scenario steps use `Given`, `When`, `Then`, and optional `And`.
Anchor user-facing steps to the participant with natural first-person phrasing such as `I am on`, `I select`, `I open`, `I see`, and `I get`, rather than `the user` or `a customer`.
Name a predecessor by its ticket title, as in `Blocked by: Open an invoice from the order detail view`.

Replace filler with an observable fact.
`seamless`, `robust`, `comprehensive`, `reliable`, `intuitive`, `user-friendly`, `clearly`, `properly`, `successfully`, `as expected`, and `ensured` describe nobody's acceptance test.

## Rewrite test

Rewrite any title, scenario, or note that reads like a layer-by-layer task list.

- Build sequence: `Add an invoice endpoint and wire it to the order detail page.`
- Product outcome: `Customers open the correct invoice from the order detail view.`
- Internal scenario: `When performDummyHash(SECURITY_QUESTION) runs.`
- Observable scenario: `When timing normalization runs for a security question.`
- Redundant note: `Technical notes: The access check has to happen server-side while the data loads, not in the view.`
- Decision-relevant note: `Technical notes: Invoice PDFs live with the external billing provider, and an outage there still has to leave the order history readable.`

Consult `example-ticket-en.md` for a fuller comparison.

## Language gate

- Title, user story, scenario names, scenario text, and notes are composed English in the team register, and no sentence preserves the source's word order, padding, or idiom.
- No sentence contains `be able to`, `provide the ability to`, `ensure that`, `in order to`, `leverage`, `utilize`, `facilitate`, or a nominalization standing in for a plain verb.
- Scenario steps are present indicative and contain no `should`, `must`, or `will` describing the system's behavior.
- Every term passes the standup test.
  - No invented synonym replaces a name that already exists on the screen, in the provider's documentation, or in the code.
  - No name the team keeps in another language was translated.
- Each concept carries the same name, spelling, and capitalization in every ticket, and one spelling convention holds across the set.
- Scenario steps use first-person phrasing where a person acts, and name the observing system or boundary where no person does.
- No filler adjective and no internal code identifier appears in scenario text.
- Panel headers, Gherkin keywords, and note labels are the English ones from the template, with no German label such as `Hinweise` or `Offene Fragen`.

**Complete when:** every ticket satisfies every item above.
