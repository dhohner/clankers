import { SessionManager, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { installFooter } from "../../index.ts";
import { createPiHost } from "../support/pi-host.ts";
import { createFooterController } from "../../src/pi/footer.ts";

// Installing this package must discover just its own footer, not the repository's other plugins.
it("advertises a standalone local Pi entry point and host-provided peers", () => {
  const metadata = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
  expect(metadata.pi).toEqual({ extensions: ["./index.ts"] });
  expect(metadata.peerDependencies).toMatchObject({
    "@earendil-works/pi-coding-agent": "*",
    "@earendil-works/pi-tui": "*",
  });
  expect(metadata.dependencies).toBeUndefined();
});

it("includes the relocated Pi sources in the repository package distribution", () => {
  const metadata = JSON.parse(readFileSync(new URL("../../../../package.json", import.meta.url), "utf8"));
  expect(metadata.files).toContain("plugins/insomniac/index.ts");
  expect(metadata.files).toContain("plugins/insomniac/src/**");
});

it("installs through an explicit controller and disposes its session callback once", () => {
  const host = createPiHost();
  const footer = createFooterController(host.pi);
  const disposed = vi.fn();
  host.emit("session_start");
  expect(host.render()).toBeUndefined();
  footer.install(host.ctx, disposed);
  footer.setOwnsAssertion(true);
  expect(host.render()).toContain("☕ awake");
  host.disposeFooter();
  host.disposeFooter();
  expect(disposed).toHaveBeenCalledOnce();
  expect(host.unsubscribe).toHaveBeenCalledOnce();
  host.requestRender.mockClear();
  footer.setOwnsAssertion(false);
  host.changeBranch("next");
  expect(host.requestRender).not.toHaveBeenCalled();
});

it.each(["tui", "rpc", "json", "print"] as const)("preserves the installation callback contract in %s", (mode) => {
  const host = createPiHost(mode);
  const disposed = vi.fn();
  const started = vi.fn(() => disposed);
  installFooter(host.pi, started);
  host.emit("session_start");

  if (mode === "tui") {
    expect(started).toHaveBeenCalledWith(host.ctx);
    host.disposeFooter();
    expect(disposed).toHaveBeenCalledOnce();
  } else {
    expect(started).not.toHaveBeenCalled();
    expect(host.render()).toBeUndefined();
  }
});

function session(mode: ExtensionContext["mode"] = "tui") {
  const host = createPiHost(mode);
  const controller = installFooter(host.pi);

  return { ...host, controller };
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

it("restores the session estimate and refreshes recorded costs independently of context", () => {
  const host = session();

  const addCost = (cost: number) =>
    host.manager.appendUsage("cache_warm", "p", "m", {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: cost, output: 0, cacheRead: 0, cacheWrite: 0, total: cost },
    });

  addCost(0.123);
  host.emit("session_start");
  expect(host.render()).toContain("──────────────────── -- · ~$0.123");
  addCost(0.2);
  host.emit("message_end");
  expect(host.render()).toContain("~$0.323");
  host.emit("session_compact");
  expect(host.render()).toContain("~$0.323");
  host.ctx.model = undefined;
  host.emit("model_select");
  expect(host.render()).toContain("~$0.323");
  host.ctx.sessionManager = SessionManager.inMemory();
  host.emit("session_start");
  expect(host.render()).toContain("~$0.000");
});

it("avoids copying session entries on unchanged footer renders and updates after an append", () => {
  const host = session();
  const getEntries = vi.spyOn(host.manager, "getEntries");
  host.emit("session_start");
  expect(host.render()).toContain("~$0.000");

  for (let i = 0; i < 200; i++) expect(host.render()).toContain("~$0.000");
  expect(getEntries).toHaveBeenCalledTimes(1);
  host.manager.appendUsage("response", "p", "m", {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: { input: 0.123, output: 0, cacheRead: 0, cacheWrite: 0, total: 0.123 },
  });
  host.emit("message_end");
  expect(host.render()).toContain("~$0.123");
  expect(getEntries).toHaveBeenCalledTimes(2);
});

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

it.each([
  ["off", "thinkingOff"],
  ["minimal", "thinkingMinimal"],
  ["low", "thinkingLow"],
  ["medium", "thinkingMedium"],
  ["high", "thinkingHigh"],
  ["xhigh", "thinkingXhigh"],
  ["max", "thinkingMax"],
] as const)("uses the editor border theme color for %s", (level, token) => {
  vi.stubEnv("NO_COLOR", "");

  try {
    const host = session();
    host.emit("session_start");
    host.ctx.thinkingLevel = level;
    host.emit("thinking_level_select");
    expect(host.raw()).toContain(`\u001b[38;5;42m${level}\u001b[39m`);
    expect(host.theme.fg).toHaveBeenCalledWith(token, level);
    host.theme.fg.mockImplementation((_token, text) => `\u001b[38;5;99m${text}\u001b[39m`);
    expect(host.raw()).toContain(`\u001b[38;5;99m${level}\u001b[39m`);
    vi.stubEnv("NO_COLOR", "1");
    expect(host.raw()).toBe(host.render());
    host.ctx.model!.reasoning = false;
    expect(host.render()).not.toContain(` · ${level}`);
  } finally {
    vi.unstubAllEnvs();
  }
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
