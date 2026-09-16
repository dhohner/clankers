import { describe, expect, it } from "vitest";
import {
  parseSelectionConfig,
  SelectionConfigError,
  serializeSelectionConfig,
  validateLabel,
  validateVariableName,
} from "../../src/domain/credential-selection.ts";

describe("credential selection configuration", () => {
  it("parses names and labels and keeps nothing else", () => {
    const config = parseSelectionConfig(
      JSON.stringify({ version: 1, selections: [{ name: "GITHUB_TOKEN", label: "GitHub", extra: "dropped" }] }),
    );

    expect(config).toEqual({ version: 1, selections: [{ name: "GITHUB_TOKEN", label: "GitHub" }] });
  });

  it("treats an empty document as an empty selection", () => {
    expect(parseSelectionConfig("")).toEqual({ version: 1, selections: [] });
    expect(parseSelectionConfig("   \n")).toEqual({ version: 1, selections: [] });
  });

  it.each([
    ["invalid JSON", "{", "not valid JSON"],
    ["a non-object document", "[]", "must be a JSON object"],
    ["an unsupported version", JSON.stringify({ version: 2, selections: [] }), "version"],
    ["a non-array selection list", JSON.stringify({ version: 1, selections: {} }), "selections must be an array"],
    [
      "a selection without a name",
      JSON.stringify({ version: 1, selections: [{ label: "ECHO" }] }),
      "selections[0].name",
    ],
    [
      "an invalid variable name",
      JSON.stringify({ version: 1, selections: [{ name: "1BAD", label: "ECHO" }] }),
      "selections[0].name",
    ],
    [
      "an empty label",
      JSON.stringify({ version: 1, selections: [{ name: "ECHO", label: " " }] }),
      "selections[0].label",
    ],
    [
      "a duplicated name",
      JSON.stringify({
        version: 1,
        selections: [
          { name: "OK", label: "a" },
          { name: "OK", label: "b" },
        ],
      }),
      "selections[1].name is selected twice",
    ],
  ])("rejects %s with a fixed message that omits document text", (_label, text, expected) => {
    let error: unknown;
    try {
      parseSelectionConfig(text);
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(SelectionConfigError);
    expect((error as Error).message).toContain(expected);
    expect((error as Error).message).not.toContain("1BAD");
    expect((error as Error).message).not.toContain("ECHO");
  });

  it("serializes selections in a stable order with a trailing newline", () => {
    const text = serializeSelectionConfig({
      version: 1,
      selections: [
        { name: "B", label: "second" },
        { name: "A", label: "first" },
      ],
    });

    expect(text).toBe(
      `${JSON.stringify(
        {
          version: 1,
          selections: [
            { name: "B", label: "second" },
            { name: "A", label: "first" },
          ],
        },
        null,
        2,
      )}\n`,
    );
    expect(parseSelectionConfig(text).selections).toEqual([
      { name: "B", label: "second" },
      { name: "A", label: "first" },
    ]);
  });

  it.each(["GITHUB_TOKEN", "_x", "a1"])("accepts the variable name %s", (name) => {
    expect(validateVariableName(name)).toBeUndefined();
  });

  it.each(["", "1BAD", "with space", "dash-name", "a=b", "x".repeat(257)])(
    "rejects the variable name %j without echoing it",
    (name) => {
      const message = validateVariableName(name);
      expect(message).toBeDefined();
      if (name.length > 0) expect(message).not.toContain(name);
    },
  );

  it.each([
    "",
    "   ",
    "two\nlines",
    "tab\there",
    "x".repeat(81),
    "GitHub\u202Ekcab",
    "zero\u200Bwidth",
    "line\u2028sep",
  ])("rejects the label %j without echoing it", (label) => {
    const message = validateLabel(label);
    expect(message).toBeDefined();
    if (label.trim().length > 0) expect(message).not.toContain(label);
  });

  it("accepts a label with spaces and Unicode", () => {
    expect(validateLabel("Slack – Ops workspace")).toBeUndefined();
  });
});
