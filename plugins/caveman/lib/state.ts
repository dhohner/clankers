import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { CavemanState, CustomEntry } from "./types.js";

export const STATE_ENTRY_TYPE = "caveman-state";

export function createState(enabled = false): CavemanState {
  return { enabled };
}

export function restoreState(ctx: ExtensionContext): CavemanState {
  const entries = ctx.sessionManager.getBranch() as CustomEntry[];
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry.type === "custom" && entry.customType === STATE_ENTRY_TYPE) {
      return createState(entry.data?.enabled === true);
    }
  }
  return createState();
}

export function saveState(pi: ExtensionAPI, state: CavemanState): void {
  pi.appendEntry(STATE_ENTRY_TYPE, state);
}
