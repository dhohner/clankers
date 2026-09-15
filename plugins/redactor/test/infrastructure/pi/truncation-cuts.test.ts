import { truncateLine } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { cutPositionsIn, reportsTruncation } from "../../../src/infrastructure/pi/truncation-cuts.ts";

// Derive the marker from Pi 0.85.1 and verify its 500 character cut before using it.
const HOST_MAX_LINE = 500;
const CUT_LINE = truncateLine("a".repeat(HOST_MAX_LINE + 100)).text;

describe("truncation cuts", () => {
  it("reports the position where the host cut a long line", () => {
    expect(CUT_LINE.slice(0, HOST_MAX_LINE)).toBe("a".repeat(HOST_MAX_LINE));
    expect(cutPositionsIn(CUT_LINE, false)).toEqual([HOST_MAX_LINE]);
  });

  it("reports every cut line in one text", () => {
    expect(cutPositionsIn(`${CUT_LINE}\n${CUT_LINE}`, false)).toEqual([
      HOST_MAX_LINE,
      CUT_LINE.length + 1 + HOST_MAX_LINE,
    ]);
  });

  it("reports no cut for text the host left whole", () => {
    expect(cutPositionsIn("short line", false)).toEqual([]);
  });

  it("reports the position before a trailing notice when the result was truncated", () => {
    expect(cutPositionsIn("kept line\n\n[50.0KB limit reached]", true)).toEqual([9]);
  });

  it("reports the end of the text when a truncated result carries no notice", () => {
    expect(cutPositionsIn("kept line", true)).toEqual([9]);
  });

  it("reads the truncation flag out of tool details", () => {
    expect(reportsTruncation({ truncation: { truncated: true } })).toBe(true);
    expect(reportsTruncation({ truncation: { truncated: false } })).toBe(false);
    expect(reportsTruncation({ truncation: undefined })).toBe(false);
    expect(reportsTruncation({})).toBe(false);
    expect(reportsTruncation(undefined)).toBe(false);
  });
});
