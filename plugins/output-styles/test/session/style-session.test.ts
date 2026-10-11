import { describe, expect, it } from "vitest";
import { createStyleSession } from "../../src/session/style-session.ts";
import { DEFAULT_STYLE, type StyleDefinition, type StyleDiscovery } from "../../src/styles/types.ts";
import { deferred } from "../support/deferred.ts";

const brief: StyleDefinition = { name: "brief", description: "Brief.", instructions: "Be brief.", source: "user" };

const edited: StyleDefinition = { ...brief, instructions: "One word." };

const problem = { path: "/styles", reason: "permission denied" };

function found(
  styles: StyleDefinition[] = [DEFAULT_STYLE, brief],
  unlistableDirectories: string[] = [],
): StyleDiscovery {
  return { styles, unlistableDirectories, problems: unlistableDirectories.map((path) => ({ ...problem, path })) };
}

describe("style session", () => {
  it("starts with the default style and cycles through the current catalogue", async () => {
    const session = createStyleSession({ discover: async () => found() });

    expect(session.active()).toBe(DEFAULT_STYLE);
    expect(session.styles()).toEqual([DEFAULT_STYLE]);
    expect(session.next()).toBe(DEFAULT_STYLE);
    await session.initialize({});
    expect(session.find("brief")).toBe(brief);
    expect(session.find("missing")).toBeUndefined();
    expect(session.next()).toBe(brief);
    session.select(brief);
    expect(session.next()).toBe(DEFAULT_STYLE);
  });

  it("resolves startup selection against the catalogue", async () => {
    const session = createStyleSession({ discover: async () => found() });
    await session.initialize({});

    expect(session.selectStartup({ flagValue: "missing", globalValue: "brief" })).toEqual({
      style: brief,
      unknown: [{ origin: "flag", name: "missing" }],
    });
    expect(session.active()).toBe(brief);
  });

  it("refreshes an edited active definition", async () => {
    let catalogue = found();
    const session = createStyleSession({ discover: async () => catalogue });
    await session.initialize({});
    session.select(brief);
    catalogue = found([DEFAULT_STYLE, edited]);

    expect(await session.refresh({}, new Set())).toEqual({ status: "adopted", reports: [], fallback: undefined });
    expect(session.active()).toBe(edited);
  });

  it("reports a missing active name as a fallback once", async () => {
    let catalogue = found();
    const session = createStyleSession({ discover: async () => catalogue });
    await session.initialize({});
    session.select(brief);
    catalogue = found([DEFAULT_STYLE]);

    expect(await session.refresh({}, new Set())).toEqual({ status: "adopted", reports: [], fallback: "brief" });
    expect(session.active()).toBe(DEFAULT_STYLE);
    expect((await session.refresh({}, new Set())).status).toBe("adopted");
    expect(session.next()).toBe(DEFAULT_STYLE);
  });

  it("retains a selector snapshot when a directory regresses and deduplicates per invocation", async () => {
    let catalogue = found();
    const session = createStyleSession({ discover: async () => catalogue });
    await session.initialize({});
    const offered = session.styles();
    catalogue = found([DEFAULT_STYLE]);
    await session.refresh({}, new Set());
    session.select(brief);
    catalogue = found([DEFAULT_STYLE], [problem.path]);
    const invocation = new Set<string>();

    expect(await session.refresh({}, invocation)).toEqual({ status: "retained", reports: [{ kind: "kept", problem }] });
    expect(session.active()).toBe(brief);
    expect(offered).toEqual([DEFAULT_STYLE, brief]);
    expect(session.next()).toBe(DEFAULT_STYLE);
    expect(await session.refresh({}, invocation)).toEqual({ status: "retained", reports: [] });
    expect(await session.refresh({}, new Set())).toEqual({ status: "retained", reports: [{ kind: "kept", problem }] });
  });

  it("adopts a scan when an already unlistable directory stays unlistable", async () => {
    const session = createStyleSession({ discover: async () => found([DEFAULT_STYLE], [problem.path]) });

    expect(await session.initialize({})).toEqual({ status: "ready", reports: [{ kind: "skipped", problem }] });
    expect(await session.refresh({}, new Set())).toEqual({ status: "adopted", reports: [], fallback: undefined });
  });

  it("reports a changed problem reason once across startup and refresh", async () => {
    const catalogue = found();
    catalogue.problems.push(problem);
    const session = createStyleSession({ discover: async () => catalogue });

    expect((await session.initialize({})).reports).toEqual([{ kind: "skipped", problem }]);
    expect((await session.refresh({}, new Set())).reports).toEqual([]);
    catalogue.problems = [{ ...problem, reason: "different failure" }];
    expect((await session.refresh({}, new Set())).reports).toEqual([
      { kind: "skipped", problem: catalogue.problems[0] },
    ]);
  });

  it("resets selection at each startup while retaining diagnostic deduplication", async () => {
    const catalogue = found();
    catalogue.problems.push(problem);
    const session = createStyleSession({ discover: async () => catalogue });
    await session.initialize({});
    session.select(brief);

    expect(await session.initialize({})).toEqual({ status: "ready", reports: [] });
    expect(session.active()).toBe(DEFAULT_STYLE);
  });

  it("returns startup failure and can initialize again", async () => {
    let fail = true;

    const session = createStyleSession({
      discover: async () => {
        if (fail) throw new Error("scan failed");

        return found();
      },
    });

    expect(await session.initialize({})).toEqual({ status: "failed", failure: "scan failed", reports: [] });
    expect(session.active()).toBe(DEFAULT_STYLE);
    fail = false;
    expect((await session.initialize({})).status).toBe("ready");
  });

  it("retains the catalogue after a thrown scan and recovers on the next refresh", async () => {
    let fail = false;

    const session = createStyleSession({
      discover: async () => {
        if (fail) throw new Error("scan failed");

        return found();
      },
    });

    await session.initialize({});
    session.select(brief);
    fail = true;

    expect(await session.refresh({}, new Set())).toEqual({
      status: "retained",
      reports: [{ kind: "scan-failed", failure: "scan failed" }],
    });
    expect(session.active()).toBe(brief);
    fail = false;
    expect((await session.refresh({}, new Set())).status).toBe("adopted");
  });

  it("serializes scan and adoption in invocation order", async () => {
    const firstScan = deferred<StyleDiscovery>();
    const started = deferred<void>();
    let calls = 0;

    const session = createStyleSession({
      discover: async () => {
        calls += 1;

        if (calls === 1) {
          started.resolve();

          return firstScan.promise;
        }

        return found([DEFAULT_STYLE, edited]);
      },
    });

    const first = session.refresh({}, new Set());
    const second = session.refresh({}, new Set());
    await started.promise;
    expect(calls).toBe(1);
    firstScan.resolve(found());
    await Promise.all([first, second]);
    expect(calls).toBe(2);
    expect(session.find("brief")).toBe(edited);
  });
});
