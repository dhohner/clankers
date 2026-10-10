import type { ExtensionAPI, ExtensionContext, ExtensionEvent } from "@earendil-works/pi-coding-agent";
import { stripTerminalSequences } from "@earendil-works/pi-tui";
import { renderFooter } from "./render-footer.ts";
import { createSessionCostReader } from "./session-cost.ts";

export function createFooterController(pi: ExtensionAPI) {
  const readSessionCost = createSessionCostReader();
  let current: ExtensionContext;
  let ownsAssertion = false;
  let requestRender: (() => void) | undefined;

  const refresh = (_event: ExtensionEvent, ctx: ExtensionContext) => {
    if (ctx.mode !== "tui") return;
    current = ctx;
    requestRender?.();
  };

  pi.on("message_end", refresh);
  pi.on("agent_end", refresh);
  pi.on("session_compact", refresh);
  pi.on("model_select", refresh);
  pi.on("thinking_level_select", refresh);

  return {
    install(ctx: ExtensionContext, onDispose?: () => void) {
      if (ctx.mode !== "tui") return;
      current = ctx;
      ctx.ui.setFooter((tui, theme, footerData) => {
        const render = () => tui.requestRender();
        requestRender = render;
        let disposed = false;
        const unsubscribe = footerData.onBranchChange(render);

        return {
          dispose() {
            if (disposed) return;
            disposed = true;
            onDispose?.();
            unsubscribe();

            if (requestRender === render) requestRender = undefined;
          },
          invalidate() {},
          render: (width) => {
            const statuses = footerData.getExtensionStatuses();
            // Output Styles publishes a themed "style <name>" entry through Pi's shared status API.
            const styleStatus = stripTerminalSequences(statuses.get("output-style") ?? "");
            const outputStyle = styleStatus.startsWith("style ") ? styleStatus.slice(6) : undefined;

            return renderFooter(
              {
                model: current.model,
                thinkingLevel: current.thinkingLevel ?? pi.getThinkingLevel(),
                usage: current.getContextUsage(),
                sessionCost: readSessionCost(current.sessionManager),
                cwd: current.cwd,
                sessionName: current.sessionManager.getSessionName(),
                branch: footerData.getGitBranch() ?? undefined,
                outputStyle,
                statuses: [...statuses].flatMap(([key, value]) =>
                  key === "output-style" && outputStyle ? [] : [value],
                ),
                ownsAssertion,
              },
              width,
              Boolean(process.env.NO_COLOR),
              (text) => theme.getThinkingBorderColor(current.thinkingLevel ?? pi.getThinkingLevel())(text),
              (text) => theme.fg("accent", text),
            );
          },
        };
      });
    },
    setOwnsAssertion(owned: boolean) {
      ownsAssertion = owned;
      requestRender?.();
    },
  };
}

export function installFooter(pi: ExtensionAPI, onSessionStart?: (ctx: ExtensionContext) => () => void) {
  const footer = createFooterController(pi);
  pi.on("session_start", (_event, ctx) => {
    if (ctx.mode !== "tui") return;
    footer.install(ctx, onSessionStart?.(ctx));
  });

  return { setOwnsAssertion: footer.setOwnsAssertion };
}
