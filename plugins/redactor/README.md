# Redactor

Pi extension for macOS that replaces registered credential text with safe references before the text reaches a model request, a session file, or a published tool output.

This capability registers no real credentials and executes none.
It provides the protection paths and an extension-private registration boundary that later credential sources can use.

## What is protected

The extension controls these host paths on macOS:

- Submitted prompt text, including follow-up and steering input, through the `input` event before expansion, queueing, and persistence.
- Finalized user, assistant, and tool result messages through `message_end`, before the host persists them.
- Tool results and their metadata through `tool_result`.
- The message list of every model call through `context`, and the serialized provider payload through `before_provider_request`.
- Streamed `bash` output through a wrapped `bash` tool that redacts every byte before the host accumulates it, so streamed updates, truncation, and the temporary full-output file only ever hold redacted text.
  Every streamed update and the final result are also protected as complete objects, metadata included, before the host sees them.
- File text through a wrapped `read` tool that redacts the whole file before the tool selects an offset and limit and truncates, so a value split across a line or byte boundary is replaced whole.
  Redaction keeps the line count of the file, so a value that spans lines leaves every later line at its original number and a continuation offset still names the line it named before.
- The output of built-in tools the extension does not wrap, at the positions where those tools cut their own text.
  A tool that cuts a long line or a long result can leave the start of a registered value behind, which a pass over complete values does not reach; that fragment is replaced with the value's reference.
- Compaction summaries and branch summaries, which the extension generates through the host's own summarizers and redacts before they become session entries.
  The entries handed to the summarizer are redacted before the request, because that request path runs neither `context` nor `before_provider_request`, and the summarizer's provider payload is redacted again through its payload hook.
  A session entry persisted before its value was registered is therefore still redacted when a summary covers it.

Registered values are replaced with a reference such as `[redacted:api-token]`.
Ids are limited to 64 characters from `A-Z`, `a-z`, `0-9`, `_`, `.`, `:`, and `-`.
A reference carries the credential id unless a registered value would appear inside it, in which case the extension moves that credential to a numbered or opaque reference id such as `[redacted:api-token.2]` or `[redacted:redacted-1]`.
No generated reference contains a registered value, so replacing one credential never writes another credential's value into the output and a reference keeps its identity through later passes.
A complete reference that carries a current reference id is copied whole on every later pass, even when an id, the word `redacted`, or a fragment of the reference syntax is itself a registered value, so repeated passes over input, context, and provider payloads leave references intact.
Reference-shaped text under any other id is ordinary text, so a registered value wrapped in the reference syntax by a command or a model is still replaced.
A registered value that is itself shaped like a reference, or that starts like one and extends beyond it, is still a credential and is replaced.
Registering a new value under an id keeps every earlier value of that id under redaction, because text that already carries the old value does not go away.
Text that contains no registered value is left exactly as it was.
Within structured data such as tool arguments, tool result details, and provider payloads, property names are redacted like values.
Message fields the host routes or pairs on stay as they are: the role, the stop reason, content block types, tool call ids and names, tool result pairing fields, and the custom message type.
Every other message field, including provider and model names, is data and is redacted.
Tool result content blocks keep their type; their text, image data, and details are data.
Details that are not plain objects are redacted in the form JSON gives them, because the session file and provider payloads carry that form: bytes are decoded as UTF-8 text and re-encoded only when a value was replaced, an object with `toJSON` is replaced by the redacted result of that method, and any other object with enumerable own properties is copied as those properties, so a value carried by a `Buffer` or a class instance is still replaced while a handle such as a signal stays as it is.
Provider payloads are redacted through the request shape of the current model's API family, as pi-ai 0.85.1 builds it: `anthropic-messages`, `openai-completions`, `openai-responses` with its Azure and Codex variants, `bedrock-converse-stream`, `google-generative-ai`, `google-vertex`, `mistral-conversations`, and `pi-messages`.
Roles, block and item types, call ids, tool names, the model id, enum-like settings, and the property names and JSON Schema property names of advertised tool definitions stay as they are only where the provider reads them.
Message text, tool inputs, tool outputs, details, descriptions, and every field the shape does not name are data, property names included, so a `role` or `type` inside a tool input is redacted like any other text.
An API family without a shape, or a request without a current model, is redacted as data throughout, roles included; a registered value equal to a protocol word then changes the request rather than being preserved.
Matches split across streamed chunks are still replaced; a longer registered value wins over a shorter one, and repeated or overlapping values are all replaced.
A value registered while a `bash` command is still streaming is redacted from that moment on, including text the stream was still holding back.
Text already published before the registration is not recalled, so a value whose bytes were already streaming at the moment of registration can remain in full in published updates and the temporary full-output file.

## What is not protected

Read this section before relying on the extension.

- Normal editor history and the live assistant display are not protected.
  Text you type stays in the editor history, and the assistant's streaming display shows model output before the finalized message is redacted.
- Use private entry instead of normal chat when that entry capability is available.
- Protection covers registered text values only.
  It does not detect unknown secrets, images, deliberate encoding such as base64 or split strings, or deliberate extraction by the model or by a command.
