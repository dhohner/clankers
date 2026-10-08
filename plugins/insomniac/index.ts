import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { renderFooter } from "./src/footer.ts";

export function installFooter(pi: ExtensionAPI): { setOwnsAssertion: (owned: boolean) => void } {
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
    ctx.ui.setFooter((tui, _theme, footerData) => {
      requestRender = () => tui.requestRender();
      const unsubscribe = footerData.onBranchChange(requestRender);
      return {
        dispose() {
          unsubscribe();
          requestRender = undefined;
        },
        invalidate() {},
        render: (width) =>
          renderFooter(
            {
              model: current.model,
              thinkingLevel: current.thinkingLevel ?? pi.getThinkingLevel(),
              usage: current.getContextUsage(),
              cwd: current.cwd,
              sessionName: current.sessionManager.getSessionName(),
              branch: footerData.getGitBranch() ?? undefined,
              statuses: [...footerData.getExtensionStatuses().values()],
              ownsAssertion,
            },
            width,
            Boolean(process.env.NO_COLOR),
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
  installFooter(pi);
}
