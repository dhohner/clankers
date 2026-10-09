import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import { expect, it, vi } from "vitest";
import { installInsomniac } from "../../index.ts";
import { createPiHost } from "../support/pi-host.ts";
import { createAssertionProcess } from "../support/assertion-process.ts";

function session(platform: NodeJS.Platform = "darwin", mode: ExtensionContext["mode"] = "tui", denied = false) {
  const host = createPiHost(mode);
  const process = createAssertionProcess(denied);
  host.setUsage({ tokens: 76000, contextWindow: 200000, percent: 38 });
  host.setStatuses(new Map([["guard", "guard active"]]));
  installInsomniac(host.pi, { platform, spawn: process.spawn });

  return { ...host, ...process };
}

// Starting twice or publishing before spawn would over-own or falsely report an assertion.
it("acquires one idle assertion only after startup and immediately refreshes this session's footer", () => {
  const host = session();
  expect(host.launches).toHaveLength(0);
  host.emit("session_start");
  expect(host.launches).toHaveLength(0);
  host.emit("agent_start");
  host.emit("agent_start");
  expect(host.launches).toHaveLength(1);
  expect(host.launches[0]).toMatchObject({
    command: "/usr/bin/caffeinate",
    args: ["-i", "-w", String(process.pid)],
    options: { stdio: "ignore" },
  });
  expect(host.render()).toContain("💤 can sleep");
  host.requestRender.mockClear();
  host.children[0].emit("spawn");
  expect(host.requestRender).toHaveBeenCalled();
  expect(host.render()).toContain("☕ awake");
  host.emit("session_shutdown");
});

// agent_end is provisional; releasing there loses assertions during retries and queued work.
it("keeps the same assertion across retries and automatic continuation until final settlement", () => {
  const host = session();
  host.emit("session_start");
  host.emit("agent_start");
  host.children[0].emit("spawn");

  for (const type of ["agent_end", "session_compact", "agent_before_settle", "agent_start", "agent_end"]) {
    host.emit(type);
    expect(host.render()).toContain("☕ awake");
    expect(host.children[0].kill).not.toHaveBeenCalled();
  }

  expect(host.launches).toHaveLength(1);
  host.requestRender.mockClear();
  host.emit("agent_settled");
  expect(host.children[0].kill).toHaveBeenCalledOnce();
  expect(host.requestRender).toHaveBeenCalled();
  expect(host.render()).toContain("💤 can sleep");
  host.emit("agent_settled");
  expect(host.children[0].kill).toHaveBeenCalledOnce();
  host.emit("agent_start");
  expect(host.launches).toHaveLength(2);
  host.emit("session_shutdown");
});

// Replacing/discarding a footer must release its runtime; old spawn/exit callbacks must stay inert.
it("disposes an old runtime on reload and ignores its late callbacks while the new runtime is awake", () => {
  const host = session();
  host.emit("session_start");
  host.emit("agent_start");
  const old = host.children[0];
  host.emit("session_start");
  expect(old.kill).toHaveBeenCalledOnce();
  host.emit("agent_start");
  const current = host.children[1];
  current.emit("spawn");
  old.emit("spawn");
  old.emit("exit", 0, null);
  old.emit("error", new Error("late error"));
  expect(host.render()).toContain("☕ awake");
  expect(current.kill).not.toHaveBeenCalled();
  host.disposeFooter();
  host.disposeFooter();
  expect(current.kill).toHaveBeenCalledOnce();
  host.emit("agent_start");
  expect(host.launches).toHaveLength(2);
  host.emit("session_shutdown");
  current.emit("spawn");
  expect(host.render()).toContain("💤 can sleep");
});

// An ENOENT event or synchronous EACCES must not escape Pi or leave ownership stuck.
it.each(["missing", "denied"])("keeps Pi usable after %s acquisition and retries only on a new run", (failure) => {
  const host = session("darwin", "tui", failure === "denied");
  host.emit("session_start");
  expect(() => host.emit("agent_start")).not.toThrow();

  if (failure === "missing") host.children[0].emit("error", new Error("ENOENT"));
  expect(host.render()).toContain("💤 can sleep");
  host.emit("agent_start");
  expect(host.launches).toHaveLength(1);
  host.emit("agent_settled");
  expect(() => host.emit("agent_start")).not.toThrow();
  expect(host.launches).toHaveLength(2);
  host.emit("session_shutdown");
});

