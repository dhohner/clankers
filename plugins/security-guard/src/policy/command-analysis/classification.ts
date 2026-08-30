import type { ShellToken } from "../../shell/types.ts";
import type { HostPathCheck } from "./result.ts";

/**
 * What one command's operands say about it: harmless, needing approval, or needing approval unless the host
 * confirms one fact about a path that this text alone cannot settle.
 */
export type ClassificationVerdict =
  | { kind: "safe" }
  | { kind: "approval" }
  | { kind: "host-check"; check: HostPathCheck };

export const SAFE: ClassificationVerdict = { kind: "safe" };
export const APPROVAL: ClassificationVerdict = { kind: "approval" };

export function hostCheck(path: string, expectation: HostPathCheck["expectation"]): ClassificationVerdict {
  return { kind: "host-check", check: { path, expectation } };
}

/**
 * One resolved simple command, with the two callbacks a command that runs another one needs. A classifier
 * reads only this: it never reaches back into the token stream, so the commands it judges cannot form an
 * import cycle with the classification pass that calls it.
 */
export type ClassificationContext = {
  readonly name: string;
  readonly args: readonly ShellToken[];
  readonly argTexts: readonly string[];
  /** The token index of each word in `args`, so a classifier can hand a nested command word back. */
  readonly argIndices: readonly number[];
  /** Whether a word this classifier cannot read makes the command destructive. */
  readonly failClosed: boolean;
  /** Whether `value`, read as shell command text, runs a destructive command. */
  readonly isDestructiveText: (value: string) => boolean;
  /** Whether the simple command starting at token index `start` is destructive. */
  readonly isDestructiveCommandAt: (start: number) => boolean;
};

export type Classifier = (context: ClassificationContext) => ClassificationVerdict;

/** The commands one module classifies, and the function that judges them. */
export type ClassifierRegistration = { names: readonly string[]; classify: Classifier };
