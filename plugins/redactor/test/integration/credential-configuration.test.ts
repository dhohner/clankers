import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it, vi } from "vitest";
import { referenceFor } from "../../src/domain/text-redaction.ts";
import { createSyntheticHost, type SyntheticHostOptions, createWorkspace } from "../support/synthetic-host.ts";

const SELECTED = "REDACTOR_TEST_SELECTED_91c3";
const EMPTY = "REDACTOR_TEST_EMPTY_91c3";
const UNSELECTED = "REDACTOR_TEST_UNSELECTED_91c3";
const TWIN = "REDACTOR_TEST_TWIN_91c3";
const PROJECT = "REDACTOR_TEST_PROJECT_91c3";
const REFUSED = "REDACTOR_TEST_REFUSED_91c3";
const PREFIXED = "REDACTOR_TEST_PREFIXED_91c3";
const HOLDER = "REDACTOR_TEST_HOLDER_91c3";
const HOLDER_VALUE = "CONTAINED_91c3";
const CONTAINED = `REDACTOR_TEST_${HOLDER_VALUE}`;
const SELECTED_VALUE = "sk-live-CONFIG-0123456789abcdef";
const UNSELECTED_VALUE = "ghp_UNSELECTED_CONFIG_9876543210";
const PROJECT_VALUE = "npm_PROJECT_CONFIG_1122334455";
const PASTED_TOKEN = "ghp_PASTEDCONFIGTOKEN0123456789ABCDEFGH";
const REFERENCE = /\[redacted:cred-[0-9a-f]{10}\]/;

const cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()!();
});

function setVariable(name: string, value: string | undefined): void {
  const previous = process.env[name];
  cleanups.push(() => {
    if (previous === undefined) delete process.env[name];
    else process.env[name] = previous;
  });
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function syntheticEnvironment(): void {
  setVariable(SELECTED, SELECTED_VALUE);
  setVariable(EMPTY, "");
  setVariable(UNSELECTED, UNSELECTED_VALUE);
  setVariable(TWIN, SELECTED_VALUE);
  setVariable(PROJECT, PROJECT_VALUE);
  setVariable(REFUSED, "[");
  setVariable(PREFIXED, "cred-");
  setVariable(HOLDER, HOLDER_VALUE);
  setVariable(CONTAINED, "[");
}

interface HostOptions extends SyntheticHostOptions {
  selections?: Array<{ name: string; label: string }>;
  proposals?: Array<{ name: string; label: string }>;
  mode?: ExtensionContext["mode"];
  /** Answers for approval dialogs, consumed in order; session start asks before the host returns. */
  answers?: Array<boolean | undefined>;
}

async function host(options: HostOptions = {}) {
  syntheticEnvironment();
  const workspace = options.workspace ?? (await createWorkspace());
  const userPath = join(workspace.agentDir, "redactor", "credentials.json");
  const projectPath = join(workspace.cwd, ".pi", "redactor", "credentials.json");
  if (options.selections) await writeConfig(userPath, options.selections);
  if (options.proposals) await writeConfig(projectPath, options.proposals);
  const answers = [...(options.answers ?? [])];
  const created = await createSyntheticHost({
    ...options,
    workspace,
    beforeBind: (ui) => {
      ui.confirm.mockImplementation(() => Promise.resolve(answers.shift()));
    },
  });
  cleanups.push(created.cleanup);
  return { ...created, userPath, projectPath };
}

async function writeConfig(path: string, selections: Array<{ name: string; label: string }>): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, JSON.stringify({ version: 1, selections }));
}

function notices(ui: { notify: { mock: { calls: unknown[][] } } }): string[] {
  return ui.notify.mock.calls.map((call) => String(call[0]));
}

function lastNotice(ui: { notify: { mock: { calls: unknown[][] } } }): string {
  return notices(ui).at(-1) ?? "";
}

function systemPromptOf(request: { payload: unknown }): string {
  return (request.payload as { context: { systemPrompt: string } }).context.systemPrompt;
}

function bash(command: string) {
  return { toolCalls: [{ name: "bash", arguments: { command } }] };
}

