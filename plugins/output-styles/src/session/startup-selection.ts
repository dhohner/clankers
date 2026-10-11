import { DEFAULT_STYLE, DEFAULT_STYLE_NAME, type StyleDefinition } from "../styles/types.ts";

/** Startup selection precedence: flag, trusted project settings, global settings. */
export type StartupOrigin = "flag" | "project" | "global";

export type StartupResolution = {
  style: StyleDefinition;
  /** Only consulted names that did not resolve are reported. */
  unknown: Array<{ origin: StartupOrigin; name: string }>;
};

export type StartupValues = {
  /** An empty flag is still a selection attempt. */
  flagValue?: string;
  /** Supply a project value only for a trusted project. */
  projectValue?: string;
  globalValue?: string;
  styles: readonly StyleDefinition[];
};

export function resolveStartupStyle(values: StartupValues): StartupResolution {
  const unknown: StartupResolution["unknown"] = [];

  const candidates: Array<[StartupOrigin, string | undefined]> = [
    ["flag", values.flagValue],
    ["project", values.projectValue],
    ["global", values.globalValue],
  ];

  for (const [origin, name] of candidates) {
    if (name === undefined) continue;

    const match = values.styles.find((style) => style.name === name);

    if (match) return { style: match, unknown };

    unknown.push({ origin, name });
  }

  const fallback = values.styles.find((style) => style.name === DEFAULT_STYLE_NAME) ?? DEFAULT_STYLE;

  return { style: fallback, unknown };
}
