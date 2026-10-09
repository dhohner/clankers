import type { ContextUsage } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

export interface FooterSnapshot {
  model?: { name?: string; id: string; reasoning: boolean };
  thinkingLevel?: string;
  usage?: ContextUsage;
  cwd?: string;
  branch?: string;
  sessionName?: string;
  statuses?: readonly string[];
  ownsAssertion?: boolean;
}

function tokens(value: number): string {
  if (value < 1000) return String(Math.floor(value));
  if (value < 1000000) return `${Math.floor(value / 1000)}k`;
  return `${Math.floor(value / 100000) / 10}M`;
}

/* eslint-disable no-control-regex -- Terminal-control sanitization intentionally matches control bytes. */
function withoutTerminalControls(text: string, preserveStyling = false): string {
  return (
    text
      // OSC, DCS, SOS, PM and APC strings, including their 8-bit forms and payloads.
      .replace(/(?:\u001b[P\]X^_]|[\u0090\u0098\u009d-\u009f])[\s\S]*?(?:\u001b\\|\u009c|\u0007|$)/g, "")
      // CSI parameter/intermediate bytes and its final byte.
      .replace(
        /(?:\u001b\[|\u009b)[0-?]*[ -/]*[@-~]|\u001b[ -/]*[0-~]|[\u0000-\u001f\u007f-\u009f]/g,
        // Only 7-bit numeric SGR sequences are supported in extension statuses.
        (sequence) => (preserveStyling && /^\u001b\[[0-9;]*m$/.test(sequence) ? sequence : ""),
      )
  );
}
/* eslint-enable no-control-regex */

export function renderFooter(
  snapshot: FooterSnapshot,
  width: number,
  noColor = false,
  thinkingColor?: (text: string) => string,
): string[] {
  width = Math.max(0, Math.floor(width));
  const sanitize = (text: string, preserveStyling = false) =>
    withoutTerminalControls(text.replace(/[\r\n\t]/g, " "), preserveStyling && !noColor);
  const paint = (code: string, text: string) => {
    const clean = sanitize(text);
    return noColor ? clean : `\u001b[${code}m${clean}\u001b[0m`;
  };
  const parts: string[] = [];
  if (snapshot.model) parts.push(paint("1", snapshot.model.name || snapshot.model.id));
  if (snapshot.model?.reasoning && snapshot.thinkingLevel) {
    const level = sanitize(snapshot.thinkingLevel);
    parts.push(!noColor && thinkingColor ? thinkingColor(level) : paint("35", level));
  }
  const usage = snapshot.usage;
  if (
    usage &&
    usage.tokens !== null &&
    usage.percent !== null &&
    Number.isFinite(usage.tokens) &&
    usage.tokens >= 0 &&
    Number.isFinite(usage.percent) &&
    Number.isFinite(usage.contextWindow) &&
    usage.contextWindow > 0
  ) {
    const cells = Math.min(20, Math.max(0, usage.percent / 5));
    const full = Math.floor(cells);
    const half = full < 20 && cells - full >= 0.5 ? 1 : 0;
    const color = usage.percent < 50 ? "32" : usage.percent < 80 ? "33" : "31";
    parts.push(
      paint(color, "━".repeat(full) + "╸".repeat(half)) +
        paint("2", "─".repeat(20 - full - half)) +
        ` ${paint("2", `${tokens(usage.tokens)}/${tokens(usage.contextWindow)}`)}`,
    );
  } else {
    parts.push(paint("2", "──────────────────── --"));
  }
  const separator = paint("2", " · ");
  const rows: string[] = [];
  const pack = (segments: string[]) => {
    let row = "";
    for (const value of segments) {
      const segment = value;
      if (row && visibleWidth(row + separator + segment) > width) {
        rows.push(row);
        row = "";
      }
      row += (row ? separator : "") + truncateToWidth(segment, width);
    }
    if (row) rows.push(row);
  };
  pack(parts);
  const sleep = snapshot.ownsAssertion ? `☕ ${paint("33", "awake")}` : `💤 ${paint("2", "can sleep")}`;
  const details = rows.at(-1) ?? "";
  const gap = width - visibleWidth(details) - visibleWidth(sleep);
  if (gap >= 3) rows[rows.length - 1] = details + " ".repeat(gap) + sleep;
  else rows.push(" ".repeat(Math.max(0, width - visibleWidth(sleep))) + truncateToWidth(sleep, width));
  pack(
    [snapshot.cwd, snapshot.branch, snapshot.sessionName]
      .filter((value): value is string => Boolean(value))
      .map((value) => paint("2", value)),
  );
  pack((snapshot.statuses ?? []).map((value) => sanitize(value, true)));
  return rows.map((row) => {
    const truncated = truncateToWidth(row, width);
    return noColor ? withoutTerminalControls(truncated) : truncated;
  });
}
