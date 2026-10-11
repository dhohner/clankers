import { describe, expect, it } from "vitest";
import { resolveStartupStyle } from "../../src/session/startup-selection.ts";
import { DEFAULT_STYLE, type StyleDefinition } from "../../src/styles/types.ts";

function style(name: string): StyleDefinition {
  return { name, description: `${name} style.`, instructions: `${name} text.`, source: "user" };
}

const STYLES = [DEFAULT_STYLE, style("brief"), style("terse")];

describe("resolveStartupStyle", () => {
  it("uses the flag value over persisted values", () => {
    const resolution = resolveStartupStyle({
      flagValue: "brief",
      projectValue: "terse",
      globalValue: "terse",
      styles: STYLES,
    });

    expect(resolution.style.name).toBe("brief");
    expect(resolution.unknown).toEqual([]);
  });

  it("uses the project value over the global value without a flag", () => {
    const resolution = resolveStartupStyle({ projectValue: "brief", globalValue: "terse", styles: STYLES });
    expect(resolution.style.name).toBe("brief");
    expect(resolution.unknown).toEqual([]);
  });

  it("uses the global value without a flag and a project value", () => {
    const resolution = resolveStartupStyle({ globalValue: "terse", styles: STYLES });
    expect(resolution.style.name).toBe("terse");
    expect(resolution.unknown).toEqual([]);
  });

  it("falls back to the default style without any value", () => {
    const resolution = resolveStartupStyle({ styles: STYLES });
    expect(resolution.style).toBe(DEFAULT_STYLE);
    expect(resolution.unknown).toEqual([]);
  });

  it("skips unknown values, records them, and continues the resolution", () => {
    const resolution = resolveStartupStyle({
      flagValue: "missing-flag",
      projectValue: "missing-project",
      globalValue: "terse",
      styles: STYLES,
    });

    expect(resolution.style.name).toBe("terse");
    expect(resolution.unknown).toEqual([
      { origin: "flag", name: "missing-flag" },
      { origin: "project", name: "missing-project" },
    ]);
  });

  it("records only consulted values", () => {
    const resolution = resolveStartupStyle({ projectValue: "brief", globalValue: "missing", styles: STYLES });
    expect(resolution.style.name).toBe("brief");
    expect(resolution.unknown).toEqual([]);
  });

  it("treats the empty flag value as a selection attempt", () => {
    const resolution = resolveStartupStyle({ flagValue: "", globalValue: "brief", styles: STYLES });
    expect(resolution.style.name).toBe("brief");
    expect(resolution.unknown).toEqual([{ origin: "flag", name: "" }]);
  });

  it("matches names case-sensitively", () => {
    const resolution = resolveStartupStyle({ globalValue: "Brief", styles: STYLES });
    expect(resolution.style).toBe(DEFAULT_STYLE);
    expect(resolution.unknown).toEqual([{ origin: "global", name: "Brief" }]);
  });

  it("falls back to the built-in default when the list holds no default", () => {
    const resolution = resolveStartupStyle({ globalValue: "unknown", styles: [style("brief")] });
    expect(resolution.style).toBe(DEFAULT_STYLE);
    expect(resolution.unknown).toEqual([{ origin: "global", name: "unknown" }]);
  });
});
