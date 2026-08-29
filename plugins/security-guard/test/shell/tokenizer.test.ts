import { describe, expect, it } from "vitest";
import { DOUBLE, LITERAL, UNQUOTED, shellTokens } from "../../src/shell/tokenizer.js";

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

  it("reads a test expression as one word that resolution skips, operators inside included", () => {
    const tokens = shellTokens('[[ -f a && "$b" == ")]] " || $(c) > d ]] && echo ok');

    expect(tokens.map(({ text, sep, testExpression }) => ({ text, sep, testExpression }))).toEqual([
      { text: "[[ -f a && $b == )]]  || $(c) > d ]]", sep: false, testExpression: true },
      { text: "&&", sep: true, testExpression: undefined },
      { text: "echo", sep: false, testExpression: undefined },
      { text: "ok", sep: false, testExpression: undefined },
    ]);
    // Only the two double-quoted words carry the DOUBLE mark; the operators and the substitution are unquoted.
    const text = tokens[0]?.text ?? "";
    const doubleQuoted = [...text].map((_, i) => (tokens[0]?.quoting[i] === DOUBLE ? text[i] : " ")).join("");
    expect(doubleQuoted).toBe("           $b    )]]                ");
  });

  it.each([
    ["if [[ -f a && -f b ]]; then :; fi", ["if", "[[ -f a && -f b ]]", ";", "then", ":", ";", "fi"]],
    ["! [[ -f a && -f b ]]", ["!", "[[ -f a && -f b ]]"]],
    ["time [[ -f a && -f b ]]", ["time", "[[ -f a && -f b ]]"]],
    ["time -p [[ -f a && -f b ]]", ["time", "-p", "[[ -f a && -f b ]]"]],
    // Only one `-p` follows the reserved word; a second one is the command bash times.
    ["time -p -p [[ x && y ]]", ["time", "-p", "-p", "[[", "x", "&&", "y", "]]"]],
    // `-v` is a GNU `time` option, not the reserved word's, so bash runs `-v` as the command word.
    ["time -v [[ x && y ]]", ["time", "-v", "[[", "x", "&&", "y", "]]"]],
    ["time -p; [[ x ]]", ["time", "-p", ";", "[[ x ]]"]],
    // A redirection target is a word, and bash reads no reserved word after one.
    ["time -p >out [[ x && y ]]", ["time", "-p", ">", "out", "[[", "x", "&&", "y", "]]"]],
    [">out [[ x && y ]]", [">", "out", "[[", "x", "&&", "y", "]]"]],
    ['"if" [[ -f a ]]', ["if", "[[", "-f", "a", "]]"]],
    ["echo if [[ x && y ]]", ["echo", "if", "[[", "x", "&&", "y", "]]"]],
    ["echo ! [[ x ]]", ["echo", "!", "[[", "x", "]]"]],
    ["echo [[ x ]]", ["echo", "[[", "x", "]]"]],
    ["[[x -f a ]]", ["[[x", "-f", "a", "]]"]],
    ["[[ -f a]] && echo ok", ["[[ -f a]] && echo ok"]],
    // A `)` that closes a group starts the `]]` word, so bash ends the expression there and so does this.
    ["[[ (-f a)]] && echo ok", ["[[ (-f a)]]", "&&", "echo", "ok"]],
    ["[[ ! (-f a)]] && echo ok", ["[[ ! (-f a)]]", "&&", "echo", "ok"]],
    // A `)` that closes a substitution belongs to its word, and bash rejects the whole line.
    ["[[ -n $(c)]] && echo ok", ["[[ -n $(c)]] && echo ok"]],
    ["[[ -n $((1+1))]] && echo ok", ["[[ -n $((1+1))]] && echo ok"]],
    ["[[ -n `c`]] && echo ok", ["[[ -n `c`]] && echo ok"]],
    // A quoted `)` is data, not the end of a group.
    ['[[ -n ")" ]] && echo ok', ["[[ -n ) ]]", "&&", "echo", "ok"]],
    // `coproc` is a bash 4.0 reserved word, so on bash 3.2 it is the command word and `[[` is a plain word.
    ["coproc [[ x || y ]]", ["coproc", "[[", "x", "||", "y", "]]"]],
    ["[[ -f a ]]&&echo ok", ["[[ -f a ]]", "&&", "echo", "ok"]],
  ])("keeps `[[` a plain word away from command start and ends only at a standalone `]]` in %s", (value, texts) => {
    expect(shellTokens(value).map((token) => token.text)).toEqual(texts);
  });

  it("keeps arithmetic and process substitution inside their words", () => {
    const tokens = shellTokens("echo $(( (1 + 2) * $(c) ))x <(git show a) 2>(cat) '$((1+1))'");

    expect(tokens.map(({ text, sep, redirect }) => ({ text, sep, redirect }))).toEqual([
      { text: "echo", sep: false, redirect: false },
      { text: "$(( (1 + 2) * $(c) ))x", sep: false, redirect: false },
      { text: "<(git show a)", sep: false, redirect: false },
      { text: "2>(cat)", sep: false, redirect: false },
      { text: "$((1+1))", sep: false, redirect: false },
    ]);
    expect(tokens[4]?.quoting).toBe(LITERAL.repeat(8));
  });

  it("keeps a double-quoted process substitution literal and splits the redirection outside quotes", () => {
    expect(shellTokens('echo "<(x)" >(y) <file').map(({ text, redirect }) => ({ text, redirect }))).toEqual([
      { text: "echo", redirect: false },
      { text: "<(x)", redirect: false },
      { text: ">(y)", redirect: false },
      { text: "<", redirect: true },
      { text: "file", redirect: false },
    ]);
  });
});
