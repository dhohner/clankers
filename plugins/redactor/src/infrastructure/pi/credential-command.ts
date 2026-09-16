import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { Binding } from "../../application/credential-bindings.ts";
import type { CredentialSources } from "../../application/credential-sources.ts";
import { referenceFor } from "../../domain/text-redaction.ts";

export const CREDENTIAL_COMMAND = "redactor";

export type NoticeLevel = "info" | "warning" | "error";

export interface Notice {
  text: string;
  level: NoticeLevel;
}

/**
 * Selecting a name that has no value needs the user's confirmation, because a pasted credential value can
 * pass as a variable name and would otherwise be stored and shown to the model.
 * Without an interactive terminal there is no channel, so such a selection is refused.
 */
export interface CommandChannel {
  confirmUnavailable?: (name: string, label: string) => Promise<boolean>;
}

const USAGE = [
  "redactor: manage the environment variables loaded as credentials.",
  "  /redactor list",
  "  /redactor add NAME label",
  "  /redactor remove NAME",
  "Names and labels are stored; values are read from this Pi process and never stored.",
].join("\n");

const KNOWN_FAILURES = new Set(["SelectionConfigError", "SelectionWriteFailure"]);
const UNAVAILABLE_HINT = "no value in this Pi process; start Pi from a shell that exports it";
const REFUSED_HINT = "no safe reference exists for its value, so it is unusable and not redacted";
const UNAVAILABLE_TITLE = "Select a variable that has no value?";

export function registerCredentialCommand(pi: ExtensionAPI, sources: CredentialSources): void {
  pi.registerCommand(CREDENTIAL_COMMAND, {
    description: "Manage credential environment variables: list, add NAME label, remove NAME",
    handler: async (args, ctx) => {
      const notice = await runCredentialCommand(sources, args, channelFor(ctx));
      ctx.ui.notify(notice.text, notice.level);
    },
  });
}

/** RPC can show dialogs, but credential selection is confirmed only in the interactive terminal. */
function channelFor(ctx: ExtensionContext): CommandChannel {
  if (ctx.mode !== "tui") return {};
  return {
    confirmUnavailable: (name, label) =>
      ctx.ui.confirm(
        UNAVAILABLE_TITLE,
        [
          `${name} (${label}) has no value in this Pi process.`,
          "",
          "If you pasted a credential value instead of its variable name, choose No.",
          "The text would be stored in your configuration and shown to the model as a variable name.",
          "",
          "Select it anyway? It becomes available when Pi starts from a shell that exports it.",
        ].join("\n"),
        { signal: ctx.signal },
      ),
  };
}

/**
 * Feedback names selections, labels, references, and availability.
 * An argument is echoed only after validation, because a pasted value would otherwise reach the notification.
 */
export async function runCredentialCommand(
  sources: CredentialSources,
  args: string,
  channel: CommandChannel = {},
): Promise<Notice> {
  const [subcommand = "", name = "", ...rest] = args.trim().split(/\s+/).filter(Boolean);
  try {
    switch (subcommand) {
      case "":
        return { text: USAGE, level: "info" };
      case "list":
        return listNotice(sources);
      case "add":
        if (!name || rest.length === 0)
          return { text: "redactor: add needs a variable NAME and a service label", level: "error" };
        return await addNotice(sources, name, rest.join(" "), channel);
      case "remove":
        if (!name) return { text: "redactor: remove needs a variable NAME", level: "error" };
        return await removeNotice(sources, name);
      default:
        return { text: `redactor: unknown subcommand\n${USAGE}`, level: "warning" };
    }
  } catch (error) {
    return { text: describeFailure(error), level: "error" };
  }
}

function listNotice(sources: CredentialSources): Notice {
  const bindings = sources.list();
  if (bindings.length === 0) {
    return { text: "redactor: no credentials selected. Use /redactor add NAME label.", level: "info" };
  }
  const rows = bindings.map((binding) => {
    const origin = binding.origin === "project" ? " (project, until Pi exits)" : "";
    return `  ${binding.name}  ${binding.label}  ${availability(binding)}${origin}`;
  });
  return { text: ["redactor: selected credentials", ...rows].join("\n"), level: "info" };
}

async function addNotice(
  sources: CredentialSources,
  name: string,
  label: string,
  channel: CommandChannel,
): Promise<Notice> {
  sources.assertSelection(name, label);
  if (!sources.selectedNames().includes(name) && !sources.hasValue(name)) {
    if (channel.confirmUnavailable === undefined) {
      return {
        text: "redactor: that variable has no value in this Pi process; selecting it needs confirmation in the interactive terminal, so nothing was selected",
        level: "error",
      };
    }
    if (!(await channel.confirmUnavailable(name, label))) {
      return { text: "redactor: selection cancelled; nothing was stored", level: "info" };
    }
  }
  const outcome = await sources.add(name, label);
  const { binding } = outcome;
  const subject = `${binding.name} (${binding.label})`;
  switch (outcome.kind) {
    case "unchanged":
      return { text: `redactor: already selected ${subject}; ${availability(binding)}`, level: "info" };
    case "relabeled":
      return { text: `redactor: relabeled ${subject}; ${availability(binding)}`, level: "info" };
    default:
      return {
        text: `redactor: selected ${subject}; ${availability(binding)}`,
        level: noticeLevel(binding),
      };
  }
}

async function removeNotice(sources: CredentialSources, name: string): Promise<Notice> {
  const outcome = await sources.remove(name);
  if (outcome.kind === "not-selected") return { text: `redactor: ${name} is not selected`, level: "warning" };
  const retained = outcome.retainedValue ? "; its last value stays redacted until Pi exits" : "";
  return { text: `redactor: removed ${name} from the selection${retained}`, level: "info" };
}

export function noticeLevel(binding: Binding): NoticeLevel {
  return binding.state === "active" ? "info" : "warning";
}

export function availability(binding: Binding): string {
  if (binding.state === "active" && binding.reference !== undefined)
    return `${referenceFor(binding.reference)}  active`;
  if (binding.state === "refused") return `refused (${REFUSED_HINT})`;
  return `unavailable (${UNAVAILABLE_HINT})`;
}

export function describeFailure(error: unknown): string {
  if (error instanceof Error && KNOWN_FAILURES.has(error.name)) {
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? `${prefixed(error.message)} (${code})` : prefixed(error.message);
  }
  return "redactor: the credential command failed";
}

function prefixed(message: string): string {
  return message.startsWith("redactor: ") ? message : `redactor: ${message}`;
}
