import { describe, expect, it } from "vitest";
import { serializeStyleFile, styleNameProblem } from "../lib/create-style.js";
import { parseStyleFile } from "../lib/style-file.js";

describe("styleNameProblem", () => {
  it.each(["brief", "A-1_b", "STE100", "a"])("accepts %j", (name) => {
    expect(styleNameProblem(name)).toBeUndefined();
  });

  it.each([
    ["", "the name is empty"],
    ["   ", "the name is empty"],
    ["\t", "the name is empty"],
    ["default", 'the name "default" is reserved'],
    ["new", 'the name "new" is reserved'],
    ["bad name", "the name may only contain letters, digits, dash, and underscore"],
    [" brief", "the name may only contain letters, digits, dash, and underscore"],
    ["../escape", "the name may only contain letters, digits, dash, and underscore"],
    ["a/b", "the name may only contain letters, digits, dash, and underscore"],
    ["ä", "the name may only contain letters, digits, dash, and underscore"],
  ])("refuses %j", (name, reason) => {
    expect(styleNameProblem(name)).toBe(reason);
  });
});

describe("serializeStyleFile", () => {
  function roundTrip(description: string, instructions: string): void {
    const path = "/styles/brief.md";
    const content = serializeStyleFile(description, instructions);
    expect(parseStyleFile(path, content, "user")).toEqual({
      ok: true,
      style: { name: "brief", description, mode: "append", instructions, source: "user", path },
    });
  }

  it("round-trips a plain description and a multi-line body", () => {
    roundTrip("Short answers.", "Answer briefly.\nSkip preamble.");
  });

  it.each([
    ["a YAML boolean word", "mode: no"],
    ["a colon-space sequence with quotes", 'He said: "quote me: now"'],
    ["single quotes", "it's o'clock"],
    ["a leading document marker", "--- not a delimiter"],
    ["only the document marker", "---"],
    ["a comment character", "# not a comment"],
    ["a bracket opener", "[not, a, list]"],
    ["an ampersand anchor form", "&anchor *alias"],
    [
      "a long folded line",
      "A description well past the default eighty column fold width of the YAML serializer so folding applies.",
    ],
    ["an embedded newline", "line one\nline two"],
  ])("round-trips a description with %s", (_case, description) => {
    roundTrip(description, "Body text.");
  });

  it("round-trips a body containing a column-zero delimiter line", () => {
    roundTrip("Short answers.", "Above the line.\n---\nBelow the line.");
  });
});
