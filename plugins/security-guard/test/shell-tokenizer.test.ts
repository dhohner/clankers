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

  it("links each heredoc body to the command that opened it, in operator order", () => {
    const tokens = shellTokens("cat <<'A' && >log psql <<B\nfirst\nA\nsecond $x\nB\necho done");
    const bodies = tokens
      .filter((token) => token.heredoc)
      .map(({ text, quoting, heredocOwner }) => ({
        text,
        quoting,
        heredocOwner,
      }));

    expect(bodies).toEqual([
      { text: "first\n", quoting: LITERAL.repeat(6), heredocOwner: 0 },
      { text: "second $x\n", quoting: UNQUOTED.repeat(10), heredocOwner: 4 },
    ]);
    expect(tokens[0]?.text).toBe("cat");
    expect(tokens[4]?.text).toBe(">");
    // The command after the bodies starts a new extent, so it owns no body.
    expect(tokens.at(-2)?.text).toBe("echo");
  });

  it("does not tokenize commands inside a substitution as outer commands", () => {
    expect(shellTokens("echo $(rm -rf build)").map((token) => token.text)).toEqual(["echo", "$(rm -rf build)"]);
  });
});
