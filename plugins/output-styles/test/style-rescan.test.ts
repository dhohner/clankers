import { rm } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { STYLES_DIR_NAME } from "../lib/extension.js";
import {
  agentDir,
  CHAINED_PROMPT,
  CONFIG_DIR_NAME,
  createHarness,
  cwd,
  styleFile,
  styleStatus,
  writeStyle,
} from "./support/extension-harness.js";

// File modes do not deny listing reliably on every OS or for a privileged user, so the listing
// failure is injected instead of provoked through the filesystem, mirroring discovery.test.ts.
// vi.mock and vi.hoisted are hoisted per test file, so this block cannot move into a shared module.
const listFailures = vi.hoisted(() => ({ path: undefined as string | undefined }));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    readdir: (path: Parameters<typeof actual.readdir>[0], ...rest: unknown[]) =>
      String(path) === listFailures.path
        ? Promise.reject(Object.assign(new Error("EACCES: permission denied"), { code: "EACCES" }))
        : (actual.readdir as (...args: unknown[]) => unknown)(path, ...rest),
  };
});

afterEach(() => {
  listFailures.path = undefined;
});

describe("rescan on /output-style invocation", () => {
  const terse = () => styleFile("One-line answers.", "Answer in one line.");

  it("offers a style file added after session start in the selector", async () => {
    const harness = createHarness();
    await harness.start();

    await writeStyle(join(agentDir, STYLES_DIR_NAME), "terse.md", terse());
    harness.answerSelect(undefined);
    await harness.runCommand("");

    expect(harness.selectCalls[0]?.options).toContain("terse - One-line answers. [user]");
  });

  it("activates a style file added after session start through the named argument", async () => {
    const harness = createHarness();
    await harness.start();

    await writeStyle(join(agentDir, STYLES_DIR_NAME), "terse.md", terse());
    await harness.runCommand("terse");

    expect(harness.status()).toBe(styleStatus("terse"));
    expect(await harness.turn()).toBe(`${CHAINED_PROMPT}\n\nAnswer in one line.`);
  });

  it("keeps the previous list and reports on every invocation when a listable directory becomes unlistable", async () => {
    const userStyles = join(agentDir, STYLES_DIR_NAME);
    await writeStyle(userStyles, "terse.md", terse());
    const harness = createHarness();
    await harness.start();
    const keptList = {
      message: `Output styles keep the previous list: ${userStyles} (cannot list directory: EACCES: permission denied)`,
      level: "warning",
    };

    listFailures.path = userStyles;
    harness.answerSelect(undefined);
    await harness.runCommand("");

    expect(harness.selectCalls[0]?.options).toContain("terse - One-line answers. [user]");
    expect(harness.notifications).toEqual([keptList]);

    await harness.runCommand("terse");

    expect(harness.status()).toBe(styleStatus("terse"));
    expect(harness.notifications).toEqual([
      keptList,
      keptList,
      { message: 'Output style "terse" is active from the next turn on.', level: "info" },
    ]);
  });

  it("stops the reports once the unlistable directory can be listed again", async () => {
    const userStyles = join(agentDir, STYLES_DIR_NAME);
    await writeStyle(userStyles, "terse.md", terse());
    const harness = createHarness();
    await harness.start();

    listFailures.path = userStyles;
    harness.answerSelect(undefined);
    await harness.runCommand("");
    listFailures.path = undefined;
    await writeStyle(userStyles, "brief.md", styleFile("Short answers.", "Answer briefly."));
    harness.answerSelect(undefined);
    await harness.runCommand("");

    expect(harness.notifications).toHaveLength(1);
    expect(harness.selectCalls[1]?.options).toEqual(
      expect.arrayContaining(["brief - Short answers. [user]", "terse - One-line answers. [user]"]),
    );
  });

  it("keeps the refusal rule while it reports the kept list", async () => {
    const userStyles = join(agentDir, STYLES_DIR_NAME);
    await writeStyle(userStyles, "terse.md", terse());
    const harness = createHarness({ trusted: true });
    await harness.start();

    listFailures.path = userStyles;
    await writeStyle(join(cwd, CONFIG_DIR_NAME, STYLES_DIR_NAME), "local.md", styleFile("Project style.", "Project text."));
    harness.answerSelect(undefined);
    await harness.runCommand("");

    expect(harness.selectCalls[0]?.options).not.toContain("local - Project style. [project]");
    expect(harness.notifications).toEqual([
      {
        message: `Output styles keep the previous list: ${userStyles} (cannot list directory: EACCES: permission denied)`,
        level: "warning",
      },
    ]);
  });

  it("adopts a fresh list when a directory was already unlistable at the previous scan", async () => {
    const userStyles = join(agentDir, STYLES_DIR_NAME);
    listFailures.path = userStyles;
    const harness = createHarness({ trusted: true });
    await harness.start();

    await writeStyle(join(cwd, CONFIG_DIR_NAME, STYLES_DIR_NAME), "local.md", styleFile("Project style.", "Project text."));
    await harness.runCommand("local");

    expect(harness.status()).toBe(styleStatus("local"));
    expect(harness.notifications).toEqual([
      {
        message: `Output style skipped: ${userStyles} (cannot list directory: EACCES: permission denied)`,
        level: "warning",
      },
      { message: 'Output style "local" is active from the next turn on.', level: "info" },
    ]);
  });

  it("reports a malformed style file once across the session-start scan and all rescans", async () => {
    const userStyles = join(agentDir, STYLES_DIR_NAME);
    await writeStyle(userStyles, "terse.md", terse());
    const malformed = await writeStyle(userStyles, "broken.md", "no frontmatter here\n");
    const harness = createHarness();
    await harness.start();

    for (let invocation = 0; invocation < 3; invocation += 1) {
      harness.answerSelect(undefined);
      await harness.runCommand("");
    }

    expect(harness.notifications).toEqual([
      { message: `Output style skipped: ${malformed} (no readable YAML frontmatter block)`, level: "warning" },
    ]);
  });

  it("reports a new reason for an already-reported path once", async () => {
    const userStyles = join(agentDir, STYLES_DIR_NAME);
    const path = await writeStyle(userStyles, "broken.md", "no frontmatter here\n");
    const harness = createHarness();
    await harness.start();

    await writeStyle(userStyles, "broken.md", "---\ndescription: Empty body.\n---\n\n");
    harness.answerSelect(undefined);
    await harness.runCommand("");
    harness.answerSelect(undefined);
    await harness.runCommand("");

    expect(harness.notifications).toEqual([
      { message: `Output style skipped: ${path} (no readable YAML frontmatter block)`, level: "warning" },
      { message: `Output style skipped: ${path} (style instruction text is empty)`, level: "warning" },
    ]);
  });

  it("cycles through the list as it was at the last scan without a rescan", async () => {
    await writeStyle(join(agentDir, STYLES_DIR_NAME), "brief.md", styleFile("Short answers.", "Answer briefly."));
    const harness = createHarness();
    await harness.start();

    await writeStyle(join(agentDir, STYLES_DIR_NAME), "terse.md", terse());
    await harness.pressCycleShortcut();
    expect(harness.status()).toBe(styleStatus("brief"));
    await harness.pressCycleShortcut();
    expect(harness.status()).toBeUndefined();
  });

  it("keeps the in-memory list for argument autocompletion", async () => {
    const harness = createHarness();
    await harness.start();

    await writeStyle(join(agentDir, STYLES_DIR_NAME), "terse.md", terse());

    expect((await harness.completions(""))?.map((item) => item.value)).toEqual(["default"]);
  });

  it("activates the selected style when a concurrent invocation reorders the list mid-dialog", async () => {
    const userStyles = join(agentDir, STYLES_DIR_NAME);
    await writeStyle(userStyles, "brief.md", styleFile("Short answers.", "Answer briefly."));
    await writeStyle(userStyles, "terse.md", terse());
    const harness = createHarness();
    await harness.start();

    let releaseSelect = () => {};
    const gate = new Promise<void>((resolve) => {
      releaseSelect = resolve;
    });
    harness.answerSelect(async () => {
      await gate;
      return "terse - One-line answers. [user]";
    });
    const selecting = harness.runCommand("");
    await vi.waitFor(() => expect(harness.selectCalls).toHaveLength(1));

    // "alpha" sorts before "terse", so the concurrent rescan shifts terse's list position.
    await writeStyle(userStyles, "alpha.md", styleFile("Alpha.", "Alpha text."));
    await harness.runCommand("alpha");
    releaseSelect();
    await selecting;

    expect(harness.status()).toBe(styleStatus("terse"));
    expect(await harness.turn()).toBe(`${CHAINED_PROMPT}\n\nAnswer in one line.`);
  });

  it("cycles onward from the active style after a rescan replaced the list objects", async () => {
    const userStyles = join(agentDir, STYLES_DIR_NAME);
    await writeStyle(userStyles, "brief.md", styleFile("Short answers.", "Answer briefly."));
    await writeStyle(userStyles, "terse.md", terse());
    const harness = createHarness({ flag: "brief" });
    await harness.start();

    harness.answerSelect(undefined);
    await harness.runCommand("");
    await harness.pressCycleShortcut();

    expect(harness.status()).toBe(styleStatus("terse"));
  });

  it("cycles to the first entry when a rescan removed the active style", async () => {
    const path = await writeStyle(join(agentDir, STYLES_DIR_NAME), "brief.md", styleFile("Short answers.", "Answer briefly."));
    const harness = createHarness({ flag: "brief" });
    await harness.start();

    await rm(path);
    harness.answerSelect(undefined);
    await harness.runCommand("");
    await harness.pressCycleShortcut();

    expect(harness.status()).toBeUndefined();
  });
});
