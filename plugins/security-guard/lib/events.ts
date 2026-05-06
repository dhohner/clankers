import type { ToolCallEvent } from "./types.ts";

export function normalizeToolName(toolName: string | undefined): string {
  return (toolName ?? "").toLowerCase();
}

export function getToolInput(event: ToolCallEvent): Record<string, unknown> {
  return event.input ?? event.args ?? {};
}

export function getString(input: Record<string, unknown>, keys: readonly string[]): string {
  for (const key of keys) {
    const value = input[key];
    if (typeof value === "string") return value;
  }

  return "";
}
