import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { credentialGuidance, type GuidanceCapabilities } from "../../application/credential-guidance.ts";
import type { CredentialSources } from "../../application/credential-sources.ts";

/**
 * Append the catalog to the system prompt of every agent run, so each model request in the run sees it.
 * A selection changed during a run reaches the model with the next prompt.
 */
export function registerCredentialGuidance(
  pi: ExtensionAPI,
  sources: CredentialSources,
  capabilities: GuidanceCapabilities,
): void {
  pi.on("before_agent_start", (event) => {
    const guidance = credentialGuidance(sources.list(), capabilities);
    if (guidance === undefined) return undefined;
    return { systemPrompt: `${event.systemPrompt}\n\n${guidance}` };
  });
}
