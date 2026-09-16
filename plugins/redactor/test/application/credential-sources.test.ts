import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CredentialSources, refusalMessage, WITHHELD_LABEL } from "../../src/application/credential-sources.ts";
import { RedactionEngine } from "../../src/application/redaction-engine.ts";
import { CredentialRegistry } from "../../src/domain/credential-registry.ts";
import { SelectionConfigError } from "../../src/domain/credential-selection.ts";
import { referenceFor } from "../../src/domain/text-redaction.ts";
import { SelectionFile, SelectionWriteFailure } from "../../src/infrastructure/node/selection-file.ts";

const VALUE = "sk-live-SOURCES-0123456789";
const OTHER = "xoxb-SOURCES-OTHER-987654321";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()!();
});

interface SetupOptions {
  lockTimeoutMs?: number;
  generateReference?: () => string;
  readVariable?: (name: string) => string | undefined;
}

async function setup(environment: Record<string, string | undefined> = {}, options: SetupOptions = {}) {
  const root = await mkdtemp(join(tmpdir(), "redactor-sources-"));
  cleanups.push(() => rm(root, { recursive: true, force: true }));
  const path = join(root, "user", "credentials.json");
  const registry = new CredentialRegistry();
  const engine = new RedactionEngine(registry);
  const sources = new CredentialSources({
    file: new SelectionFile(path, { lockTimeoutMs: options.lockTimeoutMs }),
    registry,
    engine,
    readVariable: options.readVariable ?? ((name) => environment[name]),
    generateReference: options.generateReference,
  });
  return { root, path, registry, engine, sources };
}

async function readConfig(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}

