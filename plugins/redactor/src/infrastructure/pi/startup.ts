import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { formatWarning, UNSUPPORTED_PLATFORM_MESSAGE } from "../../domain/warning.ts";

export function registerUnsupportedPlatformNotice(pi: ExtensionAPI): void {
  pi.on("session_start", (_event, ctx) => {
    ctx.ui.notify(UNSUPPORTED_PLATFORM_MESSAGE, "warning");
  });
}

export function registerLoadWarning(pi: ExtensionAPI, terminalWidth: () => number | undefined): void {
  pi.on("session_start", (_event, ctx) => {
    ctx.ui.notify(formatWarning(terminalWidth()), "warning");
  });
}
