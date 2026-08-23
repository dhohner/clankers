import { describe, expect, it } from "vitest";
import { simpleCommandAt, simpleCommandExtents } from "../src/shell/command-parser.js";
import { shellTokens } from "../src/shell/tokenizer.js";

describe("command parser", () => {
  it("resolves assignments and wrappers to the command that runs", () => {
    const command = simpleCommandAt(shellTokens("sudo X=1 env -i rm -rf build"), 0);

    expect(command.kind).toBe("resolved");
    if (command.kind !== "resolved") return;
    expect(command.name).toBe("rm");
    expect(command.argTexts).toEqual(["-rf", "build"]);
    expect(command.commandWords.map((word) => word.text)).toEqual(["sudo", "env", "rm"]);
  });

  it("represents an unknown wrapper option as an unresolved command", () => {
    expect(simpleCommandAt(shellTokens("nice --unknown rm -rf build"), 0)).toMatchObject({
      kind: "unresolved",
      reason: "unknown-wrapper-option",
    });
  });

  it("marks only sequential top-level commands as unconditional", () => {
    const tokens = shellTokens("a=one; b=two && c=three; (d=four)");
    expect(simpleCommandExtents(tokens).map((extent) => extent.unconditional)).toEqual([true, false, false, false]);
  });
});
