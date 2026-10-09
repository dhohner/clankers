import { SessionManager, Theme, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { stripTerminalSequences } from "@earendil-works/pi-tui";
import { vi } from "vitest";

type FooterFactory = NonNullable<Parameters<ExtensionContext["ui"]["setFooter"]>[0]>;

type FixtureContext = Pick<
  ExtensionContext,
  "signal" | "mode" | "hasUI" | "cwd" | "model" | "thinkingLevel" | "getContextUsage" | "sessionManager"
> & { ui: Pick<ExtensionContext["ui"], "setFooter"> };

interface FixtureEvent {
  type: string;
}

type Handler = (event: FixtureEvent, ctx: ExtensionContext) => void;

export function createPiHost(mode: ExtensionContext["mode"] = "tui") {
  const handlers = new Map<string, Handler[]>();
  const requestRender = vi.fn<Parameters<FooterFactory>[0]["requestRender"]>();
  const footerTui: Pick<Parameters<FooterFactory>[0], "requestRender"> = { requestRender };

  const theme = {
    getThinkingBorderColor: Theme.prototype.getThinkingBorderColor,
    fg: vi.fn<Theme["fg"]>((_token, text) => `\u001b[38;5;42m${text}\u001b[39m`),
  };

  const footerTheme: Pick<Theme, "getThinkingBorderColor" | "fg"> = theme;
  let footer: ReturnType<FooterFactory> | undefined;
  let branch = "main";
  let branchChanged: (() => void) | undefined;

  const unsubscribe = vi.fn(() => {
    branchChanged = undefined;
  });

  let usage: ReturnType<ExtensionContext["getContextUsage"]> = undefined;

  let statuses = new Map([
    ["guard", "guard active"],
    ["style", "concise"],
  ]);

  const abortController = new AbortController();
  const manager = SessionManager.inMemory();
  manager.appendSessionInfo("Review");

  const fixtureContext: FixtureContext = {
    signal: abortController.signal,
    mode,
    hasUI: mode === "tui" || mode === "rpc",
    cwd: "/code",
    model: {
      id: "opus",
      name: "Opus",
      reasoning: true,
      api: "anthropic-messages",
      provider: "anthropic",
      baseUrl: "https://example.invalid",
      input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 200000,
      maxTokens: 32000,
    },
    thinkingLevel: "high",
    getContextUsage: () => usage,
    sessionManager: manager,
    ui: {
      setFooter: (factory) => {
        footer?.dispose?.();
        footer = factory?.(
          // SAFETY: Insomniac's footer calls only requestRender; the fixture checks that member against TUI.
          footerTui as Parameters<FooterFactory>[0],
          // SAFETY: The real thinking-color method calls only fg; both members are checked against Theme.
          footerTheme as Theme,
          {
            getGitBranch: () => branch,
            getExtensionStatuses: () => statuses,
            getAvailableProviderCount: () => 0,
            onBranchChange: (callback) => {
              branchChanged = callback;

              return unsubscribe;
            },
          },
        );
      },
    },
  };

  // SAFETY: Only Insomniac receives this context; FixtureContext checks every member it reads against the host contract.
  const ctx = fixtureContext as ExtensionContext;

  const fixtureAPI: Pick<ExtensionAPI, "getThinkingLevel"> & {
    on: (event: string, handler: Handler) => () => void;
  } = {
    on: (event, handler) => {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);

      return () => {
        handlers.set(
          event,
          (handlers.get(event) ?? []).filter((registered) => registered !== handler),
        );
      };
    },
    getThinkingLevel: () => "medium",
  };

  // SAFETY: Insomniac registers only notification handlers here; they read context and ignore event payloads.
  const pi = fixtureAPI as ExtensionAPI;

  return {
    pi,
    ctx,
    manager,
    emit: (type: string) => [...(handlers.get(type) ?? [])].map((handler) => handler({ type }, ctx)),
    render: (width = 100) => footer?.render(width).map(stripTerminalSequences).join("\n"),
    raw: (width = 100) => footer?.render(width).join("\n"),
    requestRender,
    theme,
    unsubscribe,
    setUsage: (next: typeof usage) => {
      usage = next;
    },
    setStatuses: (next: typeof statuses) => {
      statuses = next;
    },
    changeBranch: (next: string) => {
      branch = next;
      branchChanged?.();
    },
    abort: () => abortController.abort(),
    disposeFooter: () => footer?.dispose?.(),
    captureFooter: () => footer,
  };
}
