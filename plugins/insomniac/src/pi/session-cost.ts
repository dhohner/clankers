import { SessionManager, type ExtensionContext, type SessionEntry } from "@earendil-works/pi-coding-agent";

export function estimateSessionCost(entries: readonly SessionEntry[]): number | null {
  let total = 0;

  for (const entry of entries) {
    const usage =
      entry.type === "usage" || entry.type === "compaction" || entry.type === "branch_summary"
        ? entry.usage
        : entry.type === "message" && (entry.message.role === "assistant" || entry.message.role === "toolResult")
          ? entry.message.usage
          : undefined;

    if (!usage) continue;
    const cost = usage.cost?.total;

    if (!Number.isFinite(cost) || cost < 0) return null;
    total += cost;
  }

  return Number.isFinite(total) ? total : null;
}

export function createSessionCostReader(): (manager: ExtensionContext["sessionManager"]) => number | null {
  let cached:
    | {
        manager: ExtensionContext["sessionManager"];
        sessionId: string;
        entryCount: number;
        cost: number | null;
      }
    | undefined;

  return (manager) => {
    const sessionId = manager.getSessionId();
    let entries: SessionEntry[] | undefined;

    // The readonly host contract omits counts; only the native implementation guarantees the cache key matches entries.
    const entryCount =
      manager instanceof SessionManager && manager.getEntryCount === SessionManager.prototype.getEntryCount
        ? manager.getEntryCount()
        : (entries = manager.getEntries()).length;

    // Session entries are append-only; changing branches does not change the cumulative cost.
    if (cached?.manager === manager && cached.sessionId === sessionId && cached.entryCount === entryCount) {
      return cached.cost;
    }

    entries ??= manager.getEntries();
    const cost = estimateSessionCost(entries);
    cached = { manager, sessionId, entryCount: entries.length, cost };

    return cost;
  };
}
