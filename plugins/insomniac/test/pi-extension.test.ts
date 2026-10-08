import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { stripTerminalSequences } from "@earendil-works/pi-tui";
import { expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { installFooter } from "../index.ts";

// Installing this package must discover just its own footer, not the repository's other plugins.
it("advertises a standalone local Pi entry point and host-provided peers", () => {
  const metadata = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  expect(metadata.pi).toEqual({ extensions: ["./index.ts"] });
  expect(metadata.peerDependencies).toMatchObject({
    "@earendil-works/pi-coding-agent": "*",
    "@earendil-works/pi-tui": "*",
  });
  expect(metadata.dependencies).toBeUndefined();
});

type FooterFactory = NonNullable<Parameters<ExtensionContext["ui"]["setFooter"]>[0]>;

// Pi is the external boundary: no provider or process calls exist in this fixture.
function session(mode: ExtensionContext["mode"] = "tui") {
  const handlers = new Map<string, (event: unknown, ctx: ExtensionContext) => void>();
  const requestRender = vi.fn();
  let footer: ReturnType<FooterFactory> | undefined;
  let branch = "main";
  let branchChanged: (() => void) | undefined;
  const unsubscribe = vi.fn();
  let usage: ReturnType<ExtensionContext["getContextUsage"]> = undefined;
  const ctx = {
    mode,
    hasUI: mode === "tui" || mode === "rpc",
    cwd: "/code",
    model: { id: "opus", name: "Opus", reasoning: true },
    thinkingLevel: "high",
    getContextUsage: () => usage,
    sessionManager: { getSessionName: () => "Review" },
    ui: {
      setFooter: (factory: FooterFactory | undefined) => {
        footer?.dispose?.();
        footer = factory?.(
          { requestRender } as unknown as Parameters<FooterFactory>[0],
          {} as Parameters<FooterFactory>[1],
          {
            getGitBranch: () => branch,
            getExtensionStatuses: () =>
              new Map([
                ["guard", "guard active"],
                ["style", "concise"],
              ]),
            getAvailableProviderCount: () => 0,
            onBranchChange: (callback) => {
              branchChanged = callback;
              return unsubscribe;
            },
          },
        );
      },
    },
  } as unknown as ExtensionContext;
  const pi = {
    on: (event: string, handler: (event: unknown, ctx: ExtensionContext) => void) => {
      handlers.set(event, handler);
      return () => handlers.delete(event);
    },
    getThinkingLevel: () => "medium",
  } as unknown as ExtensionAPI;
  const controller = installFooter(pi);
  const emit = (type: string) => handlers.get(type)?.({ type }, ctx);
  const render = (width = 100) => footer?.render(width).map(stripTerminalSequences).join("\n");
  return {
    ctx,
    controller,
    emit,
    render,
    requestRender,
    unsubscribe,
    setUsage: (next: typeof usage) => {
      usage = next;
    },
    changeBranch: (next: string) => {
      branch = next;
      branchChanged?.();
    },
  };
}

// Guarding hasUI instead of mode erroneously installs the footer in RPC.
it.each(["tui", "rpc", "json", "print"] as const)(
  "automatically installs a footer only in TUI, including %s",
  (mode) => {
    const host = session(mode);
    host.emit("session_start");
    if (mode === "tui") expect(host.render()).toContain("💤 can sleep");
    else expect(host.render()).toBeUndefined();
  },
);

// Missing response/compaction refreshes or cached usage leave the bar stale.
it("refreshes live context across responses, unknown compaction, and the next response", () => {
  const host = session();
  host.emit("session_start");
  expect(host.render()).toContain("──────────────────── --");
  for (const [type, usage, expected] of [
    ["message_end", { tokens: 76000, contextWindow: 200000, percent: 38 }, "76k/200k"],
    ["agent_end", { tokens: 24000, contextWindow: 200000, percent: 12 }, "24k/200k"],
    ["session_compact", { tokens: null, contextWindow: 200000, percent: null }, "──────────────────── --"],
    ["message_end", { tokens: 10000, contextWindow: 200000, percent: 5 }, "10k/200k"],
  ] as const) {
    host.setUsage(usage);
    host.requestRender.mockClear();
    host.emit(type);
    expect(host.requestRender).toHaveBeenCalled();
    expect(host.render()).toContain(expected);
  }
});

// Omitting either selection event leaves the footer showing the previous model/effort.
it("refreshes model and thinking selections, falls back to ID, and omits unsupported thinking", () => {
  const host = session();
  host.emit("session_start");
  host.ctx.model!.name = "";
  host.ctx.model!.id = "new-model";
  host.emit("model_select");
  expect(host.requestRender).toHaveBeenCalled();
  expect(host.render()).toContain("new-model · high");
  host.requestRender.mockClear();
  host.ctx.thinkingLevel = "low";
  host.emit("thinking_level_select");
  expect(host.requestRender).toHaveBeenCalled();
  expect(host.render()).toContain("new-model · low");
  host.ctx.model!.reasoning = false;
  host.emit("model_select");
  expect(host.render()).not.toContain(" · low");
  host.ctx.model = undefined;
  host.emit("model_select");
  expect(host.render()).not.toContain("new-model");
});

// Failing to preserve footerData hides Git and other extensions; disposal must remove watchers.
it("preserves directory, branch, session name and statuses and refreshes changed branches", () => {
  const host = session();
  host.emit("session_start");
  expect(host.render()).toContain("/code · main · Review");
  expect(host.render()).toContain("guard active · concise");
  host.changeBranch("next");
  expect(host.requestRender).toHaveBeenCalled();
  expect(host.render()).toContain("/code · next · Review");
  host.emit("session_start");
  expect(host.unsubscribe).toHaveBeenCalled();
});

// A global state or missing render request would misreport another session's ownership.
it("updates assertion ownership only for this session and requests a render", () => {
  const first = session();
  const second = session();
  first.emit("session_start");
  second.emit("session_start");
  first.controller.setOwnsAssertion(true);
  expect(first.requestRender).toHaveBeenCalled();
  expect(first.render()).toContain("☕ awake");
  expect(second.render()).toContain("💤 can sleep");
  first.controller.setOwnsAssertion(false);
  expect(first.render()).toContain("💤 can sleep");
});
