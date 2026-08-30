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

const classifiers = new Map<string, Classifier>();
for (const { names, classify } of REGISTRATIONS) {
  for (const name of names) {
    if (classifiers.has(name)) throw new Error(`Duplicate command classifier: ${name}`);
    classifiers.set(name, classify);
  }
}

/**
 * The commands policy has to judge, as the registry describes them: one acting on path operands, or one with
 * effects this package does not model. Anything else writes nothing, or runs another command that is judged
 * on its own.
 */
function needsClassifier(rule: CommandRule): boolean {
  return rule.effect.kind === "path" || rule.effect.kind === "unmodeled";
}

// The two tables are checked against each other here, once, at load. A classifier is what makes a command
// destructive, and `classifierFor` reports a command it does not hold as harmless, so a rule that gained no
// classifier would be allowed silently: the one failure this seam must not have. The reverse direction keeps
// a classifier from outliving the rule that gives its operands meaning.
const ruleByName = new Map(COMMAND_RULES.flatMap((rule) => rule.names.map((name) => [name, rule] as const)));

const unclassified = COMMAND_RULES.filter(needsClassifier)
  .flatMap((rule) => rule.names)
  .filter((name) => !classifiers.has(name));
if (unclassified.length > 0) throw new Error(`Command rules without a classifier: ${unclassified.join(", ")}`);

const unregistered = [...classifiers.keys()].filter((name) => !ruleByName.has(name));
if (unregistered.length > 0) throw new Error(`Classifiers for unregistered commands: ${unregistered.join(", ")}`);

const harmless = [...classifiers.keys()].filter((name) => {
  const rule = ruleByName.get(name);
  return rule !== undefined && !needsClassifier(rule);
});
if (harmless.length > 0) {
  throw new Error(`Classifiers for commands the registry calls harmless: ${harmless.join(", ")}`);
}

export function classifierFor(name: string): Classifier | undefined {
  return classifiers.get(name);
}
