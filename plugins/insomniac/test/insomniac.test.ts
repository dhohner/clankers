import { spawn, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "../scripts/statusline.sh");

// Stands in for caffeinate so the tests hold no real power assertion. It is a compiled binary
// named caffeinate, because the status line matches the executable name.
// It logs its PID, then waits until it is killed.
const STUB_CAFFEINATE_SOURCE = `#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>

int main(void) {
  FILE *log = fopen(getenv("STUB_LOG"), "a");
  fprintf(log, "%d\\n", getpid());
  fclose(log);
  for (;;) pause();
}
`;

// Plays the Claude Code process. The test runner itself descends from the Claude Code session
// that runs it, whose real caffeinate would leak into every result, so the harness first waits
// until launchd adopts it. Its only ancestors are then itself and launchd.
//   $1  child to start before the status line runs:
//       caffeinate  a caffeinate child, as Claude Code starts during a busy turn
//       decoy       a process that is not caffeinate but mentions it in its arguments
//       detached    a caffeinate adopted by launchd, as a detached `caffeinate &` ends up
//       none        no child
//   $2  direct runs the status line as the harness's child, nested runs it through sh -c
const HARNESS_SOURCE = `#!/bin/sh
while [ "$(ps -o ppid= -p $$ | tr -d ' ')" != 1 ]; do sleep 0.01; done
case $1 in
  caffeinate) "$STUB_CAFFEINATE" & child=$! ;;
  decoy) sh -c 'sleep 30; exit' caffeinate-notes.md & child=$! ;;
  detached) ("$STUB_CAFFEINATE" &) ;;
esac
case $1 in
  caffeinate | detached) until [ -s "$STUB_LOG" ]; do sleep 0.01; done ;;
  # The decoy's sh needs a moment to show its own name instead of the harness's.
  decoy) sleep 0.2 ;;
esac
case $2 in
  direct) printf '%s' "$PAYLOAD" | "$STATUSLINE" >"$OUT.tmp" 2>&1 ;;
  nested) printf '%s' "$PAYLOAD" | sh -c '"$STATUSLINE"; exit $?' >"$OUT.tmp" 2>&1 ;;
esac
echo "exit $?" >>"$OUT.tmp"
[ -n "\${child:-}" ] && kill "$child"
mv "$OUT.tmp" "$OUT"
`;

// Claude Code sends more fields than these, and the status line ignores the rest.
function session(fields: object = {}): string {
  return JSON.stringify({ session_id: "session-a", ...fields });
}

// Claude Code computes used_percentage from the input tokens and the window size.
function contextUsed(percentage: number | null, windowSize = 200000): object {
  const inputTokens = percentage === null ? 0 : (windowSize * percentage) / 100;
  return { context_window: { context_window_size: windowSize, total_input_tokens: inputTokens, used_percentage: percentage } };
}

const ESC = "\u001b";
const ANSI = new RegExp(`${ESC}\\[[0-9;]*m`, "g");

function plain(text: string): string {
  return text.replace(ANSI, "");
}

function painted(code: string, text: string): string {
  return `${ESC}[${code}m${text}${ESC}[0m`;
}

let buildDir: string;
let stubBinary: string;
let root: string;
let stubLog: string;

function stubPids(): number[] {
  if (!existsSync(stubLog)) return [];
  return readFileSync(stubLog, "utf8").trim().split("\n").filter(Boolean).map(Number);
}

async function waitFor(condition: () => boolean): Promise<void> {
  const deadline = Date.now() + 3000;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("condition not met within 3 seconds");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

type RunOptions = { via?: "direct" | "nested"; env?: Record<string, string> };

// Returns the output with its ANSI colors removed as text, and unchanged as raw.
async function runStatusLine(child: "caffeinate" | "decoy" | "detached" | "none", payload = session(), { via = "direct", env = {} }: RunOptions = {}) {
  const out = join(root, "out");
  // The outer sh exits at once, which leaves the harness to launchd.
  spawn("sh", ["-c", '"$HARNESS" "$1" "$2" </dev/null >/dev/null 2>&1 &', "sh", child, via], {
    stdio: "ignore",
    env: {
      PATH: process.env.PATH,
      HARNESS: join(buildDir, "harness.sh"),
      STATUSLINE: SCRIPT,
      STUB_CAFFEINATE: stubBinary,
      STUB_LOG: stubLog,
      PAYLOAD: payload,
      OUT: out,
      ...env,
    },
  });
  await waitFor(() => existsSync(out));
  const lines = readFileSync(out, "utf8").trimEnd().split("\n");
  const raw = lines.slice(0, -1).join("\n");
  return { text: plain(raw), raw, status: Number(lines.at(-1)!.replace("exit ", "")) };
}

beforeAll(() => {
  buildDir = mkdtempSync(join(tmpdir(), "insomniac-stub-"));
  stubBinary = join(buildDir, "caffeinate");
  writeFileSync(`${stubBinary}.c`, STUB_CAFFEINATE_SOURCE);
  const build = spawnSync("cc", ["-o", stubBinary, `${stubBinary}.c`], { encoding: "utf8" });
  if (build.status !== 0) throw new Error(`building the caffeinate stub needs a C compiler: ${build.stderr}`);
  writeFileSync(join(buildDir, "harness.sh"), HARNESS_SOURCE);
  chmodSync(join(buildDir, "harness.sh"), 0o755);
});

afterAll(() => {
  rmSync(buildDir, { recursive: true, force: true });
});

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "insomniac-test-"));
  stubLog = join(root, "stub.log");
});

