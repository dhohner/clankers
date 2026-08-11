import type { StyleDefinition } from "./types.ts";

/**
 * Builds the system prompt for one agent turn.
 *
 * The style text goes last so it stays the final instruction, after the project instruction files and
 * context files Pi already loaded. `replace` mode is not implemented yet: a style declaring it is applied
 * as `append`, which is a documented temporary limitation of this plugin.
 */
export function applyStyle(systemPrompt: string, style: StyleDefinition | undefined): string {
  const instructions = style?.instructions.trim() ?? "";
  if (instructions === "") return systemPrompt;
  return `${systemPrompt}\n\n${instructions}`;
}
