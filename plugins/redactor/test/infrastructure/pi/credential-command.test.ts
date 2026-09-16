import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { credentialGuidance } from "../../../src/application/credential-guidance.ts";
import { CredentialSources } from "../../../src/application/credential-sources.ts";
import { RedactionEngine } from "../../../src/application/redaction-engine.ts";
import { CredentialRegistry } from "../../../src/domain/credential-registry.ts";
import { SelectionFile } from "../../../src/infrastructure/node/selection-file.ts";
import { runCredentialCommand } from "../../../src/infrastructure/pi/credential-command.ts";

const VALUE = "sk-live-COMMAND-0123456789";
const PASTED_TOKEN = "ghp_PASTEDCOMMANDTOKEN0123456789ABCDEFGH";
const NOTHING_INSTALLED = { approvedExecution: false, privateEntry: false };

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

async function sources(environment: Record<string, string> = {}) {
  const root = await mkdtemp(join(tmpdir(), "redactor-command-"));
  cleanups.push(() => rm(root, { recursive: true, force: true }));
  const registry = new CredentialRegistry();
  const path = join(root, "credentials.json");
  const s = new CredentialSources({
    file: new SelectionFile(path),
    registry,
    engine: new RedactionEngine(registry),
    readVariable: (name) => environment[name],
  });
  return Object.assign(s, { path });
}

const confirmed = { confirmUnavailable: () => Promise.resolve(true) };

