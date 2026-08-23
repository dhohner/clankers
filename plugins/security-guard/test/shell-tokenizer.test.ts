import { describe, expect, it } from "vitest";
import { DOUBLE, LITERAL, UNQUOTED, shellTokens } from "../src/shell/tokenizer.js";

describe("shell tokenizer", () => {
  it("keeps quote state and redirections with each token", () => {
    const tokens = shellTokens('rm "build dir" escaped\\ path >log; echo done');

    expect(tokens.map(({ text, sep, redirect }) => ({ text, sep, redirect }))).toEqual([
      { text: "rm", sep: false, redirect: false },
      { text: "build dir", sep: false, redirect: false },
      { text: "escaped path", sep: false, redirect: false },
      { text: ">", sep: true, redirect: true },
      { text: "log", sep: false, redirect: false },
      { text: ";", sep: true, redirect: false },
      { text: "echo", sep: false, redirect: false },
      { text: "done", sep: false, redirect: false },
    ]);
    expect(tokens[1]?.quoting).toBe(DOUBLE.repeat("build dir".length));
    expect(tokens[2]?.quoting).toBe(`${UNQUOTED.repeat("escaped".length)}${LITERAL}${UNQUOTED.repeat("path".length)}`);
  });

  it("does not tokenize commands inside a substitution as outer commands", () => {
    expect(shellTokens("echo $(rm -rf build)").map((token) => token.text)).toEqual([
      "echo",
      "$(rm -rf build)",
    ]);
  });
});