describe("credential sources", () => {
  it("loads only selected variables and reports missing values as unavailable", async () => {
    const { path, sources, engine } = await setup({ SELECTED: VALUE, UNSELECTED: OTHER, EMPTY: "" });
    await mkdir(join(path, ".."), { recursive: true });
    await writeFile(
      path,
      JSON.stringify({
        version: 1,
        selections: [
          { name: "SELECTED", label: "Selected" },
          { name: "EMPTY", label: "Empty" },
          { name: "ABSENT", label: "Absent" },
        ],
      }),
    );

    const report = sources.load();

    expect(report.problems).toEqual([]);
    const bindings = sources.list();
    expect(bindings.map(({ name, state }) => [name, state])).toEqual([
      ["SELECTED", "active"],
      ["EMPTY", "unavailable"],
      ["ABSENT", "unavailable"],
    ]);
    expect(engine.redactText(`${VALUE} ${OTHER}`)).toBe(`${referenceFor(bindings[0]!.reference!)} ${OTHER}`);
    expect(sources.selectedNames()).toEqual(["SELECTED", "EMPTY", "ABSENT"]);
  });

  it("adds a selection, persists name and label only, and activates the value", async () => {
    const { path, sources, engine } = await setup({ GITHUB_TOKEN: VALUE });

    const outcome = await sources.add("GITHUB_TOKEN", "GitHub");

    expect(outcome.kind).toBe("added");
    expect(outcome.binding.state).toBe("active");
    expect(await readConfig(path)).toEqual({ version: 1, selections: [{ name: "GITHUB_TOKEN", label: "GitHub" }] });
    expect(await readFile(path, "utf8")).not.toContain(VALUE);
    expect(engine.redactText(VALUE)).toBe(referenceFor(outcome.binding.reference!));
  });

  it("keeps a repeated selection unique and its reference unchanged", async () => {
    const { path, sources, registry } = await setup({ GITHUB_TOKEN: VALUE });
    const first = await sources.add("GITHUB_TOKEN", "GitHub");
    const version = registry.version;

    const repeated = await sources.add("GITHUB_TOKEN", "GitHub");
    const relabeled = await sources.add("GITHUB_TOKEN", "GitHub API");

    expect(repeated).toEqual({ kind: "unchanged", binding: first.binding });
    expect(relabeled.kind).toBe("relabeled");
    expect(relabeled.binding.reference).toBe(first.binding.reference);
    expect(registry.version).toBe(version);
    expect(await readConfig(path)).toEqual({ version: 1, selections: [{ name: "GITHUB_TOKEN", label: "GitHub API" }] });
  });

  it("keeps the published reference equal to the written reference after a removal and a new selection", async () => {
    const { sources, engine } = await setup({ GITHUB_TOKEN: VALUE });
    const first = await sources.add("GITHUB_TOKEN", "GitHub");
    await sources.remove("GITHUB_TOKEN");

    const again = await sources.add("GITHUB_TOKEN", "GitHub");

    expect(again.kind).toBe("added");
    expect(again.binding.reference).toBe(first.binding.reference);
    expect(engine.redactText(VALUE)).toBe(referenceFor(sources.list()[0]!.reference!));
  });

  it("reports a selection the file already holds as added without rewriting the file", async () => {
    const { path, sources } = await setup({ GITHUB_TOKEN: VALUE });
    await mkdir(join(path, ".."), { recursive: true });
    await writeFile(path, JSON.stringify({ version: 1, selections: [{ name: "GITHUB_TOKEN", label: "GitHub" }] }));
    const before = await stat(path);

    const outcome = await sources.add("GITHUB_TOKEN", "GitHub");

    expect(outcome.kind).toBe("added");
    expect(outcome.binding.state).toBe("active");
    expect((await stat(path)).mtimeMs).toBe(before.mtimeMs);
  });

  it("rejects invalid names and labels before writing", async () => {
    const { path, sources } = await setup();

    await expect(sources.add("1BAD", "x")).rejects.toThrow(SelectionConfigError);
    await expect(sources.add("OK", " ")).rejects.toThrow(SelectionConfigError);
    await expect(readFile(path, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    expect(sources.list()).toEqual([]);
  });

  it("rejects a label or name that contains a registered credential value", async () => {
    const { sources } = await setup({ A: VALUE });
    await sources.add("A", "first");

    await expect(sources.add("B", `pasted ${VALUE}`)).rejects.toThrow(/contains a registered credential value/);
    expect(sources.list()).toHaveLength(1);
  });

  it("rejects a name or label that contains the selected variable's own value before writing", async () => {
    const { path, sources, registry } = await setup({ B: OTHER, KEY: "KEY" });

    await expect(sources.add("B", `pasted ${OTHER}`)).rejects.toThrow(/contains the selected credential value/);
    await expect(sources.add("KEY", "Key")).rejects.toThrow(/contains the selected credential value/);
    expect(() => sources.approve({ name: "B", label: `pasted ${OTHER}` })).toThrow(SelectionConfigError);
    await expect(readFile(path, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    expect(sources.list()).toEqual([]);
    expect(registry.redactionEntries()).toEqual([]);
  });

  it("validates a proposal's name and label without reading its variable", async () => {
    const { sources } = await setup(
      {},
      {
        readVariable: () => {
          throw new Error("the variable must not be read before approval");
        },
      },
    );

    expect(() => sources.assertNameAndLabel("NPM_TOKEN", "npm")).not.toThrow();
    expect(() => sources.assertNameAndLabel("1BAD", "npm")).toThrow(SelectionConfigError);
    expect(() => sources.assertNameAndLabel("NPM_TOKEN", " ")).toThrow(SelectionConfigError);
  });

  it("changes nothing while another process holds the configuration lock", async () => {
    const { path, sources, registry } = await setup({ GITHUB_TOKEN: VALUE }, { lockTimeoutMs: 50 });
    await mkdir(`${path}.lock`, { recursive: true });
    await writeFile(join(`${path}.lock`, `owner-${process.pid}-bb`), "");

    await expect(sources.add("GITHUB_TOKEN", "GitHub")).rejects.toThrow(SelectionWriteFailure);
    await expect(readFile(path, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    expect(sources.list()).toEqual([]);
    expect(registry.redactionEntries()).toEqual([]);
  });

  it("keeps a published reference and refuses a later value that would appear inside it", async () => {
    const generated = ["cred-aaaaaaaaaa", "cred-bbbbbbbbbb"];
    const { sources, engine } = await setup({ A: VALUE, B: "cred-" }, { generateReference: () => generated.shift()! });
    const first = await sources.add("A", "first");
    expect(first.binding.reference).toBe("cred-aaaaaaaaaa");

    const second = await sources.add("B", "second");

    expect(second.binding).toEqual({ name: "B", label: "second", reference: undefined, state: "refused" });
    expect(sources.list()[0]!.reference).toBe("cred-aaaaaaaaaa");
    expect(engine.redactText(VALUE)).toBe(referenceFor("cred-aaaaaaaaaa"));
    expect(engine.redactText("cred-")).toBe("cred-");
    expect(sources.load().problems).toEqual([refusalMessage("B")]);
  });

  it("withholds a loaded label that contains its own value and reports the entry by position", async () => {
    const { path, sources, engine } = await setup({ LEAKY: VALUE, OTHER: OTHER });
    await mkdir(join(path, ".."), { recursive: true });
    await writeFile(
      path,
      JSON.stringify({
        version: 1,
        selections: [
          { name: "OTHER", label: "Other" },
          { name: "LEAKY", label: `Leaky ${VALUE}` },
        ],
      }),
    );

    const report = sources.load();

    expect(report.problems).toEqual([
      "credential configuration entry 2: service label contains the selected credential value; the label is withheld until the file is repaired",
    ]);
    const [other, leaky] = sources.list();
    expect(other).toMatchObject({ name: "OTHER", label: "Other", state: "active" });
    expect(leaky).toMatchObject({ name: "LEAKY", label: WITHHELD_LABEL, state: "active" });
    expect(JSON.stringify(sources.list())).not.toContain(VALUE);
    expect(engine.redactText(VALUE)).toBe(referenceFor(leaky!.reference!));
    expect(sources.selectedNames()).toEqual(["OTHER", "LEAKY"]);
  });

  it("skips a loaded selection whose name contains its own value and reports the entry by position", async () => {
    const { path, sources, registry } = await setup({ GITHUB_TOKEN: "TOKEN" });
    await mkdir(join(path, ".."), { recursive: true });
    await writeFile(path, JSON.stringify({ version: 1, selections: [{ name: "GITHUB_TOKEN", label: "GitHub" }] }));

    const report = sources.load();

    expect(report.problems).toEqual([
      "credential configuration entry 1: variable name contains the selected credential value; the entry was skipped",
    ]);
    expect(sources.list()).toEqual([]);
    expect(sources.selectedNames()).toEqual([]);
    expect(registry.redactionEntries()).toEqual([]);
  });

  it("lists names and labels with every registered value redacted, including values registered later", async () => {
    const { path, sources } = await setup({ FIRST: VALUE, SECOND: OTHER });
    await mkdir(join(path, ".."), { recursive: true });
    await writeFile(
      path,
      JSON.stringify({
        version: 1,
        selections: [
          { name: "FIRST", label: `First ${OTHER}` },
          { name: "SECOND", label: "Second" },
        ],
      }),
    );

    expect(sources.load().problems).toEqual([]);

    const [first, second] = sources.list();
    expect(first!.label).toBe(`First ${referenceFor(second!.reference!)}`);
    expect(JSON.stringify(sources.list())).not.toContain(OTHER);
  });

  it("does not activate a selection when the write fails", async () => {
    const { path, sources, registry } = await setup({ GITHUB_TOKEN: VALUE });
    await mkdir(join(path, ".."), { recursive: true });
    await chmod(join(path, ".."), 0o500);
    cleanups.push(() => chmod(join(path, ".."), 0o700));

    await expect(sources.add("GITHUB_TOKEN", "GitHub")).rejects.toThrow(SelectionWriteFailure);
    expect(sources.list()).toEqual([]);
    expect(registry.redactionEntries()).toEqual([]);
  });

  it("applies a change to the file as it is on disk instead of the loaded copy", async () => {
    const { path, sources } = await setup({ GITHUB_TOKEN: VALUE });
    await sources.add("GITHUB_TOKEN", "GitHub");
    await writeFile(
      path,
      JSON.stringify({
        version: 1,
        selections: [
          { name: "GITHUB_TOKEN", label: "GitHub" },
          { name: "ADDED_ELSEWHERE", label: "Elsewhere" },
        ],
      }),
    );

    await sources.add("NPM_TOKEN", "npm");

    expect(await readConfig(path)).toEqual({
      version: 1,
      selections: [
        { name: "GITHUB_TOKEN", label: "GitHub" },
        { name: "ADDED_ELSEWHERE", label: "Elsewhere" },
        { name: "NPM_TOKEN", label: "npm" },
      ],
    });
  });

  it("ends a user selection that another process removed from the file and keeps its value redacted", async () => {
    const { path, sources, engine } = await setup({ GITHUB_TOKEN: VALUE, NPM_TOKEN: OTHER, PROJECT_TOKEN: "proj-1" });
    await sources.add("GITHUB_TOKEN", "GitHub");
    const dropped = await sources.add("NPM_TOKEN", "npm");
    sources.approve({ name: "PROJECT_TOKEN", label: "project" });
    await writeFile(path, JSON.stringify({ version: 1, selections: [{ name: "GITHUB_TOKEN", label: "GitHub" }] }));

    expect(sources.load().problems).toEqual([]);

    expect(sources.selectedNames()).toEqual(["GITHUB_TOKEN", "PROJECT_TOKEN"]);
    expect(sources.origin("NPM_TOKEN")).toBeUndefined();
    expect(engine.redactText(OTHER)).toBe(referenceFor(dropped.binding.reference!));
    expect(await sources.remove("NPM_TOKEN")).toEqual({ kind: "not-selected", name: "NPM_TOKEN" });
  });

  it("keeps the last valid state and reports a malformed file without its text", async () => {
    const { path, sources } = await setup({ GITHUB_TOKEN: VALUE });
    await sources.add("GITHUB_TOKEN", "GitHub");
    await writeFile(path, "{ SHOULD_NOT_ECHO");

    const report = sources.load();

    expect(report.problems).toHaveLength(1);
    expect(report.problems[0]).toContain("credential configuration is invalid");
    expect(report.problems[0]).not.toContain("SHOULD_NOT_ECHO");
    expect(sources.list().map((binding) => binding.name)).toEqual(["GITHUB_TOKEN"]);
    await expect(sources.add("OTHER", "Other")).rejects.toThrow(SelectionConfigError);
    await expect(sources.remove("GITHUB_TOKEN")).rejects.toThrow(SelectionConfigError);
    expect(await readFile(path, "utf8")).toBe("{ SHOULD_NOT_ECHO");
    expect(sources.list().map((binding) => binding.name)).toEqual(["GITHUB_TOKEN"]);
  });

  it("removes a selection, ends its Bash stripping, and keeps its value redacted", async () => {
    const { path, sources, engine } = await setup({ GITHUB_TOKEN: VALUE });
    const added = await sources.add("GITHUB_TOKEN", "GitHub");

    expect(await sources.remove("GITHUB_TOKEN")).toEqual({
      kind: "removed",
      name: "GITHUB_TOKEN",
      retainedValue: true,
    });
    expect(await sources.remove("GITHUB_TOKEN")).toEqual({ kind: "not-selected", name: "GITHUB_TOKEN" });

    expect(await readConfig(path)).toEqual({ version: 1, selections: [] });
    expect(sources.selectedNames()).toEqual([]);
    expect(engine.redactText(VALUE)).toBe(referenceFor(added.binding.reference!));
  });

  it("keeps a selection whose value cannot be protected listed, stripped, and reported as refused", async () => {
    const { path, sources } = await setup({ BROKEN: "[" });

    const outcome = await sources.add("BROKEN", "Broken");

    expect(outcome).toEqual({
      kind: "added",
      binding: { name: "BROKEN", label: "Broken", reference: undefined, state: "refused" },
    });
    expect(await readConfig(path)).toEqual({ version: 1, selections: [{ name: "BROKEN", label: "Broken" }] });
    expect(sources.selectedNames()).toEqual(["BROKEN"]);
    const report = sources.load();
    expect(report.problems).toEqual([
      "credential BROKEN cannot be protected: no safe reference exists for its value, so it is unusable and not redacted",
    ]);
    expect(await sources.remove("BROKEN")).toEqual({ kind: "removed", name: "BROKEN", retainedValue: false });
  });

  it("redacts a startup problem that names an entry whose name contains another selection's value", async () => {
    const { path, sources, registry } = await setup({ LEAKY_SOURCES_VALUE: "[", HOLDER: "LEAKY_SOURCES_VALUE" });
    await mkdir(join(path, ".."), { recursive: true });
    await writeFile(
      path,
      JSON.stringify({
        version: 1,
        selections: [
          { name: "LEAKY_SOURCES_VALUE", label: "Refused" },
          { name: "HOLDER", label: "Holder" },
        ],
      }),
    );

    const report = sources.load();

    const reference = referenceFor(registry.toJSON().ids[0]!);
    expect(report.problems).toEqual([refusalMessage(reference)]);
    expect(report.problems.join("\n")).not.toContain("LEAKY_SOURCES_VALUE");
  });

  it("rejects an invalid name on remove before touching the file", async () => {
    const { path, sources } = await setup();

    await expect(sources.remove("sk-live-PASTED")).rejects.toThrow(SelectionConfigError);
    await expect(readFile(path, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  describe("project proposals", () => {
    it("lists proposals that the user selection does not already contain", async () => {
      const { root, sources } = await setup({ GITHUB_TOKEN: VALUE, NPM_TOKEN: OTHER });
      await sources.add("GITHUB_TOKEN", "GitHub");
      const projectFile = new SelectionFile(join(root, "project", "credentials.json"));
      await projectFile.update(() => ({
        version: 1,
        selections: [
          { name: "GITHUB_TOKEN", label: "Ignored" },
          { name: "NPM_TOKEN", label: "npm" },
        ],
      }));

      expect(sources.proposalsFrom(projectFile)).toEqual([{ name: "NPM_TOKEN", label: "npm" }]);
      expect(sources.list().map((binding) => binding.name)).toEqual(["GITHUB_TOKEN"]);
    });

    it("activates an approved proposal without persisting it", async () => {
      const { path, sources, engine } = await setup({ NPM_TOKEN: OTHER });

      const binding = sources.approve({ name: "NPM_TOKEN", label: "npm" });

      expect(binding.state).toBe("active");
      expect(engine.redactText(OTHER)).toBe(referenceFor(binding.reference!));
      expect(sources.selectedNames()).toEqual(["NPM_TOKEN"]);
      expect(sources.origin("NPM_TOKEN")).toBe("project");
      await expect(readFile(path, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    });

    it("lists each binding with its origin", async () => {
      const { sources } = await setup({ GITHUB_TOKEN: VALUE, NPM_TOKEN: OTHER });
      await sources.add("GITHUB_TOKEN", "GitHub");
      sources.approve({ name: "NPM_TOKEN", label: "npm" });

      expect(sources.list().map(({ name, origin }) => [name, origin])).toEqual([
        ["GITHUB_TOKEN", "user"],
        ["NPM_TOKEN", "project"],
      ]);
    });

    it("does not list a proposal the user declined", async () => {
      const { root, sources } = await setup({ NPM_TOKEN: OTHER });
      const projectFile = new SelectionFile(join(root, "project", "credentials.json"));
      await projectFile.update(() => ({ version: 1, selections: [{ name: "NPM_TOKEN", label: "npm" }] }));

      sources.decline("NPM_TOKEN");

      expect(sources.proposalsFrom(projectFile)).toEqual([]);
    });

    it("does not list an already approved proposal again", async () => {
      const { root, sources } = await setup({ NPM_TOKEN: OTHER });
      const projectFile = new SelectionFile(join(root, "project", "credentials.json"));
      await projectFile.update(() => ({ version: 1, selections: [{ name: "NPM_TOKEN", label: "npm" }] }));
      sources.approve({ name: "NPM_TOKEN", label: "npm" });

      expect(sources.proposalsFrom(projectFile)).toEqual([]);
    });

    it("persists an approved proposal under its label and takes ownership of the binding", async () => {
      const { path, sources } = await setup({ NPM_TOKEN: OTHER });
      const approved = sources.approve({ name: "NPM_TOKEN", label: "npm" });

      const added = await sources.add("NPM_TOKEN", "npm");

      expect(added).toEqual({ kind: "unchanged", binding: approved });
      expect(sources.origin("NPM_TOKEN")).toBe("user");
      expect(await readConfig(path)).toEqual({ version: 1, selections: [{ name: "NPM_TOKEN", label: "npm" }] });
    });

    it("ends an approved proposal while the user file is malformed and leaves the file alone", async () => {
      const { path, sources, engine } = await setup({ NPM_TOKEN: OTHER });
      const approved = sources.approve({ name: "NPM_TOKEN", label: "npm" });
      await mkdir(join(path, ".."), { recursive: true });
      await writeFile(path, "{ SHOULD_NOT_ECHO");

      const outcome = await sources.remove("NPM_TOKEN");

      expect(outcome).toEqual({ kind: "removed", name: "NPM_TOKEN", retainedValue: true });
      expect(sources.selectedNames()).toEqual([]);
      expect(engine.redactText(OTHER)).toBe(referenceFor(approved.reference!));
      expect(await readFile(path, "utf8")).toBe("{ SHOULD_NOT_ECHO");
      await expect(sources.remove("NPM_TOKEN")).rejects.toThrow(SelectionConfigError);
    });

    it("keeps a session-only binding through a reload and lets a later user selection own it", async () => {
      const { path, sources } = await setup({ NPM_TOKEN: OTHER });
      const approved = sources.approve({ name: "NPM_TOKEN", label: "npm" });

      sources.load();
      expect(sources.origin("NPM_TOKEN")).toBe("project");
      const added = await sources.add("NPM_TOKEN", "npm registry");

      expect(added.binding.reference).toBe(approved.reference);
      expect(sources.origin("NPM_TOKEN")).toBe("user");
      expect(await readConfig(path)).toEqual({
        version: 1,
        selections: [{ name: "NPM_TOKEN", label: "npm registry" }],
      });
    });
  });
});
