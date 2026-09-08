import type { StyleDefinition } from "./types.ts";

/** Appends style instructions without changing Pi's prompt or earlier extensions' contributions. */
export function applyStyle(systemPrompt: string, style: StyleDefinition | undefined): string {
  const instructions = style?.instructions.trim() ?? "";
  if (instructions === "") return systemPrompt;
  return `${systemPrompt}\n\n${instructions}`;
}
