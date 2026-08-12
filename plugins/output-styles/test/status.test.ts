import { describe, expect, it } from "vitest";
import { formatStatusText, STATUS_LABEL, type StatusTheme } from "../lib/status.js";
import { DEFAULT_STYLE, type StyleDefinition } from "../lib/types.js";

// Tags the text with its color role instead of emitting ANSI codes, so an assertion states which
// part of the entry carries which color.
const theme: StatusTheme = { fg: (color, text) => `[${color}:${text}]` };

function style(name: string): StyleDefinition {
  return { name, description: "Short answers.", mode: "append", instructions: "Answer briefly.", source: "user" };
}

describe("formatStatusText", () => {
  it("names the active style behind a dim label", () => {
    expect(formatStatusText(style("terse"), theme)).toBe(`[dim:${STATUS_LABEL}] [accent:terse]`);
  });

  it("renders nothing for the built-in default style", () => {
    expect(formatStatusText(DEFAULT_STYLE, theme)).toBeUndefined();
  });

  it("stays on one line, the shared status line the footer truncates", () => {
    expect(formatStatusText(style("explanatory"), theme)).not.toMatch(/[\r\n\t]/);
  });
});
