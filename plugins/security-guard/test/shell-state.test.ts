import { describe, expect, it } from "vitest";
import { expandWord } from "../src/proof/shell-state.js";
import type { ShellState } from "../src/proof/types.js";
import { shellTokens } from "../src/shell/tokenizer.js";

function word(text: string) {
  const token = shellTokens(text)[0];
  if (!token) throw new Error(`Expected one token for ${text}`);
  return token;
}

describe("proof shell state", () => {
  it("expands a variable assigned earlier in the same call", () => {
    const state: ShellState = {
      variables: new Map([["dir", { path: "build", insideMktempDirectory: false, mktempGuarded: false }]]),
      errexit: false,
    };

    expect(expandWord(word('"$dir/out"'), state)).toEqual({
      kind: "proven",
      value: { path: "build/out", insideMktempDirectory: false, mktempGuarded: false },
    });
  });

  it("reports a dynamic variable as unprovable", () => {
    expect(expandWord(word('"$unknown/out"'), { variables: new Map(), errexit: false })).toEqual({
      kind: "unprovable",
      reason: "word expansion cannot be proven",
    });
  });

  it("records whether errexit guards a temporary-directory substitution", () => {
    expect(expandWord(word("$(mktemp -d)"), { variables: new Map(), errexit: true })).toEqual({
      kind: "proven",
      value: { path: "", insideMktempDirectory: true, mktempGuarded: true },
    });
  });
});
