import { SessionManager } from "@earendil-works/pi-coding-agent";
import { expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSessionCostReader, estimateSessionCost } from "../../src/pi/session-cost.ts";

type Usage = Parameters<SessionManager["appendUsage"]>[3];

const usage = (total: number): Usage => ({
  input: 100,
  output: 20,
  cacheRead: 50,
  cacheWrite: 10,
  totalTokens: 180,
  cost: { input: total / 2, output: total / 4, cacheRead: total / 8, cacheWrite: total / 8, total },
});

it("sums recorded session costs across models, tools, compaction, and abandoned branches", () => {
  const manager = SessionManager.inMemory();
  const root = manager.appendMessage({ role: "user", content: "Hello", timestamp: 0 });
  manager.appendMessage({
    role: "assistant",
    content: [],
    api: "anthropic-messages",
    provider: "anthropic",
    model: "opus",
    usage: usage(0.1),
    stopReason: "stop",
    timestamp: 0,
  });
  manager.appendMessage({
    role: "toolResult",
    toolCallId: "call",
    toolName: "delegate",
    content: [],
    isError: false,
    usage: usage(0.2),
    timestamp: 0,
  });
  manager.appendCompaction("Summary", root, 180, undefined, false, usage(0.3));
  manager.branchWithSummary(root, "Branch", undefined, false, usage(0.4));
  manager.appendUsage("cache_warm", "other", "other-model", usage(0.5));
  manager.appendCustomEntry("status", { cost: 100 });
  expect(estimateSessionCost(manager.getEntries())).toBeCloseTo(1.5);
  expect(estimateSessionCost(manager.getBranch())).toBeCloseTo(0.9);
});

it("restores recorded costs after reopening a compacted session", () => {
  const directory = mkdtempSync(join(tmpdir(), "insomniac-cost-"));

  try {
    const manager = SessionManager.create(directory, directory);
    const root = manager.appendMessage({ role: "user", content: "Hello", timestamp: 0 });
    manager.appendUsage("response", "p", "m", usage(0.123));
    manager.appendCompaction("Summary", root, 180, undefined, false, usage(0.2));
    const restored = SessionManager.open(manager.getSessionFile()!);
    expect(estimateSessionCost(restored.getEntries())).toBeCloseTo(0.323);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it("returns zero for an empty session and accepts recorded zero costs", () => {
  const manager = SessionManager.inMemory();
  expect(estimateSessionCost(manager.getEntries())).toBe(0);
  manager.appendUsage("free", "local", "free-model", usage(0));
  expect(estimateSessionCost(manager.getEntries())).toBe(0);
});

it.each([NaN, Infinity, -Infinity, -0.001])("marks invalid cost %s as unknown", (cost) => {
  const manager = SessionManager.inMemory();
  manager.appendUsage("valid", "p", "m", usage(1));
  manager.appendUsage("invalid", "p", "m", usage(cost));
  expect(estimateSessionCost(manager.getEntries())).toBeNull();
});

it("marks overflowing totals as unknown", () => {
  const manager = SessionManager.inMemory();
  manager.appendUsage("first", "p", "m", usage(Number.MAX_VALUE));
  manager.appendUsage("second", "p", "m", usage(Number.MAX_VALUE));
  expect(estimateSessionCost(manager.getEntries())).toBeNull();
});

it.each([
  [undefined, 0],
  [0.1, 0.1],
  [NaN, null],
] as const)("avoids copying session entries on unchanged reads with cost %s", (cost, expected) => {
  const readCost = createSessionCostReader();
  const manager = SessionManager.inMemory();

  if (cost !== undefined) manager.appendUsage("first", "p", "m", usage(cost));
  const getEntries = vi.spyOn(manager, "getEntries");
  expect(readCost(manager)).toBe(expected);
  expect(getEntries).toHaveBeenCalledTimes(1);

  for (let i = 0; i < 200; i++) expect(readCost(manager)).toBe(expected);
  expect(getEntries).toHaveBeenCalledTimes(1);
});

it.each([undefined, 42])("falls back safely when the entry count method is %s", (getEntryCount) => {
  const readCost = createSessionCostReader();
  const manager = SessionManager.inMemory();
  Object.defineProperty(manager, "getEntryCount", { value: getEntryCount });
  manager.appendUsage("first", "p", "m", usage(0.1));
  const getEntries = vi.spyOn(manager, "getEntries");
  expect(readCost(manager)).toBe(0.1);
  expect(readCost(manager)).toBe(0.1);
  manager.appendUsage("second", "p", "m", usage(0.2));
  expect(readCost(manager)).toBeCloseTo(0.3);
  expect(getEntries).toHaveBeenCalledTimes(3);
});

it.each([0, 1, 42])("uses entry arrays instead of an overridden count returning %i", (count) => {
  const readCost = createSessionCostReader();
  const manager = SessionManager.inMemory();
  const getEntryCount = vi.fn(() => count);
  Object.defineProperty(manager, "getEntryCount", { value: getEntryCount });
  manager.appendUsage("first", "p", "m", usage(0.1));
  const getEntries = vi.spyOn(manager, "getEntries");
  expect(readCost(manager)).toBe(0.1);
  expect(readCost(manager)).toBe(0.1);
  manager.appendUsage("second", "p", "m", usage(0.2));
  expect(readCost(manager)).toBeCloseTo(0.3);
  expect(getEntryCount).not.toHaveBeenCalled();
  expect(getEntries).toHaveBeenCalledTimes(3);
});

it("refreshes the cached total on appends and session replacement", () => {
  const readCost = createSessionCostReader();
  const manager = SessionManager.inMemory();
  manager.appendUsage("first", "p", "m", usage(0.1));
  expect(readCost(manager)).toBe(0.1);
  const entries = manager.getEntries();
  const total = vi.fn(() => 0.1);

  if (entries[0].type === "usage") Object.defineProperty(entries[0].usage.cost, "total", { get: total });
  expect(readCost(manager)).toBe(0.1);
  expect(total).not.toHaveBeenCalled();
  manager.appendUsage("second", "p", "m", usage(0.2));
  expect(readCost(manager)).toBeCloseTo(0.3);
  const next = SessionManager.inMemory();
  next.appendUsage("next", "p", "m", usage(1));
  next.appendUsage("next", "p", "m", usage(1));
  expect(readCost(next)).toBe(2);
  next.newSession();
  next.appendUsage("replacement", "p", "m", usage(3));
  next.appendUsage("replacement", "p", "m", usage(3));
  expect(readCost(next)).toBe(6);
});
