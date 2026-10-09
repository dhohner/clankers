import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { SleepAssertion, type SleepDependencies } from "./src/sleep.ts";
import { renderFooter } from "./src/footer.ts";
import { createSessionCostReader } from "./src/cost.ts";

export function installFooter(
  pi: ExtensionAPI,
  onSessionStart?: (ctx: ExtensionContext) => () => void,
): { setOwnsAssertion: (owned: boolean) => void } {
  const readSessionCost = createSessionCostReader();
  let current: ExtensionContext;
  let ownsAssertion = false;
  let requestRender: (() => void) | undefined;
  const refresh = (_event: unknown, ctx: ExtensionContext) => {
    if (ctx.mode !== "tui") return;
    current = ctx;
    requestRender?.();
  };
  pi.on("message_end", refresh);
  pi.on("agent_end", refresh);
  pi.on("session_compact", refresh);
  pi.on("model_select", refresh);
  pi.on("thinking_level_select", refresh);
  pi.on("session_start", (_event, ctx) => {
    if (ctx.mode !== "tui") return;
    current = ctx;
    const disposeSession = onSessionStart?.(ctx);
    ctx.ui.setFooter((tui, theme, footerData) => {
      const render = () => tui.requestRender();
      requestRender = render;
      let disposed = false;
      const unsubscribe = footerData.onBranchChange(render);
      return {
        dispose() {
          if (disposed) return;
          disposed = true;
          disposeSession?.();
          unsubscribe();
          if (requestRender === render) requestRender = undefined;
        },
        invalidate() {},
        render: (width) =>
          renderFooter(
            {
              model: current.model,
              thinkingLevel: current.thinkingLevel ?? pi.getThinkingLevel(),
              usage: current.getContextUsage(),
              sessionCost: readSessionCost(current.sessionManager),
              cwd: current.cwd,
              sessionName: current.sessionManager.getSessionName(),
              branch: footerData.getGitBranch() ?? undefined,
              statuses: [...footerData.getExtensionStatuses().values()],
              ownsAssertion,
            },
            width,
            Boolean(process.env.NO_COLOR),
            (text) => theme.getThinkingBorderColor(current.thinkingLevel ?? pi.getThinkingLevel())(text),
          ),
      };
    });
  });
  return {
    setOwnsAssertion(owned) {
      ownsAssertion = owned;
      requestRender?.();
    },
  };
}

export default function insomniac(pi: ExtensionAPI): void {
  installInsomniac(pi);
}

export function installInsomniac(pi: ExtensionAPI, dependencies: SleepDependencies = {}): void {
  let runtime: SleepAssertion | undefined;
  const footer = installFooter(pi, () => {
    runtime?.dispose();
    const next = new SleepAssertion((owned) => {
      if (runtime === next) footer.setOwnsAssertion(owned);
    }, dependencies);
    runtime = next;
    return () => next.dispose();
  });
  pi.on("agent_start", (_event, ctx) => {
    if (ctx.mode === "tui") runtime?.acquire();
  });
  pi.on("agent_settled", () => runtime?.release());
  pi.on("session_shutdown", () => runtime?.dispose());
}
