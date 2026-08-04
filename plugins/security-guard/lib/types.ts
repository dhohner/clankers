export const BLOCK_REASON =
  "Command blocked by security policy. Do not suggest workarounds, alternate commands, or indirect ways to print the current user environment or read secrets, tokens, keys, credential stores, or shell history.";

export const DESTRUCTIVE_APPROVAL_REASON =
  "Destructive command blocked because it was not approved by the user.";

import type {
  ToolCallEvent as PiToolCallEvent,
  ToolResultEvent as PiToolResultEvent,
  UserBashEvent as PiUserBashEvent,
} from "@mariozechner/pi-coding-agent";

// These stay deliberate supertypes of Pi's own events: handlers read payloads defensively so that a host
// delivering a partial event degrades to "no match" instead of throwing, and `args` covers hosts that use
// that key instead of `input`. The assertions below stop that permissiveness from hiding a real break --
// without them, Pi renaming a field this extension reads would compile cleanly and silently do nothing.
export type ToolCallEvent = {
  toolName?: string;
  input?: Record<string, unknown>;
  args?: Record<string, unknown>;
};

export type ToolResultEvent = ToolCallEvent & {
  content?: Array<{ type?: string; text?: string }>;
  isError?: boolean;
};

export type UserBashEvent = {
  command?: string;
};

/** Errors if `Source` is not assignable to `Target`, unlike a boolean check that `never` satisfies. */
type AssertAssignable<Source extends Target, Target> = Source;

/** Fields read from each event, required so the assertion cannot pass vacuously against optional members. */
type Reads<Event, Key extends keyof Event> = Required<Pick<Event, Key>>;

type _PiToolCallEventIsCompatible = AssertAssignable<PiToolCallEvent, Reads<ToolCallEvent, "toolName">>;
type _PiToolResultEventIsCompatible = AssertAssignable<
  PiToolResultEvent,
  Reads<ToolResultEvent, "toolName" | "content" | "isError">
>;
type _PiUserBashEventIsCompatible = AssertAssignable<PiUserBashEvent, Reads<UserBashEvent, "command">>;

export type BlockDecision =
  | { blocked: true; reason: string }
  | { blocked: false };