// A crashed child must clear the label immediately and not spin creating replacements.
it("returns to no assertion after unexpected child exit and ignores duplicate loss notifications", () => {
  const host = session();
  host.emit("session_start");
  host.emit("agent_start");
  host.children[0].emit("spawn");
  host.requestRender.mockClear();
  host.children[0].emit("exit", 1, null);
  expect(host.render()).toContain("💤 can sleep");
  expect(host.requestRender).toHaveBeenCalled();
  host.children[0].emit("error", new Error("child disappeared"));
  host.emit("agent_start");
  expect(host.launches).toHaveLength(1);
  host.emit("agent_settled");
  host.emit("agent_start");
  expect(host.launches).toHaveLength(2);
  host.children[1].emit("spawn");
  expect(host.render()).toContain("☕ awake");
  host.emit("session_shutdown");
});

// Releasing at the abort request lets the Mac sleep while cancellation is still unwinding.
it("holds the assertion during abort unwinding and releases it at completed abort settlement", () => {
  const host = session();
  host.emit("session_start");
  host.emit("agent_start");
  host.children[0].emit("spawn");
  host.abort();
  host.emit("agent_end");
  expect(host.children[0].kill).not.toHaveBeenCalled();
  expect(host.render()).toContain("☕ awake");
  host.emit("agent_settled");
  expect(host.children[0].kill).toHaveBeenCalledOnce();
  expect(host.render()).toContain("💤 can sleep");
  host.emit("session_shutdown");
});

// Treating hasUI or any platform as permission to spawn breaks RPC and non-Mac sessions.
it.each([
  ["linux", "tui"],
  ["win32", "tui"],
  ["darwin", "print"],
  ["darwin", "json"],
  ["darwin", "rpc"],
] as const)("starts no sleep process on %s in %s mode", (platform, mode) => {
  const host = session(platform, mode);
  host.emit("session_start");
  host.emit("agent_start");
  host.emit("agent_end");
  host.emit("agent_settled");
  expect(host.launches).toHaveLength(0);

  if (mode === "tui") expect(host.render()).toContain("💤 can sleep");
  else expect(host.render()).toBeUndefined();
  host.emit("session_shutdown");
});

// Ownership refresh must preserve model/context/details, widths, and NO_COLOR in both states.
it.each([40, 100, 160])(
  "preserves footer details and bounded widths at %i columns during sleep transitions",
  (width) => {
    vi.stubEnv("NO_COLOR", "1");
    const first = session();
    const second = session();

    try {
      first.emit("session_start");
      second.emit("session_start");
      first.emit("agent_start");
      first.children[0].emit("spawn");
      expect(first.render(width)).toContain("☕ awake");
      expect(second.render(width)).toContain("💤 can sleep");

      for (const host of [first, second]) {
        const raw = host.raw(width)!;
        expect(raw).not.toContain("\u001b");
        expect(raw.split("\n").every((row) => visibleWidth(row) <= width)).toBe(true);
        expect(raw).toContain("Opus · high");
        expect(raw).toContain("76k/200k");
        expect(raw).toContain("/code · main · Review");
        expect(raw).toContain("guard active");
      }

      first.emit("agent_settled");
      expect(first.render(width)).toContain("💤 can sleep");
    } finally {
      first.emit("session_shutdown");
      second.emit("session_shutdown");
      vi.unstubAllEnvs();
    }
  },
);

// An error after launch can still leave a live process; dropping its handle would leak ownership.
it("terminates a started child on a process error and contains cleanup errors", () => {
  const host = session();
  host.emit("session_start");
  host.emit("agent_start");
  host.children[0].emit("spawn");
  host.children[0].kill.mockImplementation(() => {
    throw new Error("kill denied");
  });
  expect(() => host.children[0].emit("error", new Error("process error"))).not.toThrow();
  expect(host.children[0].kill).toHaveBeenCalledOnce();
  expect(host.render()).toContain("💤 can sleep");
  host.children[0].emit("spawn");
  expect(host.render()).toContain("💤 can sleep");
  host.emit("session_shutdown");
});

// A disposed footer callback must not clear the replacement footer's render handle.
it("keeps immediate rendering after duplicate disposal callbacks from an old footer", () => {
  const host = session();
  host.emit("session_start");
  const oldFooter = host.captureFooter();
  host.emit("agent_start");
  host.children[0].emit("spawn");
  host.emit("session_start");
  host.emit("agent_start");
  host.children[1].emit("spawn");
  oldFooter?.dispose?.();
  host.requestRender.mockClear();
  host.emit("agent_settled");
  expect(host.requestRender).toHaveBeenCalled();
  expect(host.render()).toContain("💤 can sleep");
  host.emit("session_shutdown");
});
