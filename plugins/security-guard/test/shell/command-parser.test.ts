import { describe, expect, it } from "vitest";
import { assignedName, commandName, simpleCommandAt, simpleCommandExtents } from "../../src/shell/command-parser.js";
import { shellTokens } from "../../src/shell/tokenizer.js";
import type { ShellToken } from "../../src/shell/types.js";

describe("command parser", () => {
  it("resolves assignments and wrappers to the command that runs", () => {
    const command = simpleCommandAt(shellTokens("sudo X=1 env -i rm -rf build"), 0);

    expect(command.kind).toBe("resolved");
    if (command.kind !== "resolved") return;
    expect(command.name).toBe("rm");
    expect(command.argTexts).toEqual(["-rf", "build"]);
    expect(command.commandWords.map((word) => word.text)).toEqual(["sudo", "env", "rm"]);
  });

  it.each([
    ["arr[0]=1 rm -rf build", "arr"],
    ["arr[0]+=1 rm -rf build", "arr"],
    ["arr[a[0]]=1 rm -rf build", "arr"],
    // Bash removes the quotes before it evaluates the subscript, so a quoted one still assigns.
    ['arr["a"]=1 rm -rf build', "arr"],
    ["arr['0']=1 rm -rf build", "arr"],
    ["x+=1 rm -rf build", "x"],
    ["PATH[0]=/evil rm -rf build", "PATH"],
  ])("reads %s past its assignment prefix to the command that runs", (text, assigned) => {
    const tokens = shellTokens(text);
    const command = simpleCommandAt(tokens, 0);

    expect(command.kind).toBe("resolved");
    if (command.kind !== "resolved") return;
    expect(command.name).toBe("rm");
    expect(command.argTexts).toEqual(["-rf", "build"]);
    // The base name, subscript excluded, is what a sensitive-variable check has to compare against.
    expect(assignedName(tokens[0] as ShellToken)).toBe(assigned);
  });

  it.each([
    '"arr[0]"=1 rm -rf build',
    "arr[0=1 rm -rf build",
    "0arr[0]=1 rm -rf build",
    'x"="1 rm -rf build',
    'arr[0]"="1 rm -rf build',
  ])("reads %s as a command word, because bash does not assign from it", (text) => {
    const tokens = shellTokens(text);
    expect(assignedName(tokens[0] as ShellToken)).toBeUndefined();
    expect(simpleCommandAt(tokens, 0)).toMatchObject({ kind: "resolved", name: commandName(tokens[0]?.text ?? "") });
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
