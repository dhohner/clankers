import { referenceFor } from "../domain/text-redaction.ts";
import type { Binding } from "./credential-bindings.ts";

/** Later capabilities set these when their execution or entry path is installed and operational. */
export interface GuidanceCapabilities {
  approvedExecution: boolean;
  privateEntry: boolean;
}

/**
 * Explain references, approved use, and missing credentials without a value.
 * Name an uninstalled capability as not installed, so the model never treats it as operational.
 */
export function credentialGuidance(
  bindings: readonly Binding[],
  capabilities: GuidanceCapabilities,
): string | undefined {
  if (bindings.length === 0) return undefined;
  const lines = [
    "## Credential references",
    "",
    "The user selected these credentials for this session.",
    "Values are never shown to you.",
    "Each active credential has a reference that stays the same for this session, identifies it, and never encodes its value.",
    "",
    ...bindings.map(describeBinding),
    "",
    "How credential use works: put the reference in a bash command where the value belongs, for example inside an Authorization header.",
    "Before that command runs, the user approves it while seeing the reference and the service label, never the value.",
    "Only approved bash execution receives the value.",
    capabilities.approvedExecution
      ? "Approved execution is installed in this session."
      : "In this session no approved execution capability is installed: a reference in a bash command stays literal text and is not resolved.",
    "Ordinary bash commands do not inherit the selected variables.",
    "",
    "A missing or unavailable credential requires the user to provide it privately, outside the chat.",
    "Do not search the environment, shell startup files, configuration files, or the file system for credential values, and do not ask the user to paste a value into the chat.",
    capabilities.privateEntry
      ? "Private entry is installed in this session."
      : "Private entry is not installed in this session: ask the user to select the variable with `/redactor add NAME label` and to start Pi from a shell that exports it.",
  ];
  return lines.join("\n");
}

/** An unavailable entry names only its label: a mistyped name could be a pasted value, and the user knows the variable. */
function describeBinding(binding: Binding): string {
  if (binding.state === "active" && binding.reference !== undefined) {
    return `- ${referenceFor(binding.reference)}: ${binding.label} (environment variable ${binding.name}), active`;
  }
  if (binding.state === "refused") return `- unavailable: ${binding.label}, its value cannot be protected`;
  return `- unavailable: ${binding.label}, no value in this Pi process`;
}
