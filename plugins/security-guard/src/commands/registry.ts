import type { OptionModel } from "./option-model.ts";

/**
 * What each command does to the words it is given: which of them name paths, which options carry a value,
 * whether it wraps another command, and whether the shell runs it itself. This is the vocabulary the parser
 * and the proof read, so it carries no policy: whether a command needs approval is decided by its classifier
 * in `policy/command-analysis/classifiers.ts`, which the layers below this one never import.
 */
export type SymlinkBehavior = "entry" | "target";

export type PathOptionModel =
  | {
      kind: "standard";
      longFlags: readonly string[];
      longValues: readonly string[];
      shortFlags: string;
      shortValues: string;
      rejectShort?: string;
      rejectLong?: readonly string[];
    }
  | {
      kind: "move";
      shortFlags: string;
      shortValues: string;
      longFlags: ReadonlySet<string>;
      longValues: ReadonlySet<string>;
      longPathValues: ReadonlySet<string>;
    }
  | {
      kind: "mode";
      shortFlags: string;
      longFlags: ReadonlySet<string>;
    };

export type EffectModel =
  /** The command has no effect of its own: a wrapper, or a builtin that touches no path. */
  | { kind: "none" }
  /** The command has effects this package does not model, so no proof can clear one of its calls. */
  | { kind: "unmodeled" }
  | { kind: "path"; options: PathOptionModel; symlinkBehavior: SymlinkBehavior; allowsShallowGlob: boolean }
  | {
      kind: "write";
      valueOptions: ReadonlySet<string>;
      flagOptions: ReadonlySet<string>;
      symlinkBehavior: SymlinkBehavior;
    }
  | { kind: "inert"; unsafeOption?: RegExp }
  | { kind: "shell-state" };

export type CommandRule = {
  names: readonly string[];
  effect: EffectModel;
  wrapper?: OptionModel;
  shellBuiltin?: boolean;
  escalatesPrivilege?: boolean;
};

/** Shells that take a command list on `-c`, or read one from a script operand or standard input. */
export const NESTED_SHELL_NAMES = ["bash", "sh", "zsh", "ksh", "dash", "ash"] as const;

const emptyOptions = (): OptionModel => ({ value: new Set(), flag: new Set() });

