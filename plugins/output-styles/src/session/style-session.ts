import { describeError } from "../errors.ts";
import type { StyleDirectories } from "../styles/discovery.ts";
import { DEFAULT_STYLE, type StyleDefinition, type StyleDiscovery, type StyleProblem } from "../styles/types.ts";
import { resolveStartupStyle, type StartupValues } from "./startup-selection.ts";

export type SessionReport =
  | { kind: "skipped" | "kept"; problem: StyleProblem }
  | { kind: "scan-failed"; failure: string };

export type SessionInitialization =
  | { status: "ready"; reports: SessionReport[] }
  | { status: "failed"; failure: string; reports: SessionReport[] };

export type SessionRefresh =
  | { status: "adopted"; reports: SessionReport[]; fallback: string | undefined }
  | { status: "retained"; reports: SessionReport[] };

export type StyleSessionDependencies = {
  discover(directories: StyleDirectories): Promise<StyleDiscovery>;
};

export function createStyleSession(deps: StyleSessionDependencies) {
  let styles: readonly StyleDefinition[] = [DEFAULT_STYLE];
  let activeStyle = DEFAULT_STYLE;
  let unlistableDirs = new Set<string>();
  const reportedProblems = new Set<string>();
  let scanChain: Promise<void> = Promise.resolve();

  function skippedReport(problem: StyleProblem): SessionReport[] {
    // NUL cannot occur in a path, so this key cannot collide across different pairs.
    const key = `${problem.path}\u0000${problem.reason}`;

    if (reportedProblems.has(key)) return [];

    reportedProblems.add(key);

    return [{ kind: "skipped", problem }];
  }

  async function initialize(directories: StyleDirectories): Promise<SessionInitialization> {
    styles = [DEFAULT_STYLE];
    activeStyle = DEFAULT_STYLE;

    try {
      const discovery = await deps.discover(directories);
      styles = discovery.styles;
      unlistableDirs = new Set(discovery.unlistableDirectories);

      return { status: "ready", reports: discovery.problems.flatMap(skippedReport) };
    } catch (cause) {
      return { status: "failed", failure: describeError(cause), reports: [] };
    }
  }

  function find(name: string): StyleDefinition | undefined {
    return styles.find((style) => style.name === name);
  }

  async function scan(directories: StyleDirectories, reportedKeptDirs: Set<string>): Promise<SessionRefresh> {
    try {
      const discovery = await deps.discover(directories);
      const regressed = new Set(discovery.unlistableDirectories.filter((dir) => !unlistableDirs.has(dir)));
      const reports: SessionReport[] = [];

      for (const problem of discovery.problems) {
        if (!regressed.has(problem.path)) {
          reports.push(...skippedReport(problem));
          continue;
        }

        // A create command can scan twice; each invocation reports a kept directory once.
        if (reportedKeptDirs.has(problem.path)) continue;

        reportedKeptDirs.add(problem.path);
        reports.push({ kind: "kept", problem });
      }

      if (regressed.size > 0) return { status: "retained", reports };

      styles = discovery.styles;
      unlistableDirs = new Set(discovery.unlistableDirectories);
      const resolved = find(activeStyle.name);
      const fallback = resolved ? undefined : activeStyle.name;
      activeStyle = resolved ?? DEFAULT_STYLE;

      return { status: "adopted", reports, fallback };
    } catch (cause) {
      return { status: "retained", reports: [{ kind: "scan-failed", failure: describeError(cause) }] };
    }
  }

  function refresh(directories: StyleDirectories, reportedKeptDirs: Set<string>): Promise<SessionRefresh> {
    // Serialize discovery and adoption together; an older scan cannot overwrite a newer one.
    const result = scanChain.then(() => scan(directories, reportedKeptDirs));
    scanChain = result.then(() => undefined);

    return result;
  }

  return {
    initialize,
    refresh,
    find,
    active: () => activeStyle,
    // Replacing this array preserves the catalogue offered by an open selector.
    styles: () => styles,
    select(style: StyleDefinition): void {
      activeStyle = style;
    },
    selectStartup(values: Omit<StartupValues, "styles">) {
      const resolution = resolveStartupStyle({ ...values, styles });
      activeStyle = resolution.style;

      return resolution;
    },
    next(): StyleDefinition {
      const index = styles.findIndex((style) => style.name === activeStyle.name);

      return styles[(index + 1) % styles.length] ?? DEFAULT_STYLE;
    },
  };
}
