import { describe, expect, it } from "vitest";
import { isBlockedText, evaluateText, BLOCK_REASON, isDestructiveText } from "../lib/policy.js";

describe("security policy", () => {
  it.each([
    "printenv",
    "env | sort",
    "bash -lc 'printenv'",
    "export -p",
    "declare -x",
    "set",
    "cat .env",
    "cat .env.local",
    "cat ~/.aws/credentials",
    "cat ~/.ssh/id_rsa",
    "cat ~/.zsh_history",
    "gh auth token",
    "gcloud auth print-access-token",
    "aws configure export-credentials",
    "az account get-access-token",
  ])("blocks %s", (text) => {
    expect(isBlockedText(text)).toBe(true);
  });

  it.each([
    "echo hello",
    "envsubst < template.txt",
    "cat .env.example",
    "cat .env.template",
    "grep environment README.md",
    "npm test",
  ])("allows %s", (text) => {
    expect(isBlockedText(text)).toBe(false);
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

  it("returns the shared block reason", () => {
    expect(evaluateText("printenv")).toEqual({
      blocked: true,
      reason: BLOCK_REASON,
    });
  });
});
