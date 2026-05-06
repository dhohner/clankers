import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@mariozechner/pi-coding-agent";
import { saveState } from "./state.js";
import { updateStatusBar } from "./status-bar.js";
import type { CavemanStateRef, ModeAction } from "./types.js";

export const COMMAND_NAME = "caveman";

export function parseAction(args: string): ModeAction | undefined {
  const value = args.trim().toLowerCase();
  if (!value) return "toggle";
  if (value === "toggle") return "toggle";
  if (value === "status") return "status";
  if (value === "on" || value === "ultra") return "on";
  if (value === "off" || value === "normal") return "off";
  return undefined;
}

export async function handleCavemanCommand(
  args: string,
  ctx: ExtensionCommandContext,
  stateRef: CavemanStateRef,
  pi: ExtensionAPI,
): Promise<void> {
  const action = parseAction(args ?? "");
  if (!action) {
    ctx.ui.notify("Usage: /caveman [on|off|toggle|status]", "warning");
    return;
  }

  if (action === "status") {
    notifyStatus(ctx, stateRef.get().enabled);
    return;
  }

  const current = stateRef.get();
  const enabled = action === "toggle" ? !current.enabled : action === "on";
  const next = { enabled };

  stateRef.set(next);
  saveState(pi, next);
  updateStatusBar(ctx, next);
  notifyStatus(ctx, enabled);
}

function notifyStatus(ctx: ExtensionCommandContext, enabled: boolean): void {
  ctx.ui.notify(enabled ? "caveman ultra on" : "caveman off", "info");
}
