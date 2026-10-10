import { TuiMainScreen, visibleWidth, stripTerminalSequences, type Terminal } from "@earendil-works/pi-tui";
import { describe, expect, it, vi } from "vitest";
import { renderFooter } from "../../src/pi/render-footer.ts";

const plain = (rows: string[]) => rows.map(stripTerminalSequences).join("\n");

const noop = () => {};

describe("Pi footer", () => {
  it.each([0, 1, 8, 40, 100, 160])("fits the sleep state and output style at width %i", (width) => {
    const snapshot = {
      model: { id: "gpt", name: "GPT-6.1 Sol", reasoning: true },
      outputStyle: "unslop",
      thinkingLevel: "medium",
    };

    const rows = renderFooter(snapshot, width);
    expect(rows.every((row) => visibleWidth(row) <= width)).toBe(true);

    if (width >= 100) {
      expect(plain(rows)).toContain("GPT-6.1 Sol · medium ·");
      expect(stripTerminalSequences(rows[0]).endsWith("💤 can sleep · [unslop]")).toBe(true);
      expect(visibleWidth(rows[0])).toBe(width);
    }

    if (width === 40) {
      const lastRow = rows.at(-1);

      if (lastRow === undefined) throw new Error("Expected a footer row");
      expect(stripTerminalSequences(lastRow).endsWith("💤 can sleep · [unslop]")).toBe(true);
      expect(visibleWidth(lastRow)).toBe(width);
    }

    expect(renderFooter(snapshot, width, true).join("\n")).toBe(plain(rows));
  });

  it("places the style after awake on the right", () => {
    const rows = renderFooter(
      { model: { id: "gpt", reasoning: false }, outputStyle: "unslop", ownsAssertion: true },
      100,
    );

    expect(stripTerminalSequences(rows[0]).endsWith("☕ awake · [unslop]")).toBe(true);
    expect(visibleWidth(rows[0])).toBe(100);
  });

  it("sanitizes and colors the style and honors NO_COLOR", () => {
    const accentColor = vi.fn((text: string) => `\u001b[38;5;99m${text}\u001b[39m`);

    const snapshot = {
      model: { id: "gpt", reasoning: false },
      outputStyle: "un\u001b]52;c;payload\u0007slop\n",
    };

    const rows = renderFooter(snapshot, 100, false, undefined, accentColor);
    expect(rows.join("\n")).toContain("[\u001b[38;5;99munslop \u001b[39m]");
    expect(rows.join("\n")).not.toContain("payload");
    expect(renderFooter(snapshot, 100, true, undefined, accentColor).join("\n")).toBe(plain(rows));
  });

  it.each([
    [0, "~$0.000"],
    [0.0004, "~$0.000"],
    [0.0006, "~$0.001"],
    [1.2346, "~$1.235"],
    [1234.5, "~$1234.500"],
    [null, "~$--"],
    [NaN, "~$--"],
    [Infinity, "~$--"],
    [-1, "~$--"],
  ])("renders session estimate %s as a dim segment %s", (sessionCost, expected) => {
    const snapshot = { model: { id: "Opus", reasoning: false }, sessionCost };
    const rows = renderFooter(snapshot, 100);
    expect(plain(rows)).toContain(`Opus · ──────────────────── -- · ${expected}`);
    expect(rows.join("\n")).toContain(`\u001b[2m${expected}\u001b[0m`);
    const unstyled = renderFooter(snapshot, 100, true);
    expect(unstyled.join("\n")).toBe(plain(unstyled));
  });

  it.each([0, 1, 2, 8, 20, 40, 60, 100])("fits the price and sleep state at width %i", (width) => {
    const rows = renderFooter({ model: { id: "Opus", reasoning: false }, sessionCost: 1.234 }, width);
    expect(rows.every((row) => visibleWidth(row) <= width)).toBe(true);

    if (width >= 40) {
      expect(plain(rows)).toContain("~$1.234");
      expect(
        rows.some((row) => stripTerminalSequences(row).endsWith("💤 can sleep") && visibleWidth(row) === width),
      ).toBe(true);
    }
  });

  it.each([0, 1, 2, 8, 40, 100])("sanitizes themed thinking and fits width %i", (width) => {
    const thinkingColor = vi.fn((text: string) => `\u001b[38;2;10;20;30m${text}\u001b[39m`);

    const snapshot = {
      model: { id: "model", reasoning: true },
      thinkingLevel: "hi\u001b]52;c;payload\u0007gh",
    };

    const rows = renderFooter(snapshot, width, false, thinkingColor);
    expect(thinkingColor).toHaveBeenCalledWith("high");
    expect(rows.join("\n")).not.toContain("payload");

    for (const row of rows) expect(visibleWidth(row)).toBeLessThanOrEqual(width);
    thinkingColor.mockClear();
    const unstyled = renderFooter(snapshot, width, true, thinkingColor);
    expect(thinkingColor).not.toHaveBeenCalled();
    expect(unstyled.join("\n")).toBe(plain(unstyled));
  });

  it.each([
    "\u001b]52;c;cGF5bG9hZA==\u0007",
    "\u009d52;c;cGF5bG9hZA==\u009c",
    "\u001b]52;c;cGF5bG9hZA==\u001b\\",
    "\u001b[2J",
    "\u001bPpayload\u001b\\",
  ])("removes supplied controls %j from actual terminal output with colors enabled", (sequence) => {
    const text = `prefix${sequence}suffix`;
    const write = vi.fn();

    const terminal: Terminal = {
      columns: 160,
      rows: 24,
      kittyProtocolActive: false,
      start: noop,
      stop: noop,
      drainInput: async () => {},
      write,
      moveBy: noop,
      hideCursor: noop,
      showCursor: noop,
      clearLine: noop,
      clearFromCursor: noop,
      clearScreen: noop,
      setTitle: noop,
      setProgress: noop,
    };

    const tui = new TuiMainScreen(terminal);
    tui.addChild({
      render: (width) =>
        renderFooter(
          {
            model: { name: text, id: text, reasoning: true },
            thinkingLevel: text,
            cwd: text,
            branch: text,
            sessionName: text,
            statuses: [text],
          },
          width,
        ),
      invalidate: noop,
    });
    tui.renderNow();
    const output = write.mock.calls.map(([data]) => data).join("");
    expect(output).toContain("\u001b[1mprefixsuffix\u001b[0m");
    expect(output).not.toContain(sequence);
    expect(output).not.toContain("payload");
    expect(output).not.toContain("cGF5bG9hZA==");
    expect(output.match(/prefixsuffix/g)).toHaveLength(6);
  });

  it("allows numeric SGR styling only in extension statuses", () => {
    const styled = "\u001b[1;38;2;10;20;30mactive\u001b[0m";

    const rows = renderFooter(
      {
        model: { name: styled, id: "model", reasoning: false },
        statuses: [styled + "\u001b[?25l\u001b[>4m\u001b[2J"],
      },
      100,
    );

    expect(rows[0]).toContain("\u001b[1mactive\u001b[0m");
    expect(rows.at(-1)).toBe(styled);
    expect(renderFooter({ statuses: [styled] }, 100, true).at(-1)).toBe("active");
  });
  // NO_COLOR must remove non-SGR terminal controls, including control-string payloads.
  it.each([
    "\u001b(0",
    "\u001bPdata\u001b\\",
    "\u001bZ",
    "\u009b31m",
    "\u001b]8;;https://example.test\u0007",
    "\u0090data\u009c",
  ])("strips terminal control %j in NO_COLOR before measuring rows", (sequence) => {
    const text = `prefix${sequence}suffix`;

    const rows = renderFooter(
      {
        model: { name: text, id: "model", reasoning: true },
        thinkingLevel: text,
        cwd: text,
        branch: text,
        sessionName: text,
        statuses: [text],
      },
      100,
      true,
    );

    expect(rows.at(-1)).toBe("prefixsuffix");
    // eslint-disable-next-line no-control-regex -- Prove terminal control bytes are absent.
    expect(rows.every((row) => !/[\u001b\u0080-\u009f]/u.test(row))).toBe(true);
  });
  // Embedded row controls must not create physical rows the TUI never measured.
  it.each(["\r", "\n", "\t"])("normalizes embedded %j before measuring every supplied segment", (control) => {
    for (const width of [30, 100]) {
      const rows = renderFooter(
        {
          model: { name: `model${control}name`, id: "model", reasoning: true },
          thinkingLevel: `thinking${control}high`,
          cwd: `directory${control}path`,
          branch: `branch${control}next`,
          sessionName: `session${control}name`,
          statuses: [`status${control}active`],
        },
        width,
      );

      expect(rows.every((row) => !/[\r\n\t]/u.test(row) && visibleWidth(row) <= width)).toBe(true);

      for (const expected of [
        "model name",
        "thinking high",
        "directory path",
        "branch next",
        "session name",
        "status active",
      ]) {
        expect(plain(rows)).toContain(expected);
      }

      const fallback = renderFooter({ model: { id: `fallback${control}id`, reasoning: false } }, width);
      expect(plain(fallback)).toContain("fallback id");
    }
  });
  // A NO_COLOR render must also remove incoming extension color escapes.
  it("honors NO_COLOR across all segments and supplied extension statuses", () => {
    const rows = renderFooter(
      {
        model: { name: "Opus", id: "opus", reasoning: true },
        thinkingLevel: "high",
        statuses: ["\u001b[31mguard active\u001b[0m"],
      },
      100,
      true,
    );

    expect(rows.join("\n")).not.toContain("\u001b");
    expect(plain(rows)).toContain("guard active");
  });
  it.each([0, 1, 2, 8, 40])("keeps truncated NO_COLOR rows free of controls at width %i", (width) => {
    const long = "模型 🧠 long segment ".repeat(15);

    const rows = renderFooter(
      {
        model: { name: long, id: "model", reasoning: true },
        thinkingLevel: long,
        cwd: long,
        branch: long,
        sessionName: long,
        statuses: [`\u001b[31m${long}\u001b[0m`],
      },
      width,
      true,
    );

    expect(rows.length).toBeGreaterThan(0);

    for (const row of rows) {
      // eslint-disable-next-line no-control-regex -- Completed NO_COLOR rows must contain no terminal controls.
      expect(row).not.toMatch(/[\u0000-\u001f\u007f-\u009f]/u);
      expect(visibleWidth(row)).toBeLessThanOrEqual(width);
    }
  });
  // Dropping auxiliary data or counting emoji/ANSI as single columns hides metadata or overflows.
  it.each([0, 1, 2, 8, 12, 20, 40, 100, 160])(
    "keeps every row within %i columns and retains fitting information",
    (width) => {
      const rows = renderFooter(
        {
          model: { name: "模型 🧠 ".repeat(15), id: "model", reasoning: true },
          thinkingLevel: "high",
          cwd: "/code/模型",
          branch: "feat/🧠",
          sessionName: "Review",
          statuses: ["guard: active", "style: concise"],
        },
        width,
      );

      expect(rows.every((row) => visibleWidth(row) <= width)).toBe(true);

      if (width >= 40) {
        expect(plain(rows)).toContain("/code/模型 · feat/🧠 · Review");
        expect(plain(rows)).toContain("guard: active · style: concise");
        expect(plain(rows)).toContain("──────────────────── --");
        expect(
          rows.some((row) => stripTerminalSequences(row).endsWith("💤 can sleep") && visibleWidth(row) === width),
        ).toBe(true);
      }
    },
  );
  // Treating missing or nonfinite data as zero fabricates context usage.
  it.each([
    undefined,
    { tokens: null, percent: 25, contextWindow: 200000 },
    { tokens: 50000, percent: null, contextWindow: 200000 },
    { tokens: NaN, percent: 25, contextWindow: 200000 },
    { tokens: Infinity, percent: 25, contextWindow: 200000 },
    { tokens: -1, percent: 25, contextWindow: 200000 },
    { tokens: 50000, percent: Infinity, contextWindow: 200000 },
    { tokens: 50000, percent: 25, contextWindow: 0 },
  ])("shows unknown usage without fabricating counts: %j", (usage) => {
    expect(plain(renderFooter({ usage }, 100))).toMatch(/^──────────────────── -- +💤 can sleep$/u);
  });
  // Rounding up or forcing a k suffix overstates token usage.
  it.each([
    [0, 200000, "0/200k"],
    [999, 1000, "999/1k"],
    [152999, 200000, "152k/200k"],
    [150000, 1000000, "150k/1M"],
    [1990000, 2000000, "1.9M/2M"],
  ])("keeps compact token notation for %i/%i", (tokens, contextWindow, expected) => {
    expect(plain(renderFooter({ usage: { tokens, contextWindow, percent: 20 } }, 100))).toContain(expected);
  });
  it.each([
    [3.7349264705882352, "╸───────────────────", "32"],
    [2.4999, "────────────────────", "32"],
    [49.9999, "━━━━━━━━━╸──────────", "33"],
  ])("uses %s%% only for the bar and color without displaying a percentage", (percent, bar, color) => {
    const rows = renderFooter({ usage: { tokens: 10000, contextWindow: 272000, percent } }, 100);
    expect(plain(rows)).toContain(`${bar} 10k/272k`);
    expect(plain(rows)).not.toContain("%");
    expect(rows.join("\n")).toContain(`\u001b[2m10k/272k\u001b[0m`);
    expect(rows.join("\n")).toContain(`\u001b[${color}m${bar.replace(/─/g, "")}\u001b[0m`);
  });
  // Wrong rounding, clamping, thresholds, or cumulative totals change these literal outputs.
  it.each([
    [0, "────────────────────", "32"],
    [2.49, "────────────────────", "32"],
    [2.5, "╸───────────────────", "32"],
    [4.99, "╸───────────────────", "32"],
    [5, "━───────────────────", "32"],
    [24.99, "━━━━╸───────────────", "32"],
    [25, "━━━━━───────────────", "33"],
    [49.99, "━━━━━━━━━╸──────────", "33"],
    [50, "━━━━━━━━━━──────────", "38;5;208"],
    [74.99, "━━━━━━━━━━━━━━╸─────", "38;5;208"],
    [75, "━━━━━━━━━━━━━━━─────", "31"],
    [79.99, "━━━━━━━━━━━━━━━╸────", "31"],
    [80, "━━━━━━━━━━━━━━━━────", "31"],
    [100, "━━━━━━━━━━━━━━━━━━━━", "31"],
    [105, "━━━━━━━━━━━━━━━━━━━━", "31"],
    [-5, "────────────────────", "32"],
  ])("renders authoritative %s%% in a bounded bar with color %s", (percent, bar, color) => {
    const rows = renderFooter({ usage: { tokens: 76000, contextWindow: 200000, percent } }, 100);
    expect(plain(rows)).toContain(`${bar} 76k/200k`);
    expect(plain(rows)).not.toContain("%");
    expect(rows.join("\n")).toContain(`\u001b[2m76k/200k\u001b[0m`);
    expect(rows.join("\n")).toContain(`\u001b[${color}m${bar.replace(/─/g, "")}\u001b[0m`);
  });
  it.each([25, 50, 75, 100])("fits colored usage at %i%% and honors NO_COLOR", (percent) => {
    const snapshot = { usage: { tokens: percent * 2000, contextWindow: 200000, percent } };

    for (const width of [0, 1, 8, 20, 40, 100]) {
      const rows = renderFooter(snapshot, width);
      expect(rows.every((row) => visibleWidth(row) <= width)).toBe(true);
      const unstyled = renderFooter(snapshot, width, true);
      expect(unstyled.join("\n")).toBe(plain(unstyled));
      expect(plain(unstyled)).toBe(plain(rows));
    }
  });
  // Removing initial unknown usage or the idle state hides the session's real state.
  it("shows the current model, thinking, unknown context, and idle sleep state", () => {
    const rows = renderFooter({ model: { name: "Opus 5", id: "opus", reasoning: true }, thinkingLevel: "high" }, 100);
    expect(plain(rows)).toMatch(/^Opus 5 · high · ──────────────────── -- +💤 can sleep$/u);
    expect(visibleWidth(rows[0]!)).toBe(100);
    expect(rows[0]).toContain("\u001b[1mOpus 5\u001b[0m");
    expect(rows[0]).toContain("\u001b[35mhigh\u001b[0m");
  });
});
