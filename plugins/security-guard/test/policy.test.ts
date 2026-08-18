import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  BLOCK_REASON,
  createdTemporaryDirectoryFromCommand,
  evaluateText,
  isBlockedText,
  isDestructiveText,
  removedTrackedTemporaryDirectories,
} from "../lib/policy.js";

// Shared with test/security-guard.bats so the TypeScript policy and scripts/block-fups.sh,
// which reimplement the same patterns for different hosts, cannot drift apart unnoticed.
const blockedTextCases: Array<{ command: string; blocked: boolean }> = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "fixtures/blocked-text-cases.json"), "utf8"),
);

describe("security policy", () => {
  it.each(blockedTextCases)("blocked=$blocked for $command", ({ command, blocked }) => {
    expect(isBlockedText(command)).toBe(blocked);
  });

  it.each([
    "rm file.txt",
    "rm -rf dist",
    "sudo rm -rf dist",
    "command rm file.txt",
    "KEEP=1 rm file.txt",
    "env -i rm file.txt",
    "mv -f old new",
    "mv old /tmp/new",
    "mv *.txt docs/",
    "truncate -s 0 file.txt",
    "dd if=/dev/zero of=disk.img",
    "mkfs /dev/disk1",
    "chmod 777 file.txt",
    "chmod -R 644 dist",
    "chmod 644 .env",
    "chown root file.txt",
    "chown -R user dist",
    "git reset --hard",
    "git clean -fd",
    "git clean -df",
    "git clean -f -d",
    "git push --force",
    "bash -lc 'rm file.txt'",
    "find . -name '*.tmp' -exec rm {} ;",
    "find . -name '*.tmp' -execdir rm {} +",
    "printf '%s\n' file.txt | xargs rm",
    "printf '%s\n' file.txt | xargs -I {} rm {}",
  ])("requires approval for %s", (text) => {
    expect(isDestructiveText(text)).toBe(true);
  });

  it.each([
    "echo rm",
    "grep mv README.md",
    "mv old new",
    "chmod 644 file.txt",
    "chown user file.txt",
    "printf '%s\n' rm | xargs echo",
  ])("does not require approval for %s", (text) => {
    expect(isDestructiveText(text)).toBe(false);
  });

  it.each([
    ["mktemp -d", "/tmp/work.123\n", "/tmp/work.123"],
    ["mktemp -d\n", "/tmp/work.123\n", "/tmp/work.123"],
    ["\n mktemp -d \n\n", "/tmp/work.123\n", "/tmp/work.123"],
    ["mktemp -dt work", "/tmp/work.123\n", "/tmp/work.123"],
    ["mktemp", "/tmp/work.123\n", undefined],
    ["mktemp -d\necho done", "/tmp/work.123\n", undefined],
    ["mktemp -d; echo /tmp/other", "/tmp/work.123\n", undefined],
    ["mktemp -d", "/tmp/work.123\n/tmp/other\n", undefined],
    ["mktemp -d", "relative-work\n", undefined],
  ])("extracts temporary directories from %s", (command, output, expected) => {
    expect(createdTemporaryDirectoryFromCommand(command, output)).toBe(expected);
  });

  it("allows rm only when every target is an exact tracked temporary directory", () => {
    const tracked = new Set(["/tmp/work.123", "/tmp/work.456"]);

    expect(removedTrackedTemporaryDirectories("rm -rf '/tmp/work.123'", tracked)).toEqual(["/tmp/work.123"]);
    expect(removedTrackedTemporaryDirectories("rm -rf /tmp/work.123\n", tracked)).toEqual(["/tmp/work.123"]);
    expect(removedTrackedTemporaryDirectories("rm -rf /tmp/work.123\nrm file.txt", tracked)).toBeUndefined();
    expect(removedTrackedTemporaryDirectories("rm -rf /tmp/work.123 /tmp/work.456", tracked)).toEqual([
      "/tmp/work.123",
      "/tmp/work.456",
    ]);
    expect(removedTrackedTemporaryDirectories("rm -rf /tmp/work.123/child", tracked)).toBeUndefined();
    expect(removedTrackedTemporaryDirectories("rm -rf /tmp/work.123 /tmp/other", tracked)).toBeUndefined();
    expect(removedTrackedTemporaryDirectories("rm -rf /tmp/work.123; rm file.txt", tracked)).toBeUndefined();
  });

  it("returns the shared block reason", () => {
    expect(evaluateText("printenv")).toEqual({
      blocked: true,
      reason: BLOCK_REASON,
    });
  });
});