afterEach(() => {
  for (const pid of stubPids()) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // Already gone.
    }
  }
  rmSync(root, { recursive: true, force: true });
});

it("shows that the Mac stays awake while the Claude Code process runs caffeinate", async () => {
  const result = await runStatusLine("caffeinate");

  expect(result).toMatchObject({ text: "☕ awake", status: 0 });
});

it("finds caffeinate when Claude Code runs the status line through a shell", async () => {
  const result = await runStatusLine("caffeinate", session(), { via: "nested" });

  expect(result).toMatchObject({ text: "☕ awake", status: 0 });
});

it("shows that the Mac can sleep when no caffeinate runs", async () => {
  const result = await runStatusLine("none");

  expect(result).toMatchObject({ text: "💤 can sleep", status: 0 });
});

it("ignores a process that is not caffeinate even when its arguments mention caffeinate", async () => {
  const result = await runStatusLine("decoy");

  expect(result).toMatchObject({ text: "💤 can sleep", status: 0 });
});

// launchd adopts every detached process, so its caffeinate children belong to other programs.
it("ignores a detached caffeinate that belongs to another program", async () => {
  const result = await runStatusLine("detached");

  expect(stubPids()).toHaveLength(1);
  expect(result).toMatchObject({ text: "💤 can sleep", status: 0 });
});

it("shows the model, effort level, context usage, and sleep state", async () => {
  const result = await runStatusLine(
    "caffeinate",
    session({ model: { id: "claude-opus-5", display_name: "Opus 5" }, effort: { level: "high" }, ...contextUsed(38) }),
  );

  expect(result).toMatchObject({ text: "Opus 5 · high · ━━━━━━━╸──────────── 38% 76k/200k · ☕ awake", status: 0 });
});

// Each of the 20 cells stands for 5% of the context window, and a half cell for at least 2.5% more.
it.each([
  [0, "──────────────────── 0% 0/200k"],
  [2, "──────────────────── 2% 4k/200k"],
  [3, "╸─────────────────── 3% 6k/200k"],
  [5, "━─────────────────── 5% 10k/200k"],
  [99, "━━━━━━━━━━━━━━━━━━━╸ 99% 198k/200k"],
  [100, "━━━━━━━━━━━━━━━━━━━━ 100% 200k/200k"],
])("draws %i percent context usage as %s", async (percentage, segment) => {
  const result = await runStatusLine("none", session(contextUsed(percentage)));

  expect(result.text).toBe(`${segment} · 💤 can sleep`);
});

it.each([
  [999, 1000, "999/1k"],
  [152999, 200000, "152k/200k"],
  [150000, 1000000, "150k/1M"],
  [1500000, 2000000, "1.5M/2M"],
  // Rounding would overstate usage, so the count is cut off at one decimal.
  [1990000, 2000000, "1.9M/2M"],
])("abbreviates %i of %i tokens as %s", async (inputTokens, windowSize, tokens) => {
  const payload = session({ context_window: { context_window_size: windowSize, total_input_tokens: inputTokens, used_percentage: 20 } });

  const result = await runStatusLine("none", payload);

  expect(result.text).toBe(`━━━━──────────────── 20% ${tokens} · 💤 can sleep`);
});

it("shows an empty bar without numbers before the first response reports usage", async () => {
  const result = await runStatusLine("none", session(contextUsed(null)));

  expect(result.text).toBe("──────────────────── -- · 💤 can sleep");
});

// The token count next to the bar already shows the window size.
it("drops the context size note from the model name", async () => {
  const result = await runStatusLine("none", session({ model: { id: "claude-opus-5[1m]", display_name: "Opus 5 (1M context)" }, ...contextUsed(15, 1000000) }));

  expect(result.text).toBe("Opus 5 · ━━━───────────────── 15% 150k/1M · 💤 can sleep");
});

