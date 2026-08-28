import { lstat, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { decideToolCall, type ToolCallDecision } from "../src/application/decide-tool-call.js";
import type { DecisionPorts } from "../src/application/ports.js";
import { allSystemExecutables } from "../src/infrastructure/node/executable-resolver.js";
import { inspectPath } from "../src/infrastructure/node/path-presence.js";
import { allInsideTemporaryRoot } from "../src/infrastructure/node/temporary-root.js";

type Expectation = "allow" | "gate" | "pending";

type CorpusEntry = {
  /** The bash tool call text, exactly as an agent would send it. Never executed. */
  command: string;
  expect: Expectation;
  /** Required on a `pending` entry, forbidden elsewhere: the policy change that promotes it to `allow`. */
  promotedBy?: string;
};

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const corpus: CorpusEntry[] = JSON.parse(readFileSync(join(PACKAGE_ROOT, "test/fixtures/command-corpus.json"), "utf8"));

// A test name has to stay on one line for a failure to be readable, and a heredoc entry carries newlines.
const cases = corpus.map((entry) => ({ ...entry, label: entry.command.replaceAll("\n", "\\n") }));

// The corpus records what the guard decides, so no corpus command may reach a model or a network. Refusing
// the assessment also short-circuits the approval port, which keeps a gated decision on one deterministic
// path regardless of the entry.
const ASSESSMENT_REFUSAL = "corpus harness: no assessor is available";

// The inventory the corpus is measured against. The checkout and `mv` entries hinge on a host check that reads
// the filesystem, whether an operand names an existing file or whether the last `mv` operand is a directory,
// so an entry is only reproducible when the working directory holds exactly these paths. `main` and `HEAD~1`
// are absent on purpose so their checkout entries allow; `dist-backup` and `d.ts` are absent so their entries
// stay gated.
const WORKSPACE_DIRECTORIES = ["node_modules", "dist", "dist/cache", "packages/a/node_modules", "src"];
const WORKSPACE_FILES = ["dist/app.js", "src/a.ts", "README.md", "a.ts", "b.ts", "c.ts"];

let workspace: string;

/**
 * The real host ports, so the temporary-root proof, the executable resolution, and the path inspection decide
 * the entry, paired with recording stubs for the two ports that would leave the process.
 */
function makeRecordingPorts(): { ports: DecisionPorts; calls: { assess: number; approval: number } } {
  const calls = { assess: 0, approval: 0 };
  return {
    calls,
    ports: {
      resolveExecutables: allSystemExecutables,
      verifyTemporaryPaths: allInsideTemporaryRoot,
      inspectPath,
      assessCommand: async () => {
        calls.assess += 1;
        return { ok: false, reason: ASSESSMENT_REFUSAL };
      },
      requestApproval: async () => {
        calls.approval += 1;
        return false;
      },
    },
  };
}

async function decide(command: string): Promise<{ decision: ToolCallDecision; assess: number; approval: number }> {
  const { ports, calls } = makeRecordingPorts();
  const decision = await decideToolCall(
    // `approvalAvailable` is true so that a gated command reaches the assessment port, which is what
    // distinguishes it from a credential block that never gets there.
    { call: { kind: "bash", command }, workingDirectory: workspace, approvalAvailable: true },
    ports,
  );
  return { decision, assess: calls.assess, approval: calls.approval };
}

beforeAll(async () => {
  // Under the package, not under `/tmp`: a working directory inside a temporary root makes the deletion
  // proof succeed for every target, which would turn every `rm` entry into an allow and erase the corpus
  // baseline. `mkdtemp` gives each run its own directory, so two runs in the same checkout share no path and
  // neither can remove the other's; `.gitignore` covers the prefix.
  workspace = await mkdtemp(join(PACKAGE_ROOT, ".corpus-workspace-"));
  for (const directory of WORKSPACE_DIRECTORIES) await mkdir(join(workspace, directory), { recursive: true });
  await Promise.all(WORKSPACE_FILES.map((file) => writeFile(join(workspace, file), "")));
});

afterAll(async () => {
  // The suite decides commands, it never runs them, and an entry that had run would have deleted or moved
  // part of the workspace. Checking here rather than in a test keeps it after every entry, which the
  // shuffled test order inside a file would otherwise not guarantee.
  const expected = [...WORKSPACE_DIRECTORIES, ...WORKSPACE_FILES];
  const survivors = await Promise.all(
    expected.map(async (entry) =>
      (await lstat(join(workspace, entry)).catch(() => undefined)) ? entry : `missing: ${entry}`,
    ),
  );
  try {
    expect(survivors, "a corpus command was executed").toEqual(expected);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

describe("command corpus", () => {
  it.each(cases)("$expect: $label", async (entry) => {
    const { decision, assess, approval } = await decide(entry.command);

    if (entry.expect === "allow") {
      expect(decision, `${entry.label} must run unattended`).toEqual({ kind: "allow" });
      expect(assess + approval, `${entry.label} must reach no port`).toBe(0);
      return;
    }

    // A `pending` entry asserts today's wrong behavior on purpose: the named policy fix makes this fail,
    // and the failure is the instruction to promote the entry.
    const message =
      entry.expect === "gate"
        ? `${entry.label} must keep asking for approval`
        : `${entry.label} now allows; promote it to "allow" in test/fixtures/command-corpus.json and drop ` +
          `its promotedBy note for ${entry.promotedBy}`;
    expect(decision.kind, message).toBe("block");
    expect(assess, message).toBeGreaterThan(0);
  });
});

describe("command corpus shape", () => {
  it("gives every entry exactly one well-formed expectation", () => {
    const commands = corpus.map((entry) => entry.command);
    expect(new Set(commands).size, "a duplicate command hides one of its two expectations").toBe(commands.length);
    for (const entry of corpus) {
      expect(["allow", "gate", "pending"], entry.command).toContain(entry.expect);
      expect(entry.command.length, "an empty command decides nothing").toBeGreaterThan(0);
    }
  });

  it("keeps a promotion note on every pending entry and nowhere else", () => {
    const pending = corpus.filter((entry) => entry.expect === "pending");
    // Deleting a `pending` marker without a policy change has to fail here rather than pass quietly.
    expect(pending.length, "the accepted requirements leave four commands that are wrong today").toBe(4);
    for (const entry of corpus) {
      if (entry.expect === "pending") {
        expect(entry.promotedBy ?? "", `${entry.command} must name the policy change that promotes it`).not.toBe("");
      } else {
        expect(entry.promotedBy, `${entry.command} is not pending, so it carries no promotion note`).toBeUndefined();
      }
    }
  });
});