describe("/redactor command feedback", () => {
  it("shows usage for no arguments or an unknown subcommand", async () => {
    const s = await sources();

    expect(await runCredentialCommand(s, "")).toMatchObject({
      level: "info",
      text: expect.stringContaining("/redactor add NAME label"),
    });
    expect(await runCredentialCommand(s, "bogus")).toMatchObject({
      level: "warning",
      text: expect.stringContaining("/redactor list"),
    });
  });

  it("reports an added selection with its reference and never its value", async () => {
    const s = await sources({ GITHUB_TOKEN: VALUE });
    const confirm = vi.fn();

    const notice = await runCredentialCommand(s, "add GITHUB_TOKEN GitHub API", { confirmUnavailable: confirm });

    expect(confirm).not.toHaveBeenCalled();
    expect(notice.level).toBe("info");
    expect(notice.text).toMatch(/selected GITHUB_TOKEN \(GitHub API\).*\[redacted:cred-[0-9a-f]{10}\]/s);
    expect(notice.text).not.toContain(VALUE);
    expect(s.list()[0]!.label).toBe("GitHub API");
  });

  it("selects a confirmed name without a value and explains how to make it available", async () => {
    const s = await sources();
    const confirm = vi.fn(() => Promise.resolve(true));

    const notice = await runCredentialCommand(s, "add MISSING Missing", { confirmUnavailable: confirm });

    expect(confirm).toHaveBeenCalledWith("MISSING", "Missing");
    expect(notice.level).toBe("warning");
    expect(notice.text).toContain("unavailable");
    expect(notice.text).toContain("start Pi from a shell that exports it");
    expect(s.selectedNames()).toEqual(["MISSING"]);
  });

  it("stores nothing and shows the model nothing when a name without a value is declined", async () => {
    const s = await sources();
    const confirm = vi.fn(() => Promise.resolve(false));

    const notice = await runCredentialCommand(s, `add ${PASTED_TOKEN} GitHub`, { confirmUnavailable: confirm });

    expect(confirm).toHaveBeenCalledWith(PASTED_TOKEN, "GitHub");
    expect(notice).toEqual({ text: "redactor: selection cancelled; nothing was stored", level: "info" });
    expect(s.selectedNames()).toEqual([]);
    await expect(readFile(s.path, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    expect(credentialGuidance(s.list(), NOTHING_INSTALLED)).toBeUndefined();
  });

  it("refuses a name without a value when no confirmation channel exists, without echoing it", async () => {
    const s = await sources();

    const notice = await runCredentialCommand(s, `add ${PASTED_TOKEN} GitHub`);

    expect(notice.level).toBe("error");
    expect(notice.text).toContain("interactive terminal");
    expect(notice.text).not.toContain(PASTED_TOKEN);
    expect(s.selectedNames()).toEqual([]);
    await expect(readFile(s.path, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects a label that contains the selected variable's value without echoing it", async () => {
    const s = await sources({ GITHUB_TOKEN: VALUE });

    const notice = await runCredentialCommand(s, `add GITHUB_TOKEN pasted ${VALUE}`);

    expect(notice.level).toBe("error");
    expect(notice.text).not.toContain(VALUE);
    expect(s.selectedNames()).toEqual([]);
    await expect(readFile(s.path, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("validates a name before asking for confirmation", async () => {
    const s = await sources();
    const confirm = vi.fn(() => Promise.resolve(true));

    const notice = await runCredentialCommand(s, "add sk-live-PASTED GitHub", { confirmUnavailable: confirm });

    expect(confirm).not.toHaveBeenCalled();
    expect(notice.level).toBe("error");
    expect(notice.text).not.toContain("sk-live-PASTED");
  });

  it("does not ask again for a selection that already exists", async () => {
    const s = await sources();
    await runCredentialCommand(s, "add MISSING Missing", confirmed);
    const confirm = vi.fn(() => Promise.resolve(false));

    const notice = await runCredentialCommand(s, "add MISSING Renamed", { confirmUnavailable: confirm });

    expect(confirm).not.toHaveBeenCalled();
    expect(notice.text).toContain("relabeled");
  });

  it("reports unchanged and relabeled selections", async () => {
    const s = await sources({ GITHUB_TOKEN: VALUE });
    await runCredentialCommand(s, "add GITHUB_TOKEN GitHub");

    expect((await runCredentialCommand(s, "add GITHUB_TOKEN GitHub")).text).toContain("already selected");
    expect((await runCredentialCommand(s, "add GITHUB_TOKEN GitHub Enterprise")).text).toContain("relabeled");
  });

  it("lists selections with names, labels, references, and availability", async () => {
    const s = await sources({ GITHUB_TOKEN: VALUE });
    await runCredentialCommand(s, "add GITHUB_TOKEN GitHub");
    await runCredentialCommand(s, "add SLACK_TOKEN Slack", confirmed);
    s.approve({ name: "NPM_TOKEN", label: "npm" });

    const notice = await runCredentialCommand(s, "list");

    expect(notice.text).toMatch(/GITHUB_TOKEN\s+GitHub\s+\[redacted:cred-[0-9a-f]{10}\]\s+active/);
    expect(notice.text).toMatch(/SLACK_TOKEN\s+Slack\s+unavailable/);
    expect(notice.text).toMatch(/NPM_TOKEN\s+npm\s+unavailable.*project, until Pi exits/);
    expect(notice.text).not.toContain(VALUE);
  });

  it("keeps the project marker on a listing whose name is redacted by a later value", async () => {
    const s = await sources({ NPM_TOKEN: VALUE, HOLDER: "TOKEN" });
    s.approve({ name: "NPM_TOKEN", label: "npm" });
    await runCredentialCommand(s, "add HOLDER Holder");

    const notice = await runCredentialCommand(s, "list");

    expect(notice.text).toMatch(/NPM_\[redacted:cred-[0-9a-f]{10}\]\s+npm\s+.*project, until Pi exits/);
    expect(notice.text).not.toContain("NPM_TOKEN");
  });

  it("reports a refused value as selected, unusable, and unredacted without echoing it", async () => {
    const s = await sources({ BROKEN: "[" });

    const notice = await runCredentialCommand(s, "add BROKEN Broken");

    expect(notice.level).toBe("warning");
    expect(notice.text).toContain("selected BROKEN (Broken); refused");
    expect(notice.text).toContain("not redacted");
    expect(notice.text).not.toContain("[");
    expect((await runCredentialCommand(s, "list")).text).toMatch(/BROKEN\s+Broken\s+refused/);
  });

  it("reports validation problems and missing arguments without echoing arguments", async () => {
    const s = await sources();

    expect(await runCredentialCommand(s, "add 1BAD-NAME Label")).toMatchObject({
      level: "error",
      text: expect.not.stringContaining("1BAD-NAME"),
    });
    expect(await runCredentialCommand(s, "remove sk-live-PASTED-VALUE")).toMatchObject({
      level: "error",
      text: expect.not.stringContaining("PASTED"),
    });
    expect(await runCredentialCommand(s, "add ONLY_NAME")).toMatchObject({ level: "error" });
    expect(await runCredentialCommand(s, "remove")).toMatchObject({ level: "error" });
  });

  it("reports removal and a name that is not selected", async () => {
    const s = await sources({ GITHUB_TOKEN: VALUE });
    await runCredentialCommand(s, "add GITHUB_TOKEN GitHub");

    expect((await runCredentialCommand(s, "remove GITHUB_TOKEN")).text).toContain(
      "removed GITHUB_TOKEN from the selection; its last value stays redacted",
    );
    await runCredentialCommand(s, "add MISSING Missing", confirmed);
    expect((await runCredentialCommand(s, "remove MISSING")).text).toBe("redactor: removed MISSING from the selection");
    expect(await runCredentialCommand(s, "remove GITHUB_TOKEN")).toMatchObject({
      level: "warning",
      text: expect.stringContaining("not selected"),
    });
  });
});
