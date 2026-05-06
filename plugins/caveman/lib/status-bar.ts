import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { CavemanState } from "./types.js";

export const STATUS_KEY = "caveman";
export const STATUS_LABEL = "caveman:ultra";

export function updateStatusBar(ctx: ExtensionContext, state: CavemanState): void {
  try {
    ctx.ui.setStatus(
      STATUS_KEY,
      state.enabled ? ctx.ui.theme.fg("accent", STATUS_LABEL) : undefined,
    );
  } catch {
    // setStatus/theme may be unavailable in non-interactive contexts
  }
}