const rules: readonly CommandRule[] = [
  {
    names: ["rm"],
    effect: {
      kind: "path",
      options: {
        kind: "standard",
        longFlags: [
          "--force",
          "--interactive",
          "--one-file-system",
          "--no-preserve-root",
          "--preserve-root",
          "--recursive",
          "--dir",
          "--verbose",
        ],
        longValues: [],
        shortFlags: "dfhIiPRrRvWx",
        shortValues: "",
      },
      symlinkBehavior: "entry",
      allowsShallowGlob: true,
    },
  },
  {
    names: ["rmdir"],
    effect: {
      kind: "path",
      options: {
        kind: "standard",
        longFlags: ["--ignore-fail-on-non-empty", "--parents", "--verbose"],
        longValues: [],
        shortFlags: "pv",
        shortValues: "",
        rejectShort: "p",
        rejectLong: ["--parents"],
      },
      symlinkBehavior: "entry",
      allowsShallowGlob: false,
    },
  },
  {
    names: ["unlink"],
    effect: {
      kind: "path",
      options: { kind: "standard", longFlags: [], longValues: [], shortFlags: "", shortValues: "" },
      symlinkBehavior: "entry",
      allowsShallowGlob: false,
    },
  },
  {
    names: ["truncate"],
    effect: {
      kind: "path",
      options: {
        kind: "standard",
        longFlags: ["--no-create", "--io-blocks"],
        longValues: ["--size", "--reference"],
        shortFlags: "co",
        shortValues: "sr",
      },
      symlinkBehavior: "target",
      allowsShallowGlob: false,
    },
  },
  {
    names: ["mv"],
    effect: {
      kind: "path",
      options: {
        kind: "move",
        shortFlags: "finuvbZT",
        shortValues: "tS",
        longFlags: new Set([
          "--force",
          "--interactive",
          "--no-clobber",
          "--update",
          "--verbose",
          "--backup",
          "--strip-trailing-slashes",
          "--no-target-directory",
          "--context",
        ]),
        longValues: new Set(["--suffix"]),
        longPathValues: new Set(["--target-directory"]),
      },
      symlinkBehavior: "entry",
      allowsShallowGlob: true,
    },
  },
  ...(["chmod", "chown"] as const).map((name): CommandRule => ({
    names: [name],
    effect: {
      kind: "path",
      options: {
        kind: "mode",
        shortFlags: "fvchHPN",
        longFlags: new Set([
          "--force",
          "--silent",
          "--quiet",
          "--verbose",
          "--changes",
          "--no-dereference",
          "--preserve-root",
          "--no-preserve-root",
        ]),
      },
      symlinkBehavior: "target",
      allowsShallowGlob: false,
    },
  })),
  ...(["dd", "mkfs", "shred"] as const).map((name): CommandRule => ({
    names: [name],
    effect: { kind: "unmodeled" },
  })),
  {
    names: ["git"],
    effect: { kind: "unmodeled" },
  },
  ...NESTED_SHELL_NAMES.map((name): CommandRule => ({
    names: [name],
    effect: { kind: "unmodeled" },
  })),
  ...(["eval", "trap"] as const).map((name): CommandRule => ({
    names: [name],
    effect: { kind: "unmodeled" },
  })),
  {
    names: ["find"],
    effect: { kind: "unmodeled" },
  },
  {
    names: ["xargs"],
    effect: { kind: "unmodeled" },
  },
  {
    names: ["mkdir"],
    effect: {
      kind: "write",
      valueOptions: new Set(["-m", "--mode"]),
      flagOptions: new Set(["-p", "--parents", "-v", "--verbose"]),
      symlinkBehavior: "target",
    },
  },
  {
    names: ["touch"],
    effect: {
      kind: "write",
      valueOptions: new Set(["-r", "--reference", "-t", "-d", "--date", "--time"]),
      flagOptions: new Set(["-a", "-c", "--no-create", "-m", "-f", "-h", "--no-dereference"]),
      symlinkBehavior: "target",
    },
  },
  { names: ["set"], effect: { kind: "shell-state" }, shellBuiltin: true },
  ...(
    [
      "cat",
      "echo",
      "exit",
      "false",
      "grep",
      "head",
      "ls",
      "pwd",
      "sleep",
      "stat",
      "tail",
      "test",
      "true",
      "wc",
    ] as const
  ).map((name): CommandRule => ({
    names: [name],
    effect: { kind: "inert" },
    shellBuiltin: ["echo", "exit", "false", "pwd", "test", "true"].includes(name),
  })),
  { names: ["["], effect: { kind: "inert" }, shellBuiltin: true },
  {
    names: ["printf"],
    effect: { kind: "inert", unsafeOption: /^-[A-Za-z]*v/ },
    shellBuiltin: true,
  },
  {
    names: ["diff"],
    effect: { kind: "inert", unsafeOption: /^(-[A-Za-z]*o|--o[a-z]*(=|$))/ },
  },
  { names: ["export"], effect: { kind: "none" }, shellBuiltin: true },
  {
    names: ["builtin"],
    effect: { kind: "none" },
    wrapper: emptyOptions(),
    shellBuiltin: true,
  },
  {
    names: ["command"],
    effect: { kind: "none" },
    wrapper: { value: new Set(), flag: new Set(["-p", "-v", "-V"]), inspect: new Set(["-v", "-V"]) },
    shellBuiltin: true,
  },
  {
    names: ["exec"],
    effect: { kind: "none" },
    wrapper: { value: new Set(["-a"]), flag: new Set(["-c", "-l"]) },
    shellBuiltin: true,
  },
  {
    names: ["setsid"],
    effect: { kind: "none" },
    wrapper: { value: new Set(), flag: new Set(["-c", "--ctty", "-f", "--fork", "-w", "--wait"]) },
  },
  {
    names: ["stdbuf"],
    effect: { kind: "none" },
    wrapper: { value: new Set(["-i", "--input", "-o", "--output", "-e", "--error"]), flag: new Set() },
  },
  {
    names: ["timeout"],
    effect: { kind: "none" },
    wrapper: {
      value: new Set(["-s", "--signal", "-k", "--kill-after"]),
      flag: new Set(["--preserve-status", "--foreground", "-v", "--verbose"]),
      operands: 1,
    },
  },
  {
    names: ["nohup"],
    effect: { kind: "none" },
    wrapper: { ...emptyOptions(), alwaysStateful: true },
  },
  {
    names: ["nice"],
    effect: { kind: "none" },
    wrapper: { value: new Set(["-n", "--adjustment"]), flag: new Set(), numeric: true },
  },
  {
    names: ["time"],
    effect: { kind: "none" },
    wrapper: {
      value: new Set(["-o", "--output", "-f", "--format"]),
      flag: new Set(["-p", "--portability", "-a", "--append", "-v", "--verbose"]),
      stateful: new Set(["-o", "--output"]),
    },
    shellBuiltin: true,
  },
  {
    names: ["sudo"],
    effect: { kind: "none" },
    wrapper: {
      value: new Set([
        "-u",
        "--user",
        "-g",
        "--group",
        "-p",
        "--prompt",
        "-C",
        "--close-from",
        "-D",
        "--chdir",
        "-h",
        "--host",
        "-R",
        "--chroot",
        "-r",
        "--role",
        "-t",
        "--type",
        "-T",
        "--command-timeout",
        "-U",
        "--other-user",
      ]),
      flag: new Set([
        "-A",
        "--askpass",
        "-b",
        "--background",
        "-E",
        "--preserve-env",
        "-H",
        "--set-home",
        "-K",
        "--remove-timestamp",
        "-k",
        "--reset-timestamp",
        "-l",
        "--list",
        "-n",
        "--non-interactive",
        "-P",
        "--preserve-groups",
        "-S",
        "--stdin",
        "-V",
        "--version",
        "-v",
        "--validate",
        "-e",
        "--edit",
      ]),
      stateful: new Set(["-D", "--chdir", "-R", "--chroot"]),
    },
    escalatesPrivilege: true,
  },
  {
    names: ["doas"],
    effect: { kind: "none" },
    wrapper: { value: new Set(["-C", "-u"]), flag: new Set(["-L", "-n"]) },
    escalatesPrivilege: true,
  },
  {
    names: ["env"],
    effect: { kind: "none" },
    wrapper: {
      value: new Set(["-u", "--unset", "-C", "--chdir"]),
      flag: new Set(["-i", "-0", "--ignore-environment", "--null"]),
      stateful: new Set(["-C", "--chdir"]),
    },
  },
];

const aliases = new Map<string, CommandRule>();
for (const rule of rules) {
  for (const name of rule.names) {
    if (aliases.has(name)) throw new Error(`Duplicate command rule alias: ${name}`);
    aliases.set(name, rule);
  }
}

export const COMMAND_RULES: readonly CommandRule[] = rules;

export function commandRule(name: string): CommandRule | undefined {
  return aliases.get(name);
}
