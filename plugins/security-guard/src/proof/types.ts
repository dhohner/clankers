export type ProvenPath = { path: string; insideMktempDirectory: boolean };

/** A path whose effect and symlink behavior have been proven from the command text. */
export type DestructiveTarget = ProvenPath & { followsLinks: boolean };

export type ShellVariable = ProvenPath & { mktempGuarded: boolean };

export type ShellState = {
  variables: Map<string, ShellVariable>;
  errexit: boolean;
};

export type ProofFailure =
  | "assignment substitution cannot be proven"
  | "assignment value cannot be proven"
  | "command cannot be resolved"
  | "command escalates privilege"
  | "command executable is not trusted"
  | "command has no path-target model"
  | "command has no write-target model"
  | "command has unmodeled effects"
  | "destructive command is approval-only"
  | "descriptor target is not a descriptor"
  | "heredoc body cannot be distinguished from commands"
  | "path glob can traverse outside the proven target"
  | "path operands cannot be identified"
  | "redirection target contains a substitution"
  | "redirection target contains a wildcard"
  | "word expansion cannot be proven"
  | "write redirection has no target"
  | "write target contains a wildcard"
  | "write-target option cannot be identified"
  | "sensitive shell variable assignment"
  | "shell option state cannot be proven"
  | "word contains a substitution"
  | "wrapper has unmodeled effects";

export type ProofResult<T> =
  | { kind: "proven"; value: T }
  | { kind: "unprovable"; reason: ProofFailure };

export function proven<T>(value: T): ProofResult<T> {
  return { kind: "proven", value };
}

export function unprovable<T = never>(reason: ProofFailure): ProofResult<T> {
  return { kind: "unprovable", reason };
}

export type ProvableCall = { targets: DestructiveTarget[]; commands: string[] };

export function provenTarget(
  { path, insideMktempDirectory }: ShellVariable,
  followsLinks: boolean,
): DestructiveTarget {
  return { path, insideMktempDirectory, followsLinks };
}
