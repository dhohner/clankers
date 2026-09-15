import { access, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Type } from "@earendil-works/pi-ai";
import type { ExtensionFactory } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it } from "vitest";
import { CredentialRegistry } from "../../src/domain/credential-registry.ts";
import { referenceFor } from "../../src/domain/text-redaction.ts";
import { PARK, release, waitUntilParked } from "../support/handshake.ts";
import { createSyntheticHost, type ScriptedTurn, type SyntheticHostOptions } from "../support/synthetic-host.ts";

const SECRET = "sk-live-SESSION-0123456789abcdef";
const SECOND = "xoxb-SECOND-TOKEN-987654321";
const REFERENCE = referenceFor("token");

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

async function host(options: SyntheticHostOptions & { register?: boolean } = {}) {
  const created = await createSyntheticHost(options);
  cleanups.push(created.cleanup);
  if (options.register !== false) created.registry.register("token", SECRET);
  await writeFile(join(created.workspace.cwd, "secret.txt"), SECRET);
  return created;
}

/** Simulate registering a value after its session already contains raw text. */
async function resume(
  previous: Awaited<ReturnType<typeof host>>,
  options: Omit<SyntheticHostOptions, "workspace" | "sessionFile" | "registry">,
) {
  const sessionFile = previous.session.sessionFile!;
  previous.session.dispose();
  const registry = new CredentialRegistry();
  registry.register("token", SECRET);
  const resumed = await createSyntheticHost({ ...options, workspace: previous.workspace, sessionFile, registry });
  cleanups.push(resumed.cleanup);
  return resumed;
}

function compactionEntries(sessionFile: string): string[] {
  return sessionFile
    .trim()
    .split("\n")
    .filter((line) => (JSON.parse(line) as { type: string }).type === "compaction");
}

function bash(command: string): ScriptedTurn {
  return { toolCalls: [{ name: "bash", arguments: { command } }] };
}

function read(path: string): ScriptedTurn {
  return { toolCalls: [{ name: "read", arguments: { path } }] };
}

function expectNoRawValue(text: string, ...raw: string[]): void {
  for (const value of raw) expect(text).not.toContain(value);
}

function expectRequestsClean(requests: ReadonlyArray<{ payload: unknown; context: unknown }>, ...raw: string[]): void {
  expect(requests.length).toBeGreaterThan(0);
  for (const request of requests) {
    expectNoRawValue(JSON.stringify(request.payload), ...raw);
    expectNoRawValue(JSON.stringify(request.context), ...raw);
  }
}

const PROTOCOL_ROLES = new Set(["user", "assistant", "toolResult"]);
const PROTOCOL_TYPES = new Set(["text", "image", "toolCall", "thinking"]);

interface PiMessagesPayload {
  model: string;
  context: { messages: Array<{ role: string; content: unknown }>; tools?: Array<{ name: string }> };
}

function expectPayloadStructure(requests: ReadonlyArray<{ payload: unknown; context: unknown }>): void {
  expect(requests.length).toBeGreaterThan(0);
  for (const request of requests) {
    const payload = request.payload as PiMessagesPayload;
    const context = request.context as PiMessagesPayload["context"];
    expect(Object.keys(payload)).toEqual(["model", "context", "options"]);
    expect(Object.keys(payload.context)).toEqual(Object.keys(context));
    expect(payload.context.tools?.map((tool) => tool.name)).toEqual(context.tools?.map((tool) => tool.name));
    expect(payload.context.messages.map(Object.keys)).toEqual(context.messages.map(Object.keys));
    for (const message of [...payload.context.messages, ...context.messages]) {
      expect(PROTOCOL_ROLES.has(message.role)).toBe(true);
      if (!Array.isArray(message.content)) continue;
      for (const block of message.content as Array<{ type: string }>) expect(PROTOCOL_TYPES.has(block.type)).toBe(true);
    }
  }
}

