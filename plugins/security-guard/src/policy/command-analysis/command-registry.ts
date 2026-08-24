import type { OptionModel } from "../../shell/option-scanner.ts";

export type CommandClassificationModel =
  | "never"
  | "always"
  | "mv"
  | "chmod"
  | "chown"
  | "git"
  | "nested-shell"
  | "eval"
  | "trap"
  | "xargs"
  | "find";

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
  | { kind: "none" }
  | { kind: "path"; options: PathOptionModel; symlinkBehavior: SymlinkBehavior; allowsShallowGlob: boolean }
  | {
      kind: "write";
      valueOptions: ReadonlySet<string>;
      flagOptions: ReadonlySet<string>;
      symlinkBehavior: SymlinkBehavior;
    }
  | { kind: "inert"; unsafeOption?: RegExp }
  | { kind: "shell-state" };

export type ClassificationOptions =
  | { kind: "mv"; forceShort: string; forceLong: readonly string[] }
  | {
      kind: "chmod" | "chown";
      recursiveShort: string;
      recursiveLong: readonly string[];
      referenceLong: readonly string[];
    }
  | {
      kind: "git";
      leading: OptionModel;
      checkoutBranch: ReadonlySet<string>;
      checkoutBranchValue: ReadonlySet<string>;
      checkoutDestructive: RegExp;
      forcingRefspec: RegExp;
    }
  | {
      kind: "nested-shell";
      flagLetters: string;
      flags: ReadonlySet<string>;
      valueOptions: ReadonlySet<string>;
    }
  | {
      kind: "find";
      commandPrimaries: ReadonlySet<string>;
      writePrimaries: ReadonlySet<string>;
    };

export type CommandRule = {
  names: readonly string[];
  classification: CommandClassificationModel;
  classificationOptions?: ClassificationOptions;
  effect: EffectModel;
  approvalOnly?: boolean;
  wrapper?: OptionModel;
  operandCommandOptions?: OptionModel;
  shellBuiltin?: boolean;
  escalatesPrivilege?: boolean;
};

const emptyOptions = (): OptionModel => ({ value: new Set(), flag: new Set() });

