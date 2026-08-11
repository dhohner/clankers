import { describe, expect, it } from "vitest";
import { applyStyle } from "../lib/prompt.js";
import { DEFAULT_STYLE, type StyleDefinition } from "../lib/types.js";

const CHAINED_PROMPT = "Base prompt.\n\nAdded by an earlier extension.";

function style(overrides: Partial<StyleDefinition> = {}): StyleDefinition {
  return {
    name: "terse",
    description: "Answer briefly.",
    mode: "append",
    instructions: "Be brief.",
    source: "user",
    ...overrides,
  };
}

describe("applyStyle", () => {
  it("appends the instruction text to the end of the chained prompt", () => {
    expect(applyStyle(CHAINED_PROMPT, style())).toBe(`${CHAINED_PROMPT}\n\nBe brief.`);
  });

  it("appends a replace-mode style as well, the documented temporary limitation", () => {
    expect(applyStyle(CHAINED_PROMPT, style({ mode: "replace" }))).toBe(`${CHAINED_PROMPT}\n\nBe brief.`);
  });

  it("returns the chained prompt unchanged for the default style", () => {
    expect(applyStyle(CHAINED_PROMPT, DEFAULT_STYLE)).toBe(CHAINED_PROMPT);
  });

  it("returns the chained prompt unchanged when no style is active", () => {
    expect(applyStyle(CHAINED_PROMPT, undefined)).toBe(CHAINED_PROMPT);
  });
});
