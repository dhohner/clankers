import { COMMAND_RULES, type CommandRule } from "../../commands/registry.ts";
import { ALWAYS_DESTRUCTIVE_CLASSIFIERS } from "./commands/always.ts";
import { FILESYSTEM_CLASSIFIERS } from "./commands/filesystem.ts";
import { GIT_CLASSIFIERS } from "./commands/git.ts";
import { INTERPRETER_CLASSIFIERS } from "./commands/interpreters.ts";
import { NESTED_SHELL_CLASSIFIERS } from "./commands/nested-shell.ts";
import type { Classifier, ClassifierRegistration } from "./classification.ts";

/**
 * Every command this policy judges. A command absent from this table is never destructive on its own, and
 * the check below refuses to load a table that leaves out a command the registry says can destroy something.
 * Adding a command means adding a module beside these and listing it here; nothing else in the package
 * changes.
 */
const REGISTRATIONS: readonly ClassifierRegistration[] = [
  ...ALWAYS_DESTRUCTIVE_CLASSIFIERS,
  ...FILESYSTEM_CLASSIFIERS,
  ...GIT_CLASSIFIERS,
  ...NESTED_SHELL_CLASSIFIERS,
  ...INTERPRETER_CLASSIFIERS,
];

/**
 * The commands policy has to judge, as the registry describes them: one acting on path operands, or one with
 * effects this package does not model. Anything else writes nothing, or runs another command that is judged
 * on its own.
 */
function needsClassifier(rule: CommandRule): boolean {
  return rule.effect.kind === "path" || rule.effect.kind === "unmodeled";
}

/** Rejects tables that disagree about which commands need classification before any command can be allowed. */
export function createClassifierTable(
  rules: readonly CommandRule[],
  registrations: readonly ClassifierRegistration[] = REGISTRATIONS,
): ReadonlyMap<string, Classifier> {
  const table = new Map<string, Classifier>();

  for (const { names, classify } of registrations) {
    for (const name of names) {
      if (table.has(name)) throw new Error(`Duplicate command classifier: ${name}`);
      table.set(name, classify);
    }
  }

  const ruleByName = new Map(rules.flatMap((rule) => rule.names.map((name) => [name, rule] as const)));

  const unclassified = rules
    .filter(needsClassifier)
    .flatMap((rule) => rule.names)
    .filter((name) => !table.has(name));

  if (unclassified.length > 0) throw new Error(`Command rules without a classifier: ${unclassified.join(", ")}`);

  const unregistered = [...table.keys()].filter((name) => !ruleByName.has(name));

  if (unregistered.length > 0) throw new Error(`Classifiers for unregistered commands: ${unregistered.join(", ")}`);

  const harmless = [...table.keys()].filter((name) => {
    const rule = ruleByName.get(name);

    return rule !== undefined && !needsClassifier(rule);
  });

  if (harmless.length > 0) {
    throw new Error(`Classifiers for commands the registry calls harmless: ${harmless.join(", ")}`);
  }

  return table;
}

// Validate at module load: a missing classifier would otherwise let a destructive command run silently.
const classifiers = createClassifierTable(COMMAND_RULES);

export function classifierFor(name: string): Classifier | undefined {
  return classifiers.get(name);
}
