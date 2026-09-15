import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { RedactionEngine } from "../../application/redaction-engine.ts";
import { redactPayload } from "./payload-redaction.ts";

/**
 * Redact at the last control point before the request leaves the process.
 * Read the API family from the context model because the event omits it.
 *
 * The runner keeps the original payload when a handler throws.
 * On failure, abort the run and return an empty payload so the provider cannot receive raw content.
 * The provider rejects that empty payload.
 *
 * Guard `ctx.abort()` because it throws after another run supersedes this one.
 */
export function registerProviderRequestProtection(pi: ExtensionAPI, engine: RedactionEngine): void {
  pi.on("before_provider_request", (event, ctx) => {
    try {
      return engine.redactWith((redactValue) => redactPayload(event.payload, ctx.model?.api, redactValue));
    } catch {
      try {
        ctx.abort();
      } catch {
        // Return an empty payload even when the run is already inactive.
      }
      return {};
    }
  });
}
