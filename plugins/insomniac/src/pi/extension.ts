import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createFooterController } from "./footer.ts";
import { SleepAssertion, type SleepDependencies } from "./sleep-assertion.ts";

export default function insomniac(pi: ExtensionAPI): void {
  installInsomniac(pi);
}

export function installInsomniac(pi: ExtensionAPI, dependencies: SleepDependencies = {}): void {
  let runtime: SleepAssertion | undefined;
  const footer = createFooterController(pi);
  pi.on("session_start", (_event, ctx) => {
    if (ctx.mode !== "tui") return;
    runtime?.dispose();

    const next = new SleepAssertion((owned) => {
      if (runtime === next) footer.setOwnsAssertion(owned);
    }, dependencies);

    runtime = next;
    footer.install(ctx, () => next.dispose());
  });
  pi.on("agent_start", (_event, ctx) => {
    if (ctx.mode === "tui") runtime?.acquire();
  });
  pi.on("agent_settled", () => runtime?.release());
  pi.on("session_shutdown", () => runtime?.dispose());
}
