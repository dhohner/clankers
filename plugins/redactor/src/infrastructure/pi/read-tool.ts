import { constants } from "node:fs";
import { access, readFile } from "node:fs/promises";
import {
  createReadToolDefinition,
  detectSupportedImageMimeTypeFromFile,
  type ExtensionAPI,
  type ReadOperations,
} from "@earendil-works/pi-coding-agent";
import type { RedactionEngine } from "../../application/redaction-engine.ts";

/**
 * Redact before selection and truncation so boundaries cannot expose part of a value.
 * Preserve line counts to keep continuation offsets stable.
 *
 * Use the host image detector and return images unchanged because text decoding would corrupt them.
 * Reject with fixed text after redaction failure so file content cannot leave.
 */
export function registerRedactingReadTool(pi: ExtensionAPI, engine: RedactionEngine, cwd: string): void {
  const operations: ReadOperations = {
    access: (path) => access(path, constants.R_OK),
    detectImageMimeType: detectSupportedImageMimeTypeFromFile,
    readFile: async (path) => {
      const buffer = await readFile(path);
      // Read the header again because caching detection by path would create shared state across concurrent reads.
      if (await detectSupportedImageMimeTypeFromFile(path)) return buffer;
      return Buffer.from(engine.redactText(buffer.toString("utf8"), { preserveLineCount: true }), "utf8");
    },
  };
  pi.registerTool(createReadToolDefinition(cwd, { operations }));
}