describe("credential selection (TEST-02)", () => {
  it("loads only selected variables and keeps missing and empty values unavailable", async () => {
    const h = await host({
      selections: [
        { name: SELECTED, label: "Selected" },
        { name: EMPTY, label: "Empty" },
        { name: "REDACTOR_TEST_ABSENT_91c3", label: "Absent" },
      ],
    });

    await h.session.prompt("/redactor list");

    const listing = lastNotice(h.ui);
    expect(listing).toMatch(new RegExp(`${SELECTED}\\s+Selected\\s+\\[redacted:cred-[0-9a-f]{10}\\]\\s+active`));
    expect(listing).toMatch(new RegExp(`${EMPTY}\\s+Empty\\s+unavailable`));
    expect(listing).toMatch(/REDACTOR_TEST_ABSENT_91c3\s+Absent\s+unavailable/);
    expect(listing).not.toContain(UNSELECTED);
    expect(listing).not.toContain(SELECTED_VALUE);
    expect(h.registry.redactionEntries()).toHaveLength(1);
    expect(h.registry.redactionEntries()[0]!.value).toBe(SELECTED_VALUE);
    expect(await readFile(h.userPath, "utf8")).not.toContain(SELECTED_VALUE);
    expect(h.extensionErrors).toEqual([]);
  });

  it("never shows a loaded label that contains its own value", async () => {
    const h = await host({
      selections: [{ name: SELECTED, label: `Selected ${SELECTED_VALUE}` }],
      script: [{ text: "ok" }],
    });
    const startup = notices(h.ui).join("\n");
    expect(startup).toContain("credential configuration entry 1");
    expect(startup).not.toContain(SELECTED_VALUE);

    await h.session.prompt("/redactor list");
    const listing = lastNotice(h.ui);

    expect(listing).toMatch(new RegExp(`${SELECTED}\\s+.*\\[redacted:cred-[0-9a-f]{10}\\]\\s+active`));
    expect(listing).not.toContain(SELECTED_VALUE);
    await h.session.prompt(`use ${SELECTED_VALUE}`);
    expect(JSON.stringify(h.requests[0]!.payload)).not.toContain(SELECTED_VALUE);
    expect(h.extensionErrors).toEqual([]);
  });

  it("redacts a startup refusal whose variable name contains another selection's value", async () => {
    const h = await host({
      selections: [
        { name: CONTAINED, label: "Contained" },
        { name: HOLDER, label: "Holder" },
      ],
      script: [{ text: "ok" }],
    });

    const startup = notices(h.ui).join("\n");
    expect(startup).toContain("cannot be protected");
    expect(startup).not.toContain(HOLDER_VALUE);
    expect(startup).toMatch(REFERENCE);
    expect(h.registry.redactionEntries().map((entry) => entry.value)).toEqual([HOLDER_VALUE]);
    expect(h.extensionErrors).toEqual([]);
  });

  it("adds a selection through the command, persists names and labels only, and activates it", async () => {
    const h = await host();

    await h.session.prompt(`/redactor add ${SELECTED} GitHub API`);

    const notice = lastNotice(h.ui);
    expect(notice).toContain(`selected ${SELECTED} (GitHub API)`);
    expect(notice).toMatch(REFERENCE);
    expect(notice).not.toContain(SELECTED_VALUE);
    expect(JSON.parse(await readFile(h.userPath, "utf8"))).toEqual({
      version: 1,
      selections: [{ name: SELECTED, label: "GitHub API" }],
    });
    expect(h.registry.redactionEntries().map((entry) => entry.value)).toEqual([SELECTED_VALUE]);
  });

  it("refuses a label that contains the selected variable's value before writing or reporting anything", async () => {
    const h = await host();

    await h.session.prompt(`/redactor add ${SELECTED} pasted ${SELECTED_VALUE}`);

    const [text, level] = h.ui.notify.mock.calls.at(-1)!;
    expect(level).toBe("error");
    expect(String(text)).not.toContain(SELECTED_VALUE);
    await expect(readFile(h.userPath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    expect(h.registry.redactionEntries()).toEqual([]);
    expect(h.extensionErrors).toEqual([]);
  });

  it("keeps a published reference when a later selection's value would appear inside it", async () => {
    const generated = ["cred-aaaaaaaaaa", "cred-bbbbbbbbbb"];
    const h = await host({ credentials: { generateReference: () => generated.shift()! } });
    await h.session.prompt(`/redactor add ${SELECTED} Selected`);
    expect(lastNotice(h.ui)).toContain("[redacted:cred-aaaaaaaaaa]");

    await h.session.prompt(`/redactor add ${PREFIXED} Prefixed`);

    expect(lastNotice(h.ui)).toContain(`selected ${PREFIXED} (Prefixed); refused`);
    await h.session.prompt("/redactor list");
    expect(lastNotice(h.ui)).toMatch(new RegExp(`${SELECTED}\\s+Selected\\s+\\[redacted:cred-aaaaaaaaaa\\]\\s+active`));
    expect(h.registry.redactionEntries().map((entry) => entry.value)).toEqual([SELECTED_VALUE]);
    expect(h.extensionErrors).toEqual([]);
  });

  it("redacts a newly selected value from prompts, tool output, and persistence right after activation (REQ-09)", async () => {
    const h = await host({ script: [bash(`printf '%s' "$${UNSELECTED}"; cat leak.txt`), { text: "done" }] });
    await writeFile(join(h.workspace.cwd, "leak.txt"), SELECTED_VALUE);
    await h.session.prompt(`/redactor add ${SELECTED} Selected`);
    const reference = referenceFor(h.registry.toJSON().ids[0]!);

    await h.session.prompt(`the value is ${SELECTED_VALUE}`);

    for (const request of h.requests) {
      expect(JSON.stringify(request.payload)).not.toContain(SELECTED_VALUE);
      expect(JSON.stringify(request.context)).not.toContain(SELECTED_VALUE);
    }
    expect(JSON.stringify(h.requests[0]!.payload)).toContain(reference);
    const toolResult = JSON.stringify(h.requests[1]!.context);
    expect(toolResult).toContain(`${UNSELECTED_VALUE}${reference}`);
    const sessionFile = await h.readSessionFile();
    expect(sessionFile).not.toContain(SELECTED_VALUE);
    expect(sessionFile).toContain(reference);
  });

  it("asks before selecting a name without a value and stores nothing when declined", async () => {
    const h = await host({ script: [{ text: "ok" }], answers: [false] });

    await h.session.prompt(`/redactor add ${PASTED_TOKEN} GitHub`);
    await h.session.prompt("hello");

    expect(h.ui.confirm).toHaveBeenCalledTimes(1);
    expect(String(h.ui.confirm.mock.calls[0]![1])).toContain(`${PASTED_TOKEN} (GitHub)`);
    expect(notices(h.ui)).toContain("redactor: selection cancelled; nothing was stored");
    await expect(readFile(h.userPath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    expect(JSON.stringify(h.requests[0]!.payload)).not.toContain(PASTED_TOKEN);
    expect(h.extensionErrors).toEqual([]);
  });

  it("selects a confirmed name without a value and keeps the name out of the model guidance", async () => {
    const h = await host({ script: [{ text: "ok" }], answers: [true] });

    await h.session.prompt("/redactor add REDACTOR_TEST_ABSENT_91c3 Absent service");
    await h.session.prompt("hello");

    expect(h.ui.confirm).toHaveBeenCalledTimes(1);
    expect(lastNotice(h.ui)).toContain("unavailable");
    expect(JSON.parse(await readFile(h.userPath, "utf8"))).toEqual({
      version: 1,
      selections: [{ name: "REDACTOR_TEST_ABSENT_91c3", label: "Absent service" }],
    });
    const systemPrompt = systemPromptOf(h.requests[0]!);
    expect(systemPrompt).toContain("unavailable: Absent service, no value in this Pi process");
    expect(systemPrompt).not.toContain("REDACTOR_TEST_ABSENT_91c3");
  });

  it.each(["rpc", "print", "json"] as const)("refuses a name without a value in %s mode", async (mode) => {
    const h = await host({ mode });

    await h.session.prompt(`/redactor add ${PASTED_TOKEN} GitHub`);

    expect(h.ui.confirm).not.toHaveBeenCalled();
    expect(lastNotice(h.ui)).toContain("interactive terminal");
    expect(lastNotice(h.ui)).not.toContain(PASTED_TOKEN);
    await expect(readFile(h.userPath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("keeps a repeated selection unique and its reference stable", async () => {
    const h = await host({ selections: [{ name: SELECTED, label: "Selected" }] });
    const before = h.registry.toJSON().ids;

    await h.session.prompt(`/redactor add ${SELECTED} Selected`);
    await h.session.prompt(`/redactor add ${SELECTED} Renamed`);

    expect(h.registry.toJSON().ids).toEqual(before);
    expect(JSON.parse(await readFile(h.userPath, "utf8"))).toEqual({
      version: 1,
      selections: [{ name: SELECTED, label: "Renamed" }],
    });
    expect(notices(h.ui).at(-2)).toContain("already selected");
    expect(lastNotice(h.ui)).toContain("relabeled");
  });

  it("removes a selection and keeps its value redacted for the process", async () => {
    const h = await host({ selections: [{ name: SELECTED, label: "Selected" }], script: [{ text: "ok" }] });
    const reference = referenceFor(h.registry.toJSON().ids[0]!);

    await h.session.prompt(`/redactor remove ${SELECTED}`);
    await h.session.prompt(`still ${SELECTED_VALUE}`);

    expect(JSON.parse(await readFile(h.userPath, "utf8"))).toEqual({ version: 1, selections: [] });
    expect(JSON.stringify(h.requests[0]!.payload)).toContain(reference);
    expect(JSON.stringify(h.requests[0]!.payload)).not.toContain(SELECTED_VALUE);
    expect(systemPromptOf(h.requests[0]!)).not.toContain("Credential references");
  });

  it("keeps the last valid state and returns a sanitized failure for a malformed file", async () => {
    const h = await host({ selections: [{ name: SELECTED, label: "Selected" }] });
    await writeFile(h.userPath, "{ SHOULD_NOT_ECHO");

    await h.session.prompt("/redactor list");
    await h.session.prompt(`/redactor add ${UNSELECTED} Other`);

    const listing = notices(h.ui).at(-2)!;
    expect(listing).toContain(SELECTED);
    expect(lastNotice(h.ui)).toContain("credential configuration is invalid");
    expect(lastNotice(h.ui)).not.toContain("SHOULD_NOT_ECHO");
    expect(await readFile(h.userPath, "utf8")).toBe("{ SHOULD_NOT_ECHO");
    expect(h.registry.redactionEntries()).toHaveLength(1);
  });

  it("reports a malformed file at startup without its text", async () => {
    const h = await host({ selections: [] });
    await writeFile(h.userPath, "{ SHOULD_NOT_ECHO");
    h.ui.notify.mockClear();

    await h.session.prompt("/redactor list");

    expect(notices(h.ui).join("\n")).not.toContain("SHOULD_NOT_ECHO");
    expect(lastNotice(h.ui)).toContain("no credentials selected");
  });

  it("does not activate a selection whose write fails", async () => {
    const h = await host();
    await mkdir(join(h.userPath, ".."), { recursive: true });
    await chmod(join(h.userPath, ".."), 0o500);
    cleanups.push(() => chmod(join(h.userPath, ".."), 0o700));

    await h.session.prompt(`/redactor add ${SELECTED} Selected`);

    expect(lastNotice(h.ui)).toContain("writing the credential configuration failed");
    expect(lastNotice(h.ui)).not.toContain(h.workspace.root);
    expect(h.registry.redactionEntries()).toEqual([]);
    expect(h.extensionErrors).toEqual([]);
  });
});

describe("project proposals (TEST-02)", () => {
  const proposals = [{ name: PROJECT, label: "npm" }];

  it("activates a proposal after approval without persisting it", async () => {
    const h = await host({ proposals, projectTrusted: true, script: [{ text: "ok" }], answers: [true] });
    await h.session.prompt("/redactor list");

    expect(h.ui.confirm).toHaveBeenCalledTimes(1);
    expect(String(h.ui.confirm.mock.calls[0]![1])).toContain(`${PROJECT} (npm)`);
    expect(lastNotice(h.ui)).toMatch(
      new RegExp(`${PROJECT}\\s+npm\\s+\\[redacted:cred-[0-9a-f]{10}\\]\\s+active.*project, until Pi exits`),
    );
    await expect(readFile(h.userPath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    await h.session.prompt(`use ${PROJECT_VALUE}`);
    expect(JSON.stringify(h.requests[0]!.payload)).not.toContain(PROJECT_VALUE);
  });

  it("keeps an approval active in a later session of the same process without another dialog", async () => {
    const first = await host({ proposals, projectTrusted: true, answers: [true] });
    const second = await host({
      workspace: first.workspace,
      factory: first.factory,
      registry: first.registry,
      projectTrusted: true,
      script: [{ text: "ok" }],
    });
    await second.session.prompt("/redactor list");

    expect(second.ui.confirm).not.toHaveBeenCalled();
    expect(lastNotice(second.ui)).toMatch(new RegExp(`${PROJECT}\\s+npm\\s+.*active.*project, until Pi exits`));
    await second.session.prompt(`use ${PROJECT_VALUE}`);
    expect(JSON.stringify(second.requests[0]!.payload)).not.toContain(PROJECT_VALUE);

    await second.session.prompt(`/redactor remove ${PROJECT}`);
    await second.session.prompt("/redactor list");
    expect(lastNotice(second.ui)).toContain("no credentials selected");
  });

  it.each([
    ["denial", false, 0],
    ["cancellation", undefined, 1],
  ])(
    "asks about a proposal in a later session of the same process after cancellation only (%s)",
    async (_label, answer, laterDialogs) => {
      const first = await host({ proposals, projectTrusted: true, answers: [answer] });
      expect(first.ui.confirm).toHaveBeenCalledTimes(1);
      const second = await host({
        workspace: first.workspace,
        factory: first.factory,
        registry: first.registry,
        projectTrusted: true,
        answers: [answer],
      });

      expect(second.ui.confirm).toHaveBeenCalledTimes(laterDialogs);
      expect(second.registry.redactionEntries()).toEqual([]);
    },
  );

  it.each([
    ["denial", false],
    ["cancellation", undefined],
  ])("activates nothing and reads no variable after %s", async (_label, answer) => {
    const readVariable = vi.fn((name: string) => process.env[name]);
    const h = await host({ proposals, projectTrusted: true, answers: [answer], credentials: { readVariable } });
    await h.session.prompt("/redactor list");

    expect(h.ui.confirm).toHaveBeenCalledTimes(1);
    expect(readVariable.mock.calls.map((call) => call[0])).not.toContain(PROJECT);
    expect(h.registry.redactionEntries()).toEqual([]);
    expect(lastNotice(h.ui)).toContain("no credentials selected");
  });

  it("reads the proposed variable only after approval", async () => {
    const readVariable = vi.fn((name: string) => process.env[name]);
    const h = await host({ proposals, projectTrusted: true, answers: [true], credentials: { readVariable } });

    const [firstRead] = readVariable.mock.invocationCallOrder;
    const [confirmed] = h.ui.confirm.mock.invocationCallOrder;
    expect(readVariable.mock.calls.map((call) => call[0])).toContain(PROJECT);
    expect(firstRead).toBeGreaterThan(confirmed!);
  });

  it.each(["rpc", "print", "json"] as const)("activates nothing in %s mode and says why", async (mode) => {
    const h = await host({ proposals, projectTrusted: true, mode });

    expect(h.ui.confirm).not.toHaveBeenCalled();
    expect(h.registry.redactionEntries()).toEqual([]);
    expect(notices(h.ui).join("\n")).toContain("interactive terminal");
  });

  it("ignores project proposals in an untrusted project", async () => {
    const h = await host({ proposals, projectTrusted: false });

    expect(h.ui.confirm).not.toHaveBeenCalled();
    expect(h.registry.redactionEntries()).toEqual([]);
  });

  it("does not propose a variable the user already selected and keeps repeated approvals unique", async () => {
    const h = await host({
      selections: [{ name: SELECTED, label: "Selected" }],
      proposals: [{ name: SELECTED, label: "Duplicate" }, ...proposals],
      projectTrusted: true,
      answers: [true, true],
    });

    expect(h.ui.confirm).toHaveBeenCalledTimes(1);
    expect(String(h.ui.confirm.mock.calls[0]![1])).toContain(PROJECT);
    await h.session.prompt(`/redactor add ${PROJECT} npm registry`);
    expect(h.registry.toJSON().ids).toHaveLength(2);
    expect(lastNotice(h.ui)).toContain("relabeled");
  });

  it("does not offer a proposal whose name or label is invalid", async () => {
    const h = await host({
      proposals: [{ name: PROJECT, label: `pasted ${SELECTED_VALUE}` }],
      selections: [{ name: SELECTED, label: "Selected" }],
      projectTrusted: true,
      answers: [true],
    });

    expect(h.ui.confirm).not.toHaveBeenCalled();
    const [text, level] = h.ui.notify.mock.calls.at(-1)!;
    expect(level).toBe("error");
    expect(String(text)).toContain("not offered");
    expect(String(text)).not.toContain(SELECTED_VALUE);
    expect(h.registry.redactionEntries()).toHaveLength(1);
  });

  it("refuses an approved proposal whose label contains the variable's value and echoes nothing", async () => {
    const h = await host({
      proposals: [{ name: PROJECT, label: `pasted ${PROJECT_VALUE}` }],
      projectTrusted: true,
      answers: [true],
    });

    expect(h.ui.confirm).toHaveBeenCalledTimes(1);
    const [text, level] = h.ui.notify.mock.calls.at(-1)!;
    expect(level).toBe("error");
    expect(String(text)).toContain("selected credential value");
    expect(String(text)).not.toContain(PROJECT_VALUE);
    expect(h.registry.redactionEntries()).toEqual([]);
  });

  it("warns when an approved proposal's value cannot be protected", async () => {
    const h = await host({ proposals: [{ name: REFUSED, label: "Broken" }], projectTrusted: true, answers: [true] });

    const call = h.ui.notify.mock.calls.find((arguments_) => String(arguments_[0]).includes(`added ${REFUSED}`));
    expect(call).toBeDefined();
    expect(String(call![0])).toContain("refused");
    expect(String(call![0])).toContain("not redacted");
    expect(String(call![0])).not.toContain("no value");
    expect(call![1]).toBe("warning");
    expect(h.registry.redactionEntries()).toEqual([]);
  });

  it("reports a malformed project file without its text and activates nothing", async () => {
    const h = await host({ projectTrusted: true, workspace: await createWorkspace() });
    await mkdir(join(h.projectPath, ".."), { recursive: true });
    await writeFile(h.projectPath, "{ SHOULD_NOT_ECHO");
    h.ui.notify.mockClear();
    const reloaded = await host({ workspace: h.workspace, projectTrusted: true });

    expect(reloaded.ui.confirm).not.toHaveBeenCalled();
    expect(notices(reloaded.ui).join("\n")).toContain("project credential configuration");
    expect(notices(reloaded.ui).join("\n")).not.toContain("SHOULD_NOT_ECHO");
  });
});

describe("model guidance (TEST-03)", () => {
  it("gives the first request labels, references, and usage guidance without values", async () => {
    const h = await host({
      selections: [
        { name: SELECTED, label: "Selected service" },
        { name: EMPTY, label: "Empty service" },
      ],
      script: [{ text: "ok" }],
    });

    await h.session.prompt("hello");

    const systemPrompt = systemPromptOf(h.requests[0]!);
    expect(systemPrompt).toContain("## Credential references");
    expect(systemPrompt).toMatch(
      new RegExp(`\\[redacted:cred-[0-9a-f]{10}\\]: Selected service \\(environment variable ${SELECTED}\\), active`),
    );
    expect(systemPrompt).toContain("unavailable: Empty service, no value in this Pi process");
    expect(systemPrompt).not.toContain(EMPTY);
    expect(systemPrompt).toContain("no approved execution capability is installed");
    expect(systemPrompt).toContain("Private entry is not installed");
    expect(systemPrompt).not.toContain(SELECTED_VALUE);
    expect(JSON.stringify(h.requests[0]!.payload)).not.toContain(SELECTED_VALUE);
  });

  it("keeps references unchanged across repeated requests", async () => {
    const h = await host({
      selections: [{ name: SELECTED, label: "Selected" }],
      script: [{ text: "one" }, { text: "two" }],
    });

    await h.session.prompt("first");
    await h.session.prompt("second");

    const first = systemPromptOf(h.requests[0]!).match(REFERENCE)![0];
    expect(systemPromptOf(h.requests[1]!)).toContain(first);
  });

  it("gives equal values distinct references and keeps both source identities", async () => {
    const h = await host({
      selections: [
        { name: SELECTED, label: "Selected" },
        { name: TWIN, label: "Twin" },
      ],
      script: [{ text: "ok" }],
    });

    await h.session.prompt(`twin ${SELECTED_VALUE}`);

    const systemPrompt = systemPromptOf(h.requests[0]!);
    const references = [...systemPrompt.matchAll(/\[redacted:cred-[0-9a-f]{10}\]/g)].map((match) => match[0]);
    expect(new Set(references).size).toBe(2);
    expect(systemPrompt).toContain(`Selected (environment variable ${SELECTED})`);
    expect(systemPrompt).toContain(`Twin (environment variable ${TWIN})`);
    const payload = JSON.stringify(h.requests[0]!.payload);
    expect(payload).not.toContain(SELECTED_VALUE);
    expect(payload).toContain(`twin ${references[0]}`);
  });

  it("adds no guidance without selections", async () => {
    const h = await host({ script: [{ text: "ok" }] });

    await h.session.prompt("hello");

    expect(systemPromptOf(h.requests[0]!)).not.toContain("Credential references");
  });
});
