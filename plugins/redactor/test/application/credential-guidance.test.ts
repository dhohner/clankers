import { describe, expect, it } from "vitest";
import { credentialGuidance } from "../../src/application/credential-guidance.ts";
import { referenceFor } from "../../src/domain/text-redaction.ts";

const ACTIVE = { name: "GITHUB_TOKEN", label: "GitHub", reference: "cred-0123456789", state: "active" as const };
const MISSING = { name: "SLACK_TOKEN", label: "Slack", reference: undefined, state: "unavailable" as const };
const NOTHING_INSTALLED = { approvedExecution: false, privateEntry: false };

describe("credential guidance", () => {
  it("is absent without bindings", () => {
    expect(credentialGuidance([], NOTHING_INSTALLED)).toBeUndefined();
  });

  it("lists labels, references, and availability without values", () => {
    const text = credentialGuidance([ACTIVE, MISSING], NOTHING_INSTALLED)!;

    expect(text).toContain(`${referenceFor("cred-0123456789")}: GitHub (environment variable GITHUB_TOKEN), active`);
    expect(text).toContain("unavailable: Slack, no value in this Pi process");
    expect(text).not.toContain("SLACK_TOKEN");
  });

  it("explains approved Bash reference use and private entry for missing credentials", () => {
    const text = credentialGuidance([ACTIVE], NOTHING_INSTALLED)!;

    expect(text).toMatch(/put the reference in a bash command/i);
    expect(text).toMatch(/user approves/i);
    expect(text).toMatch(/provide it privately/i);
    expect(text).toMatch(/do not search the environment/i);
  });

  it("states that execution and private entry are not installed until a capability provides them", () => {
    const without = credentialGuidance([ACTIVE], NOTHING_INSTALLED)!;
    const withBoth = credentialGuidance([ACTIVE], { approvedExecution: true, privateEntry: true })!;

    expect(without).toContain("no approved execution capability is installed");
    expect(without).toContain("Private entry is not installed");
    expect(withBoth).not.toContain("not installed");
  });

  it("is identical for identical bindings so repeated requests keep their references", () => {
    expect(credentialGuidance([ACTIVE, MISSING], NOTHING_INSTALLED)).toBe(
      credentialGuidance([{ ...ACTIVE }, { ...MISSING }], NOTHING_INSTALLED),
    );
  });
});
