import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { RedactionFailure, type RedactionEngine } from "../../application/redaction-engine.ts";

const INPUT_FAILURE_NOTICE = "Redactor: redaction failed for the submitted text, so it was not sent or saved.";

/**
 * Pi 0.85.1 logs thrown input errors and submits the original text.
 * Return `handled` after failure to stop submission.
 */
export function registerInputProtection(pi: ExtensionAPI, engine: RedactionEngine): void {
  pi.on("input", (event, ctx) => {
    try {
      const text = engine.redactText(event.text);
      return text === event.text ? { action: "continue" } : { action: "transform", text };
    } catch (error) {
      const detail = error instanceof RedactionFailure ? ` (${error.message})` : "";
      ctx.ui.notify(`${INPUT_FAILURE_NOTICE}${detail}`, "error");
      return { action: "handled" };
    }
  });
}