const rules: readonly CommandRule[] = [
  {
    names: ["rm"],
    classification: "always",
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
    classification: "always",
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
    classification: "always",
    effect: {
      kind: "path",
      options: { kind: "standard", longFlags: [], longValues: [], shortFlags: "", shortValues: "" },
      symlinkBehavior: "entry",
      allowsShallowGlob: false,
    },
  },
  {
    names: ["truncate"],
    classification: "always",
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
    classification: "mv",
    classificationOptions: { kind: "mv", forceShort: "f", forceLong: ["--force"] },
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
    classification: name,
    classificationOptions: {
      kind: name,
      recursiveShort: "R",
      recursiveLong: ["--recursive"],
      referenceLong: ["--reference"],
    },
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
    classification: "always",
    effect: { kind: "none" },
    approvalOnly: true,
  })),
  {
    names: ["git"],
    classification: "git",
    classificationOptions: {
      kind: "git",
      leading: {
        value: new Set([
          "-C",
          "-c",
          "--git-dir",
          "--work-tree",
          "--namespace",
          "--super-prefix",
          "--config-env",
          "--list-cmds",
          "--attr-source",
        ]),
        flag: new Set([
          "-p",
          "--paginate",
          "-P",
          "--no-pager",
          "--bare",
          "--no-replace-objects",
          "--no-lazy-fetch",
          "--no-optional-locks",
          "--no-advice",
          "--literal-pathspecs",
          "--glob-pathspecs",
          "--noglob-pathspecs",
          "--icase-pathspecs",
          "--exec-path",
          "--html-path",
          "--man-path",
          "--info-path",
          "--version",
          "--help",
        ]),
      },
      checkoutBranch: new Set(["-b", "--orphan", "-t", "--track", "--detach"]),
      checkoutBranchValue: new Set(["-b", "--orphan"]),
      checkoutDestructive: /^(--ours|--theirs|-p|--patch|--pathspec-from-file(=.*)?|-B|--force)$/,
      forcingRefspec: /^\+|^:./,
    },
    effect: { kind: "none" },
    approvalOnly: true,
  },
  ...(["bash", "sh", "zsh", "ksh", "dash", "ash"] as const).map((name): CommandRule => ({
    names: [name],
    classification: "nested-shell",
    classificationOptions: {
      kind: "nested-shell",
      flagLetters: "abefhiklmnprstuvxBCDEHPT",
      flags: new Set([
        "--debugger",
        "--dump-po-strings",
        "--dump-strings",
        "--help",
        "--login",
        "--noediting",
        "--noprofile",
        "--norc",
        "--posix",
        "--pretty-print",
        "--restricted",
        "--verbose",
        "--version",
      ]),
      valueOptions: new Set(["--rcfile", "--init-file"]),
    },
    effect: { kind: "none" },
    approvalOnly: true,
  })),
  ...(["eval", "trap"] as const).map((name): CommandRule => ({
    names: [name],
    classification: name,
    effect: { kind: "none" },
    approvalOnly: true,
  })),
  {
    names: ["find"],
    classification: "find",
    classificationOptions: {
      kind: "find",
      commandPrimaries: new Set(["-exec", "-execdir", "-ok", "-okdir"]),
      writePrimaries: new Set(["-delete", "-fprint", "-fprint0", "-fprintf", "-fls"]),
    },
    effect: { kind: "none" },
    approvalOnly: true,
  },
  {
    names: ["xargs"],
    classification: "xargs",
    effect: { kind: "none" },
    approvalOnly: true,
    operandCommandOptions: {
      value: new Set([
        "-a",
        "--arg-file",
        "-d",
        "--delimiter",
        "-E",
        "-I",
        "-J",
        "-L",
        "-n",
        "--max-args",
        "-P",
        "--max-procs",
        "-R",
        "-S",
        "-s",
        "--max-chars",
      ]),
      flag: new Set([
        "-0",
        "--null",
        "-o",
        "--open-tty",
        "-p",
        "--interactive",
        "-r",
        "--no-run-if-empty",
        "-t",
        "--verbose",
        "-x",
        "--exit",
      ]),
    },
  },
  {
    names: ["mkdir"],
    classification: "never",
    effect: {
      kind: "write",
      valueOptions: new Set(["-m", "--mode"]),
      flagOptions: new Set(["-p", "--parents", "-v", "--verbose"]),
      symlinkBehavior: "target",
    },
  },
  {
    names: ["touch"],
    classification: "never",
    effect: {
      kind: "write",
      valueOptions: new Set(["-r", "--reference", "-t", "-d", "--date", "--time"]),
      flagOptions: new Set(["-a", "-c", "--no-create", "-m", "-f", "-h", "--no-dereference"]),
      symlinkBehavior: "target",
    },
  },
  { names: ["set"], classification: "never", effect: { kind: "shell-state" }, shellBuiltin: true },
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
    classification: "never",
    effect: { kind: "inert" },
    shellBuiltin: ["echo", "exit", "false", "pwd", "test", "true"].includes(name),
  })),
  { names: ["["], classification: "never", effect: { kind: "inert" }, shellBuiltin: true },
  {
    names: ["printf"],
    classification: "never",
    effect: { kind: "inert", unsafeOption: /^-[A-Za-z]*v/ },
    shellBuiltin: true,
  },
  {
    names: ["diff"],
    classification: "never",
    effect: { kind: "inert", unsafeOption: /^(-[A-Za-z]*o|--o[a-z]*(=|$))/ },
  },
  { names: ["export"], classification: "never", effect: { kind: "none" }, shellBuiltin: true },
  {
    names: ["builtin"],
    classification: "never",
    effect: { kind: "none" },
    wrapper: emptyOptions(),
    shellBuiltin: true,
  },
  {
    names: ["command"],
    classification: "never",
    effect: { kind: "none" },
    wrapper: { value: new Set(), flag: new Set(["-p", "-v", "-V"]), inspect: new Set(["-v", "-V"]) },
    shellBuiltin: true,
  },
  {
    names: ["exec"],
    classification: "never",
    effect: { kind: "none" },
    wrapper: { value: new Set(["-a"]), flag: new Set(["-c", "-l"]) },
    shellBuiltin: true,
  },
  {
    names: ["setsid"],
    classification: "never",
    effect: { kind: "none" },
    wrapper: { value: new Set(), flag: new Set(["-c", "--ctty", "-f", "--fork", "-w", "--wait"]) },
  },
  {
    names: ["stdbuf"],
    classification: "never",
    effect: { kind: "none" },
    wrapper: { value: new Set(["-i", "--input", "-o", "--output", "-e", "--error"]), flag: new Set() },
  },
  {
    names: ["timeout"],
    classification: "never",
    effect: { kind: "none" },
    wrapper: {
      value: new Set(["-s", "--signal", "-k", "--kill-after"]),
      flag: new Set(["--preserve-status", "--foreground", "-v", "--verbose"]),
      operands: 1,
    },
  },
  {
    names: ["nohup"],
    classification: "never",
    effect: { kind: "none" },
    wrapper: { ...emptyOptions(), alwaysStateful: true },
  },
  {
    names: ["nice"],
    classification: "never",
    effect: { kind: "none" },
    wrapper: { value: new Set(["-n", "--adjustment"]), flag: new Set(), numeric: true },
  },
  {
    names: ["time"],
    classification: "never",
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
    classification: "never",
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
    classification: "never",
    effect: { kind: "none" },
    wrapper: { value: new Set(["-C", "-u"]), flag: new Set(["-L", "-n"]) },
    escalatesPrivilege: true,
  },
  {
    names: ["env"],
    classification: "never",
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

export function registeredCommandAliases(): readonly string[] {
  return [...aliases.keys()];
}