it("falls back to the model ID when the display name is missing", async () => {
  const result = await runStatusLine("none", session({ model: { id: "claude-opus-5" } }));

  expect(result.text).toBe("claude-opus-5 · 💤 can sleep");
});

it("leaves out the effort level for a model without effort support", async () => {
  const result = await runStatusLine("none", session({ model: { id: "claude-haiku-4-5-20251001", display_name: "Haiku 4.5" }, ...contextUsed(12) }));

  expect(result.text).toBe("Haiku 4.5 · ━━────────────────── 12% 24k/200k · 💤 can sleep");
});

it("still shows the sleep state when the session JSON is invalid", async () => {
  const result = await runStatusLine("caffeinate", "not json");

  expect(result).toMatchObject({ text: "☕ awake", status: 0 });
});

it("colors each segment with the terminal theme's standard colors", async () => {
  const result = await runStatusLine(
    "caffeinate",
    session({ model: { id: "claude-opus-5", display_name: "Opus 5" }, effort: { level: "high" }, ...contextUsed(38) }),
  );

  const separator = painted("2", " · ");
  expect(result.raw).toBe(
    painted("1", "Opus 5") +
      separator +
      painted("35", "high") +
      separator +
      painted("32", "━━━━━━━╸") +
      painted("2", "────────────") +
      " " +
      painted("32", "38%") +
      " " +
      painted("2", "76k/200k") +
      separator +
      "☕ " +
      painted("33", "awake"),
  );
});

it("dims the sleep state while the Mac can sleep", async () => {
  const result = await runStatusLine("none");

  expect(result.raw).toBe(`💤 ${painted("2", "can sleep")}`);
});

// The bar turns yellow at half the context window and red when compaction draws near.
it.each([
  [49, "32"],
  [50, "33"],
  [79, "33"],
  [80, "31"],
])("colors %i percent context usage with ANSI color %s", async (percentage, color) => {
  const result = await runStatusLine("none", session(contextUsed(percentage)));

  expect(result.raw).toContain(painted(color, `${percentage}%`));
});

it("prints no colors when NO_COLOR is set", async () => {
  const result = await runStatusLine("caffeinate", session({ model: { id: "claude-opus-5", display_name: "Opus 5" }, ...contextUsed(38) }), {
    env: { NO_COLOR: "1" },
  });

  expect(result.raw).toBe("Opus 5 · ━━━━━━━╸──────────── 38% 76k/200k · ☕ awake");
});

// Terminals draw these emoji two columns wide.
function columns(text: string): number {
  return [...text].length + (text.match(/[☕💤]/gu)?.length ?? 0);
}

describe("with the terminal width in COLUMNS", () => {
  const payload = session({ model: { id: "claude-opus-5", display_name: "Opus 5" }, effort: { level: "high" }, ...contextUsed(38) });
  const details = "Opus 5 · high · ━━━━━━━╸──────────── 38% 76k/200k";

  // Claude Code indents the status line, so the line stops 4 columns short of the terminal width.
  it("moves the sleep state to the right edge", async () => {
    const result = await runStatusLine("caffeinate", payload, { env: { COLUMNS: "100" } });

    expect(result.text).toMatch(new RegExp(`^${details} +☕ awake$`));
    expect(columns(result.text)).toBe(96);
  });

  it("right-aligns the sleep state alone when the session JSON is invalid", async () => {
    const result = await runStatusLine("none", "not json", { env: { COLUMNS: "40" } });

    expect(result.text).toBe(`${" ".repeat(24)}💤 can sleep`);
  });

  // The line needs the details, a gap as wide as the separator, the sleep state, and the margin.
  it("keeps the separator when the gap would be narrower than the separator", async () => {
    const result = await runStatusLine("caffeinate", payload, { env: { COLUMNS: String(columns(details) + 2 + 8 + 4) } });

    expect(result.text).toBe(`${details} · ☕ awake`);
  });

  it("right-aligns once the gap is as wide as the separator", async () => {
    const result = await runStatusLine("caffeinate", payload, { env: { COLUMNS: String(columns(details) + 3 + 8 + 4) } });

    expect(result.text).toBe(`${details}   ☕ awake`);
  });

  it("keeps the separator when COLUMNS is not a number", async () => {
    const result = await runStatusLine("caffeinate", payload, { env: { COLUMNS: "wide" } });

    expect(result.text).toBe(`${details} · ☕ awake`);
  });
});