- User-entered `!` and `!!` commands are outside the controlled paths.
- Third-party extensions are outside the controlled paths.
  Their own session entries and notifications may contain raw text; the model request paths still redact what the extension can see.
- The extension makes no claim about program files, process arguments, or remote logs, and it is not a sandbox.
  A command can still read a credential from disk or the environment and send it anywhere.
- Windows and Linux are not supported.
  On those platforms the extension loads, explains that it supports macOS only, and activates no protection path, so that no protection is implied.

## Failure behavior

- If no generated reference can exclude a value, such as a value contained in the fixed reference syntax, the registration is refused and the registry is left unchanged.
  The error names the id and never the value, so nothing is protected by a reference that would disclose it.
- If redaction of submitted text fails, the prompt is not sent or saved and a sanitized notice is shown.
- If redaction of a finalized message or tool result fails, the message is rebuilt from fixed fields instead of being persisted raw.
  Only the role, the stop reason, tool call ids and names, tool result pairing fields, the custom message type, and numeric or boolean fields are kept; provider, model, and every other text field are replaced or dropped.
- If redaction of two property names in one object produces the same name, the structure cannot stay valid without losing data, so the operation fails and the withheld behavior above applies.
- If redaction fails before a `bash` command starts, or the temporary directory for full-output files is missing or not writable, the command does not run.
  The full-output file path is fixed before the command starts; if that path contains a registered value, the command does not run either, because a redacted path would be useless to the model and a raw one would disclose the value.
  If a value registered while the command runs appears in that path, the process is stopped and the remaining output is withheld instead of publishing the path.
- If redaction of a file fails, the `read` tool rejects with a fixed message and discloses nothing of the file.
  If redaction fails while output is streaming, or if the full-output file cannot be opened, written, or flushed, the process is stopped, the remaining output is withheld, a sanitized error is returned, and the command is not rerun.
  The wrapped tool owns its output store and full-output file stream, so a file stream error is handled by the extension instead of surfacing as an unhandled stream error in the host.
- If a `bash` command is cancelled or times out, text still held back as a possible start of a registered value is dropped rather than flushed.
- If redaction of the provider payload fails, the run is aborted and an empty payload is substituted.
  A cycle in the payload or two property names that redact to the same name count as failures.
- If a compaction or branch summary cannot be protected, the operation is cancelled.
  That covers the entries handed to the summarizer, the summarizer's provider payload, and the generated summary; a failure before the request means no request is sent.
- If the shell settings for a `bash` command cannot be loaded, for example because another process holds the settings lock, the command does not run and a fixed error is returned, because the host would otherwise run it with the `shellPath` and `shellCommandPrefix` settings silently dropped.

Error messages that leave the extension carry fixed wording and never the text that was being redacted.

## Behavior differences from the built-in host

- The extension overrides the built-in `bash` and `read` tools.
  Interactive mode reports the overrides at startup.
  The `read` override keeps the built-in schema, description, truncation, continuation notices, and image handling; only the file text is redacted before selection.
  The `grep`, `find`, and `ls` tools are not wrapped; their output is protected after they truncate it, including the start of a value left at a cut, which is replaced with that value's reference.
  A fragment of unrelated text that happens to begin a registered value and ends exactly at such a cut is replaced too.
  The wrapped `bash` and `read` tools redact before they truncate, so their results skip that cut pass and keep unrelated text at the cut as printed.
  The wrapped tool keeps the built-in schema, description, prompt metadata, renderers, exit status, cancellation, truncation metadata, result footers, `PI_*` session variables, and the agent `bin` directory on `PATH`.
  It accumulates output in its own store and writes its own full-output file so that file errors are handled.
  The full-output file is written synchronously from the output callback on the host thread, so a process that prints faster than the file accepts is held back through its pipe instead of filling memory, and each write blocks the host until the disk accepts it.
  It resolves the `shellPath` and `shellCommandPrefix` settings on every execution from the global settings and, for a trusted project only, the project settings of the directory the command runs in, so a resumed session or a mid-session settings change takes effect on the next command.
  The built-in tool reads those settings once per session; the override reads them per command, so a settings file that cannot be loaded at that moment fails the command instead of running it without the settings.
  Binary output is decoded as UTF-8 before redaction, so invalid byte sequences in the temporary full-output file become replacement characters.
- Compaction and branch summaries run through the extension, so the host marks them as extension-provided, and they do not use the host's summarization retry policy or the current thinking level.

## Installation

Install the package directly; it is not part of the root extension list.

```bash
pi install /path/to/clankers/plugins/redactor
```

## Development

```bash
pnpm --dir plugins/redactor test
pnpm --dir plugins/redactor typecheck
pnpm --dir plugins/redactor lint
pnpm --dir plugins/redactor format:check
```

The tests use only synthetic values, a temporary HOME, a temporary Pi agent directory, a deterministic in-process model transport, and loopback addresses that are never contacted.
