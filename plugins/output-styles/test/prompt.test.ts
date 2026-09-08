import { describe, expect, it } from "vitest";
import { applyStyle } from "../lib/prompt.js";
import { DEFAULT_STYLE, type StyleDefinition } from "../lib/types.js";

const PI_GUIDANCE = "You are an expert coding assistant operating inside pi.\n\nBe concise in your responses.";
const CHAINED_PROMPT = `${PI_GUIDANCE}\n\nAdded by an earlier extension.`;

function style(instructions = "Be brief."): StyleDefinition {
  return {
    name: "terse",
    description: "Answer briefly.",
    instructions,
    source: "user",
  };
}

describe("applyStyle", () => {
  it.each([
    CHAINED_PROMPT,
    "Custom SYSTEM.md instructions.\n\nEarlier extension instructions.",
    "Use PowerShell for file operations.\n\n<available_skills>Keep these skills.</available_skills>\n",
    "",
  ])("preserves the complete chained prompt %j", (prompt) => {
    expect(applyStyle(prompt, style())).toBe(`${prompt}\n\nBe brief.`);
  });

  it("returns the chained prompt unchanged for the default style", () => {
    expect(applyStyle(CHAINED_PROMPT, DEFAULT_STYLE)).toBe(CHAINED_PROMPT);
  });

  it("returns the chained prompt unchanged when no style is active", () => {
    expect(applyStyle(CHAINED_PROMPT, undefined)).toBe(CHAINED_PROMPT);
  });

  it("returns the chained prompt unchanged for whitespace-only instructions", () => {
    expect(applyStyle(CHAINED_PROMPT, style(" \n\t"))).toBe(CHAINED_PROMPT);
  });

  it("trims only the style instructions", () => {
    expect(applyStyle(CHAINED_PROMPT, style(" \nBe brief.\n "))).toBe(`${CHAINED_PROMPT}\n\nBe brief.`);
  });
});
