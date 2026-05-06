import { readFileSync } from "node:fs";

const INSTRUCTIONS_PATH = new URL(
  "./prompts/caveman-instructions.md",
  import.meta.url,
);

export function loadInstructions(): string {
  return readFileSync(INSTRUCTIONS_PATH, "utf8").trim();
}

export interface BeforeAgentStartEvent {
  systemPrompt: string;
}

export interface InjectionResult {
  systemPrompt: string;
}

export function handleBeforeAgentStart(
  event: BeforeAgentStartEvent,
  enabled: boolean,
  instructions: string,
): InjectionResult | undefined {
  if (!enabled) return undefined;
  return { systemPrompt: `${event.systemPrompt}\n\n${instructions}` };
}