function toolUpdates(events: ReadonlyArray<{ type: string }>): string[] {
  return events
    .filter((event) => event.type === "tool_execution_update")
    .map((event) => JSON.stringify((event as unknown as { partialResult: unknown }).partialResult));
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

describe("real AgentSession with deterministic transport (TEST-09)", () => {
  it("keeps an ordinary prompt and an echoing assistant message out of requests and the session file", async () => {
    const h = await host({ script: [{ text: `Understood, I will remember ${SECRET} for you.` }] });

    await h.session.prompt(`Log in with ${SECRET} and tell me when done.`);

    expectRequestsClean(h.requests, SECRET);
    expect(JSON.stringify(h.requests[0]!.payload)).toContain(REFERENCE);
    const file = await h.readSessionFile();
    expectNoRawValue(file, SECRET);
    expect(file).toContain(`Log in with ${REFERENCE} and tell me when done.`);
    expect(file).toContain(`I will remember ${REFERENCE} for you.`);
    expect(h.extensionErrors).toEqual([]);
  });

  it("protects tool echoes, stderr, errors, metadata, output files, and every published tool update", async () => {
    const h = await host({
      script: [
        bash("cat secret.txt; cat secret.txt 1>&2; exit 2"),
        bash('s=$(cat secret.txt); for i in $(seq 1 2500); do echo "$i $s"; done'),
        { text: "Both commands ran." },
      ],
    });

    await h.session.prompt("Run the scripted commands.");

    expectRequestsClean(h.requests, SECRET);
    expect(h.requests).toHaveLength(3);
    const file = await h.readSessionFile();
    expectNoRawValue(file, SECRET);
    for (const update of toolUpdates(h.events)) expectNoRawValue(update, SECRET);
    expect(toolUpdates(h.events).length).toBeGreaterThan(0);

    const entries = file
      .trim()
      .split("\n")
      .map(
        (line) =>
          JSON.parse(line) as {
            type: string;
            message?: { role: string; content: unknown; details?: unknown; isError?: boolean };
          },
      );
    const toolResults = entries.filter((entry) => entry.type === "message" && entry.message?.role === "toolResult");
    expect(toolResults).toHaveLength(2);
    const [failed, truncated] = toolResults.map((entry) => entry.message!);
    expect(failed!.isError).toBe(true);
    expect(JSON.stringify(failed!.content)).toContain("Command exited with code 2");
    expect(JSON.stringify(failed!.content)).toContain(REFERENCE);
    const details = truncated!.details as {
      truncation?: { truncated: boolean; totalLines: number };
      fullOutputPath?: string;
    };
    expect(details.truncation?.truncated).toBe(true);
    expect(details.truncation?.totalLines).toBe(2500);
    expect(details.fullOutputPath).toBeDefined();
    const fullOutput = await readFile(details.fullOutputPath!, "utf8");
    expectNoRawValue(fullOutput, SECRET);
    expect(fullOutput).toContain(`2500 ${REFERENCE}`);
    expect(h.extensionErrors).toEqual([]);
  });

  it("keeps unrelated text at the end of a truncated bash result when it starts a registered value", async () => {
    const h = await host({
      register: false,
      script: [bash("seq 1 2500; printf 'all done\\n'"), { text: "Ran." }],
    });
    h.registry.register("token", "e-SECRET-0123456789");

    await h.session.prompt("Run it.");

    const file = await h.readSessionFile();
    expect(file).toContain("2500\\nall done\\n\\n[Showing lines");
    expectNoRawValue(file, REFERENCE);
    expect(h.extensionErrors).toEqual([]);
  });

  it("redacts a value wrapped in the reference syntax by a command", async () => {
    const h = await host({
      script: [bash("printf '[redacted:%s]\\n' \"$(cat secret.txt)\""), { text: "Wrapped." }],
    });

    await h.session.prompt("Wrap it.");

    expectRequestsClean(h.requests, SECRET);
    const file = await h.readSessionFile();
    expectNoRawValue(file, SECRET);
    expect(file).toContain(`[redacted:${REFERENCE}]`);
    expect(h.extensionErrors).toEqual([]);
  });

  it("redacts a value the built-in grep tool cut inside a match line", async () => {
    // Exceed the host's 500 character grep limit so the cut lands inside the value.
    const long = `sk-live-GREP-${"A".repeat(600)}`;
    const h = await host({
      register: false,
      tools: ["grep"],
      script: [{ toolCalls: [{ name: "grep", arguments: { pattern: "needle", path: "." } }] }, { text: "Searched." }],
    });
    h.registry.register("token", long);
    await writeFile(join(h.workspace.cwd, "match.txt"), `needle ${long}\n`);

    await h.session.prompt("Search the workspace.");

    const fragment = long.slice(0, 64);
    expectRequestsClean(h.requests, fragment);
    const file = await h.readSessionFile();
    expectNoRawValue(file, fragment);
    expect(file).toContain(REFERENCE);
    expect(h.extensionErrors).toEqual([]);
  });

  it("redacts follow-up input queued while the agent is streaming", async () => {
    const h = await host({
      script: [bash(`${PARK}; echo waited`), { text: "First done." }, { text: "Follow-up done." }],
    });

    const first = h.session.prompt("Start the slow command.");
    await h.waitUntilStreaming();
    await waitUntilParked(h.workspace.cwd);
    await h.session.prompt(`While you work, note ${SECRET}.`, { streamingBehavior: "followUp" });
    await release(h.workspace.cwd);
    await first;

    expectRequestsClean(h.requests, SECRET);
    const file = await h.readSessionFile();
    expectNoRawValue(file, SECRET);
    expect(file).toContain(`note ${REFERENCE}.`);
    expect(h.extensionErrors).toEqual([]);
  });

  it("redacts steering input delivered while the agent is streaming", async () => {
    const h = await host({
      script: [bash(`${PARK}; echo waited`), { text: "Steered." }],
    });

    const first = h.session.prompt("Start the slow command.");
    await h.waitUntilStreaming();
    await waitUntilParked(h.workspace.cwd);
    await h.session.prompt(`Change of plan: use ${SECRET}.`, { streamingBehavior: "steer" });
    await release(h.workspace.cwd);
    await first;

    expectRequestsClean(h.requests, SECRET);
    const file = await h.readSessionFile();
    expectNoRawValue(file, SECRET);
    expect(file).toContain(`use ${REFERENCE}.`);
    expect(h.extensionErrors).toEqual([]);
  });

  it("keeps compaction, its auxiliary model request, and the compaction entry clean", async () => {
    const h = await host({
      compaction: { enabled: true, keepRecentTokens: 0, reserveTokens: 1000 },
      script: [
        bash("cat secret.txt; echo"),
        { text: `The token is ${SECRET}.` },
        { text: `Summary: the user shared ${SECRET} and ran a command.` },
      ],
    });
    await h.session.prompt(`My token is ${SECRET}, run the scripted command.`);
    const requestsBefore = h.requests.length;

    const result = await h.session.compact();

    expect(h.requests.length).toBe(requestsBefore + 1);
    expectRequestsClean(h.requests, SECRET);
    expectNoRawValue(JSON.stringify(result), SECRET);
    const file = await h.readSessionFile();
    expectNoRawValue(file, SECRET);
    expect(file).toContain('"type":"compaction"');
    expect(h.extensionErrors).toEqual([]);
  });

  it("cancels compaction instead of persisting a summary whose redaction fails", async () => {
    const h = await host({
      compaction: { enabled: true, keepRecentTokens: 0, reserveTokens: 1000 },
      algorithms: {
        redactText: (text, entries) => {
          if (text.includes("FAIL-HERE")) throw new Error(`boom ${text}`);
          let output = text;
          for (const entry of entries) output = output.replaceAll(entry.value, referenceFor(entry.id));
          return output;
        },
      },
      script: [{ text: "Noted." }, { text: `FAIL-HERE summary with ${SECRET}` }],
    });
    await h.session.prompt(`Token ${SECRET}.`);

    await expect(h.session.compact()).rejects.toThrow(/cancelled/);

    const file = await h.readSessionFile();
    expectNoRawValue(file, SECRET, "FAIL-HERE");
    expect(file).not.toContain('"type":"compaction"');
    expect(h.ui.notify).toHaveBeenCalledWith(expect.stringMatching(/compaction was cancelled/), "error");
    for (const call of h.ui.notify.mock.calls) expectNoRawValue(String(call[0]), SECRET, "FAIL-HERE");
    expectNoRawValue(JSON.stringify(h.extensionErrors), SECRET, "FAIL-HERE");
  });

  it("keeps a branch summary and its auxiliary model request clean when navigating the session tree", async () => {
    const h = await host({
      script: [
        { text: `Noted ${SECRET}.` },
        { text: "Second answer." },
        { text: `Branch summary: the user shared ${SECRET}.` },
      ],
    });
    await h.session.prompt(`First: ${SECRET}.`);
    await h.session.prompt("Second question.");
    const firstUserEntry = h.session.sessionManager
      .getEntries()
      .find((entry) => entry.type === "message" && entry.message.role === "user");
    const requestsBefore = h.requests.length;

    const outcome = await h.session.navigateTree(firstUserEntry!.id, { summarize: true });

    expect(outcome.cancelled).toBe(false);
    expect(h.requests.length).toBe(requestsBefore + 1);
    expectRequestsClean(h.requests, SECRET);
    const file = await h.readSessionFile();
    expectNoRawValue(file, SECRET);
    expect(file).toContain('"type":"branch_summary"');
    expect(file).toContain(`Branch summary: the user shared ${REFERENCE}.`);
    expect(h.extensionErrors).toEqual([]);
  });

  it("redacts entries persisted before the value was registered when compaction summarizes them", async () => {
    const raw = await host({ register: false, script: [{ text: `Noted ${SECRET}.` }] });
    await raw.session.prompt(`Remember ${SECRET}.`);
    expect(await raw.readSessionFile()).toContain(SECRET);
    const h = await resume(raw, {
      compaction: { enabled: true, keepRecentTokens: 0, reserveTokens: 1000 },
      script: [{ text: "Summary: the user shared a token." }],
    });

    await h.session.compact();

    expect(h.requests).toHaveLength(1);
    expectRequestsClean(h.requests, SECRET);
    expect(JSON.stringify(h.requests[0]!.payload)).toContain(`Remember ${REFERENCE}.`);
    expectNoRawValue(compactionEntries(await h.readSessionFile()).join("\n"), SECRET);
    expect(h.extensionErrors).toEqual([]);
  });

  it("redacts earlier turns persisted before the value was registered when compaction summarizes them as history", async () => {
    const raw = await host({ register: false, script: [{ text: `Noted ${SECRET}.` }, { text: "Second answer." }] });
    await raw.session.prompt(`Remember ${SECRET}.`);
    await raw.session.prompt("Second question.");
    const h = await resume(raw, {
      compaction: { enabled: true, keepRecentTokens: 0, reserveTokens: 1000 },
      script: [{ text: "Summary: the user shared a token." }, { text: "Turn context: a second question." }],
    });

    await h.session.compact();

    // The cut splits the second turn, so the first turn is summarized as history in its own request.
    expect(h.requests).toHaveLength(2);
    expectRequestsClean(h.requests, SECRET);
    expect(JSON.stringify(h.requests[0]!.payload)).toContain(`Remember ${REFERENCE}.`);
    expect(JSON.stringify(h.requests[0]!.payload)).toContain(`Noted ${REFERENCE}.`);
    expectNoRawValue(compactionEntries(await h.readSessionFile()).join("\n"), SECRET);
    expect(h.extensionErrors).toEqual([]);
  });

  it("redacts entries persisted before the value was registered when a branch summary covers them", async () => {
    const raw = await host({ register: false, script: [{ text: `Noted ${SECRET}.` }, { text: "Second answer." }] });
    await raw.session.prompt("First question.");
    await raw.session.prompt(`Second: ${SECRET}.`);
    const h = await resume(raw, { script: [{ text: "Branch summary: the user shared a token." }] });
    const firstUserEntry = h.session.sessionManager
      .getEntries()
      .find((entry) => entry.type === "message" && entry.message.role === "user");

    const outcome = await h.session.navigateTree(firstUserEntry!.id, { summarize: true });

    expect(outcome.cancelled).toBe(false);
    expect(h.requests).toHaveLength(1);
    expectRequestsClean(h.requests, SECRET);
    expect(JSON.stringify(h.requests[0]!.payload)).toContain(`Second: ${REFERENCE}.`);
    expect(JSON.stringify(h.requests[0]!.payload)).toContain(`Noted ${REFERENCE}.`);
    expect(h.extensionErrors).toEqual([]);
  });

  it("cancels compaction before any request when the entries to summarize cannot be redacted", async () => {
    const raw = await host({ register: false, script: [{ text: "Noted." }] });
    await raw.session.prompt(`FAIL-HERE ${SECRET}.`);
    const h = await resume(raw, {
      compaction: { enabled: true, keepRecentTokens: 0, reserveTokens: 1000 },
      algorithms: {
        redactText: (text, entries) => {
          if (text.includes("FAIL-HERE")) throw new Error(`boom ${text}`);
          let output = text;
          for (const entry of entries) output = output.replaceAll(entry.value, referenceFor(entry.id));
          return output;
        },
      },
      script: [{ text: "Summary that must never be requested." }],
    });

    await expect(h.session.compact()).rejects.toThrow(/cancelled/);

    expect(h.requests).toHaveLength(0);
    expect(compactionEntries(await h.readSessionFile())).toEqual([]);
    expect(h.ui.notify).toHaveBeenCalledWith(expect.stringMatching(/compaction was cancelled/), "error");
    for (const call of h.ui.notify.mock.calls) expectNoRawValue(String(call[0]), SECRET, "FAIL-HERE");
    expectNoRawValue(JSON.stringify(h.extensionErrors), SECRET, "FAIL-HERE");
  });

  it("cancels a branch summary before any request when the entries to summarize cannot be redacted", async () => {
    const raw = await host({ register: false, script: [{ text: "Noted." }, { text: "Second answer." }] });
    await raw.session.prompt("First question.");
    await raw.session.prompt(`FAIL-HERE ${SECRET}.`);
    const h = await resume(raw, {
      algorithms: {
        redactText: (text, entries) => {
          if (text.includes("FAIL-HERE")) throw new Error(`boom ${text}`);
          let output = text;
          for (const entry of entries) output = output.replaceAll(entry.value, referenceFor(entry.id));
          return output;
        },
      },
      script: [{ text: "Branch summary that must never be requested." }],
    });
    const firstUserEntry = h.session.sessionManager
      .getEntries()
      .find((entry) => entry.type === "message" && entry.message.role === "user");

    const outcome = await h.session.navigateTree(firstUserEntry!.id, { summarize: true });

    expect(outcome.cancelled).toBe(true);
    expect(h.requests).toHaveLength(0);
    expect(await h.readSessionFile()).not.toContain('"type":"branch_summary"');
    expect(h.ui.notify).toHaveBeenCalledWith(expect.stringMatching(/branch summary could not be protected/), "error");
    for (const call of h.ui.notify.mock.calls) expectNoRawValue(String(call[0]), SECRET, "FAIL-HERE");
    expectNoRawValue(JSON.stringify(h.extensionErrors), SECRET, "FAIL-HERE");
  });

  it("keeps resumed context clean when the session file is opened again", async () => {
    const first = await host({ script: [{ text: `Noted ${SECRET}.` }] });
    await first.session.prompt(`Remember ${SECRET}.`);
    const sessionFile = first.session.sessionFile!;
    first.session.dispose();

    const resumed = await createSyntheticHost({
      workspace: first.workspace,
      sessionFile,
      register: undefined,
      script: [{ text: "Resumed." }],
    } as SyntheticHostOptions);
    cleanups.push(resumed.cleanup);
    await resumed.session.prompt("Continue.");

    expect(resumed.requests).toHaveLength(1);
    const payload = JSON.stringify(resumed.requests[0]!.payload);
    expectNoRawValue(payload, SECRET);
    expect(payload).toContain(`Remember ${REFERENCE}.`);
    expect(payload).toContain("Continue.");
    expectNoRawValue(await resumed.readSessionFile(), SECRET);
  });

  it("keeps model requests clean when a third-party extension injects a raw value into the context", async () => {
    const thirdParty: ExtensionFactory = (pi) => {
      pi.on("before_agent_start", () => ({
        message: { customType: "third-party", content: `Injected context: ${SECRET}`, display: false },
      }));
    };
    const h = await host({ script: [{ text: "Seen." }], extraExtensions: [thirdParty] });

    await h.session.prompt("Hello.");

    expectRequestsClean(h.requests, SECRET);
    expect(JSON.stringify(h.requests[0]!.payload)).toContain(`Injected context: ${REFERENCE}`);
  });

  it("redacts the provider payload when a later context handler injects a raw value after the context pass", async () => {
    const thirdParty: ExtensionFactory = (pi) => {
      pi.on("context", (event) => ({
        messages: [...event.messages, { role: "user", content: `Late context: ${SECRET}`, timestamp: Date.now() }],
      }));
    };
    const h = await host({ script: [{ text: "Seen." }], extraExtensions: [thirdParty] });

    await h.session.prompt("Hello.");

    expect(h.requests).toHaveLength(1);
    const payload = JSON.stringify(h.requests[0]!.payload);
    expectNoRawValue(payload, SECRET);
    expect(payload).toContain(`Late context: ${REFERENCE}`);
    // Keep raw text in the `pi-ai` transport context to prove the payload hook provided the protection.
    expect(JSON.stringify(h.requests[0]!.context)).toContain(SECRET);
    expectNoRawValue(await h.readSessionFile(), SECRET);
  });

  it("redacts a value carried as bytes in a third-party tool's details before persistence and model requests", async () => {
    const thirdParty: ExtensionFactory = (pi) => {
      pi.registerTool({
        name: "probe",
        label: "Probe",
        description: "Returns bytes in its details.",
        parameters: Type.Object({}),
        execute: async () => ({
          content: [{ type: "text", text: "probed" }],
          details: { bytes: Buffer.from(`raw ${SECRET}`) },
        }),
      });
    };
    const h = await host({
      tools: ["bash", "probe"],
      script: [{ toolCalls: [{ name: "probe", arguments: {} }] }, { text: "Done." }],
      extraExtensions: [thirdParty],
    });

    await h.session.prompt("Probe.");

    expect(h.extensionErrors).toEqual([]);
    expectRequestsClean(h.requests, SECRET);
    const file = await h.readSessionFile();
    expectNoRawValue(file, SECRET);
    const toolResult = file
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { type: string; message?: { role: string; details?: unknown } })
      .find((entry) => entry.type === "message" && entry.message?.role === "toolResult")?.message;
    const bytes = (toolResult?.details as { bytes?: { type?: string; data?: number[] } } | undefined)?.bytes;
    expect(bytes?.type).toBe("Buffer");
    expect(Buffer.from(bytes!.data!).toString("utf8")).toBe(`raw ${REFERENCE}`);
  });

  it("registers a second value later and redacts both, including overlapping mentions", async () => {
    const h = await host({ script: [{ text: `Pair: ${SECRET}${SECOND}` }] });
    h.registry.register("second", SECOND);

    await h.session.prompt(`Both: ${SECRET} ${SECOND} ${SECRET}`);

    expectRequestsClean(h.requests, SECRET, SECOND);
    const file = await h.readSessionFile();
    expectNoRawValue(file, SECRET, SECOND);
    expect(file).toContain(`Both: ${REFERENCE} ${referenceFor("second")} ${REFERENCE}`);
    expect(file).toContain(`Pair: ${REFERENCE}${referenceFor("second")}`);
  });

  it("leaves shared tool arguments unchanged for other extensions and the session file", async () => {
    const seen: unknown[] = [];
    const observer: ExtensionFactory = (pi) => {
      pi.on("tool_call", (event) => {
        seen.push(structuredClone(event.input));
      });
    };
    const command = "echo plain-argument";
    const h = await host({ script: [bash(command), { text: "Done." }], extraExtensions: [observer] });

    await h.session.prompt("Run it.");

    expect(seen).toEqual([{ command }]);
    const file = await h.readSessionFile();
    expect(file).toContain(JSON.stringify({ command }));
    expect(h.extensionErrors).toEqual([]);
  });

  it("does not send the prompt when input redaction fails, and explains without the raw text", async () => {
    const h = await host({
      algorithms: {
        redactText: (text) => {
          throw new Error(`cannot redact ${text}`);
        },
      },
      script: [{ text: "never" }],
    });

    await h.session.prompt(`Send ${SECRET} now.`);

    expect(h.requests).toHaveLength(0);
    expect(h.ui.notify).toHaveBeenCalledWith(expect.stringMatching(/redaction failed/), "error");
    for (const call of h.ui.notify.mock.calls) expectNoRawValue(String(call[0]), SECRET);
    // If the host created a file despite rejecting input, verify that it contains no submitted text.
    if (h.session.sessionFile && (await pathExists(h.session.sessionFile))) {
      expectNoRawValue(await h.readSessionFile(), SECRET, "Send ");
    }
    expectNoRawValue(JSON.stringify(h.extensionErrors), SECRET);
  });

  it("withholds a finalized message or tool result whose redaction fails instead of persisting it raw", async () => {
    const h = await host({
      algorithms: {
        redactText: (text, entries) => {
          if (text.includes("FAIL-HERE")) throw new Error(`boom ${text}`);
          let output = text;
          for (const entry of entries) output = output.replaceAll(entry.value, referenceFor(entry.id));
          return output;
        },
      },
      // Assemble the marker during execution so shared tool arguments do not trigger assistant message withholding.
      script: [bash("printf 'FAIL-%s\\n' HERE; cat secret.txt"), { text: `FAIL-HERE ${SECRET}` }],
    });

    await h.session.prompt("Go.");

    expectRequestsClean(h.requests, SECRET);
    const file = await h.readSessionFile();
    expectNoRawValue(file, SECRET, "FAIL-HERE");
    expect(file).toContain("withheld");
    const entries = file
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { type: string; message?: { role: string; isError?: boolean } });
    const toolResult = entries.find((entry) => entry.type === "message" && entry.message?.role === "toolResult");
    expect(toolResult?.message?.isError).toBe(true);
    expect(entries.some((entry) => entry.type === "message" && entry.message?.role === "assistant")).toBe(true);
    expectNoRawValue(JSON.stringify(h.extensionErrors), SECRET, "FAIL-HERE");
  });

  it("keeps roles, pairing fields, tool names, and property names intact when their words are registered, and still persists redacted text", async () => {
    const h = await host({ script: [bash("cat secret.txt"), { text: `assistant says ${SECRET}` }] });
    h.registry.register("role", "assistant");
    h.registry.register("tool", "bash");
    h.registry.register("stop", "toolUse");
    h.registry.register("block", "text");
    h.registry.register("field-a", "content");
    h.registry.register("field-b", "messages");
    h.registry.register("field-c", "tools");

    await h.session.prompt("Go.");

    expect(h.extensionErrors).toEqual([]);
    expectRequestsClean(h.requests, SECRET);
    expectPayloadStructure(h.requests);
    const toolPayload = (h.requests[1]!.payload as PiMessagesPayload).context;
    expect(toolPayload.tools?.map((tool) => tool.name)).toEqual(["bash"]);
    expect(toolPayload.messages.at(-1)).toMatchObject({ role: "toolResult", toolName: "bash" });
    const file = await h.readSessionFile();
    expectNoRawValue(file, SECRET);
    const messages = file
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { type: string; message?: Record<string, unknown> })
      .filter((entry) => entry.type === "message")
      .map((entry) => entry.message!);
    const assistants = messages.filter((message) => message.role === "assistant");
    expect(assistants.length).toBeGreaterThanOrEqual(2);
    expect(assistants.map((message) => message.stopReason)).toEqual(["toolUse", "stop"]);
    const toolCall = (assistants[0]!.content as Array<{ type: string; name?: string }>).find(
      (block) => block.type === "toolCall",
    );
    expect(toolCall?.name).toBe("bash");
    const toolResult = messages.find((message) => message.role === "toolResult");
    expect(toolResult).toBeDefined();
    expect(toolResult!.toolName).toBe("bash");
    const toolContent = toolResult!.content as Array<{ type: string; text: string }>;
    expect(toolContent.map((block) => block.type)).toEqual(["text"]);
    expect(toolContent[0]!.text).toContain(REFERENCE);
    expect(JSON.stringify(assistants[1]!.content)).toContain(`${referenceFor("role")} says ${REFERENCE}`);
  });

  it("redacts a registered value used as a tool argument name in requests and the session file", async () => {
    const h = await host({
      script: [
        { toolCalls: [{ name: "bash", arguments: { command: "echo keyed", [SECRET]: "value" } }] },
        { text: "Done." },
      ],
    });

    await h.session.prompt("Go.");

    expectRequestsClean(h.requests, SECRET);
    const file = await h.readSessionFile();
    expectNoRawValue(file, SECRET);
    expect(file).toContain(`"${REFERENCE}":"value"`);
  });

  it("rebuilds a withheld assistant message without copying its provider, model, or api fields", async () => {
    const h = await host({
      algorithms: {
        redactText: (text, entries) => {
          if (text.includes("FAIL-HERE")) throw new Error(`boom ${text}`);
          let output = text;
          for (const entry of entries) output = output.replaceAll(entry.value, referenceFor(entry.id));
          return output;
        },
      },
      script: [{ text: `FAIL-HERE ${SECRET}` }],
    });

    await h.session.prompt("Go.");

    const file = await h.readSessionFile();
    expectNoRawValue(file, SECRET, "FAIL-HERE");
    const assistant = file
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { type: string; message?: Record<string, unknown> })
      .find((entry) => entry.type === "message" && entry.message?.role === "assistant")?.message;
    expect(assistant).toBeDefined();
    expect(assistant!.provider).toBe("redactor-withheld");
    expect(assistant!.model).toBe("redactor-withheld");
    expect(assistant!.api).toBe("redactor-withheld");
    expect(assistant!.stopReason).toBe("stop");
    expect(JSON.stringify(assistant!.content)).toContain("withheld");
    expect(h.extensionErrors).toEqual([]);
  });

  it("redacts a reference-shaped registered value from prompts, tool output, requests, and the session file", async () => {
    const shaped = "[redacted:private-value]";
    const h = await host({ script: [bash("cat shaped.txt"), { text: `Echo ${shaped}.` }] });
    h.registry.register("shaped", shaped);
    await writeFile(join(h.workspace.cwd, "shaped.txt"), shaped);

    await h.session.prompt(`Use ${shaped} now.`);

    expectRequestsClean(h.requests, "private-value");
    const file = await h.readSessionFile();
    expectNoRawValue(file, "private-value");
    expect(file).toContain(`Use ${referenceFor("shaped")} now.`);
    expect(file).toContain(`Echo ${referenceFor("shaped")}.`);
    expect(h.extensionErrors).toEqual([]);
  });

  it("keeps redacting a replaced value after a new value is registered under the same id", async () => {
    const h = await host({ script: [{ text: `Both ${SECRET} and ${SECOND}.` }] });
    h.registry.retainForRedaction("token");
    h.registry.register("token", SECOND);

    await h.session.prompt(`Old ${SECRET}, new ${SECOND}.`);

    expectRequestsClean(h.requests, SECRET, SECOND);
    const file = await h.readSessionFile();
    expectNoRawValue(file, SECRET, SECOND);
    expect(file).toContain(`Old ${REFERENCE}, new ${REFERENCE}.`);
    expect(h.extensionErrors).toEqual([]);
  });

  it("redacts a multiline value that the read tool would otherwise cut at its line limit", async () => {
    const head = "sk-live-MULTILINE-HEAD-0123456789";
    const multiline = `${head}\nMULTILINE-TAIL-9876543210`;
    const h = await host({ tools: ["bash", "read"], script: [read("long.txt"), { text: "Read it." }] });
    h.registry.register("multiline", multiline);
    const filler = Array.from({ length: 1999 }, (_, index) => `line ${index + 1}`);
    await writeFile(join(h.workspace.cwd, "long.txt"), [...filler, multiline, "after"].join("\n"));

    await h.session.prompt("Read the long file.");

    expect(h.extensionErrors).toEqual([]);
    expectRequestsClean(h.requests, head);
    expect(JSON.stringify(h.requests.at(-1)!.payload)).toContain(referenceFor("multiline"));
    expectNoRawValue(await h.readSessionFile(), head);
  });

  it("keeps the secret file itself untouched and writes no value into the agent directory", async () => {
    const h = await host({ script: [bash("cat secret.txt"), { text: "ok" }] });

    await h.session.prompt("Read it.");

    expect(await readFile(join(h.workspace.cwd, "secret.txt"), "utf8")).toBe(SECRET);
    const authPath = join(h.workspace.agentDir, "auth.json");
    if (await pathExists(authPath)) expectNoRawValue(await readFile(authPath, "utf8"), SECRET);
  });
});
