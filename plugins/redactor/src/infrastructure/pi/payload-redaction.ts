import type { DeepRedactor } from "../../application/redaction-engine.ts";
import { data, redactByShape } from "../../domain/structured-redaction.ts";
import { providerShape } from "./provider-shapes.ts";

/**
 * Preserve protocol values only where the provider's API shape requires them.
 * Redact all application data, including nested tool inputs and property names.
 *
 * Treat an unknown API or missing model as data throughout.
 * This may redact protocol words, but it avoids preserving unknown fields by guesswork.
 */
export function redactPayload<T>(payload: T, api: string | undefined, redactValue: DeepRedactor): T {
  return redactByShape(payload, providerShape(api) ?? data, (value) => redactValue(value));
}
