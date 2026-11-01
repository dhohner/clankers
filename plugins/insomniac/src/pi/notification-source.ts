export type SourceApp =
  | { kind: "automatic"; bundleIdentifier?: string }
  | { kind: "override"; bundleIdentifier: string }
  | { kind: "invalid-override"; bundleIdentifier?: never };

// Apple permits ASCII alphanumerics, hyphens and periods; reject empty components and option syntax.
function isBundleIdentifier(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9-]*(?:\.[A-Za-z0-9-]+)*$/.test(value);
}

const terminals = new Map([
  ["ghostty", "com.mitchellh.ghostty"],
  ["iTerm.app", "com.googlecode.iterm2"],
  ["Apple_Terminal", "com.apple.Terminal"],
]);

export function resolveSourceApp(environment: NodeJS.ProcessEnv): SourceApp {
  const override = environment.INSOMNIAC_SOURCE_APP;

  if (override !== undefined) {
    return isBundleIdentifier(override)
      ? { kind: "override", bundleIdentifier: override }
      : { kind: "invalid-override" };
  }

  // These values may survive SSH forwarding or a detached multiplexer and identify the wrong app.
  if (["SSH_CONNECTION", "SSH_CLIENT", "SSH_TTY", "TMUX", "STY"].some((key) => environment[key] !== undefined)) {
    return { kind: "automatic" };
  }

  const terminal = terminals.get(environment.TERM_PROGRAM ?? "");
  const bundle = environment["__CFBundleIdentifier"];

  if (
    bundle !== undefined &&
    (!isBundleIdentifier(bundle) || (terminal && terminal.toLowerCase() !== bundle.toLowerCase()))
  ) {
    return { kind: "automatic" };
  }

  return { kind: "automatic", bundleIdentifier: terminal ?? bundle };
}
