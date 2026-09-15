import { describe, expect, it } from "vitest";
import {
  formatWarning,
  HOST_HORIZONTAL_PADDING,
  UNSUPPORTED_PLATFORM_MESSAGE,
  WARNING_SENTENCES,
  wrapText,
} from "../../src/domain/warning.ts";

const text = WARNING_SENTENCES.join(" ");

describe("load-time warning", () => {
  it.each([
    ["normal editor history", /editor history/i],
    ["live assistant display", /live assistant display/i],
    ["private entry recommendation", /private entry/i],
    ["registered text values only", /registered text values/i],
    ["unknown secrets", /unknown secrets/i],
    ["images", /images/i],
    ["deliberate encoding", /deliberate encoding/i],
    ["deliberate extraction", /deliberate extraction/i],
    ["user-entered ! commands", /`!` commands/],
    ["third-party extensions", /third-party extensions/i],
    ["program files", /program files/i],
    ["process arguments", /process arguments/i],
    ["remote logs", /remote logs/i],
    ["macOS", /macOS/],
  ])("names %s", (_label, pattern) => {
    expect(text).toMatch(pattern);
  });

  it("denies rather than claims a sandbox", () => {
    const mentions = text.match(/sandbox/gi) ?? [];

    expect(mentions).toHaveLength(1);
    expect(text).toContain("not a sandbox");
  });

  it("explains an unsupported platform in terms of macOS support", () => {
    expect(UNSUPPORTED_PLATFORM_MESSAGE).toMatch(/supports macOS/);
    expect(UNSUPPORTED_PLATFORM_MESSAGE).toMatch(/not active/i);
  });

  it.each([24, 40, 60, 80])("wraps every line within %d columns without splitting words", (width) => {
    const lines = formatWarning(width).split("\n");

    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(width);
      expect(line).not.toMatch(/^\s|\s$/);
    }
    expect(lines.join(" ").replaceAll(/\s+/g, " ")).toBe(text.replaceAll(/\s+/g, " "));
  });

  it("leaves room for the host's own padding so the host does not wrap a line again", () => {
    for (const width of [40, 60, 80]) {
      const lines = formatWarning(width).split("\n");
      expect(lines.every((line) => line.length <= width - HOST_HORIZONTAL_PADDING)).toBe(true);
    }
  });

  it("keeps a word longer than the width on its own line instead of dropping it", () => {
    const lines = wrapText("a supercalifragilistic word", 10);

    expect(lines).toEqual(["a", "supercalifragilistic", "word"]);
  });

  it("uses a readable default width when the terminal width is unknown", () => {
    const lines = formatWarning(undefined).split("\n");

    expect(lines.every((line) => line.length <= 80)).toBe(true);
  });
});
