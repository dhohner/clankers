import { APPROVAL, type ClassifierRegistration } from "../classification.ts";

/**
 * Commands that destroy data on every run, whatever their operands say. `rm`, `rmdir`, `unlink`, and
 * `truncate` name the paths they act on, so the proof can still clear them; `dd`, `mkfs`, and `shred` write
 * through operands this policy does not model and stay approval-only.
 */
export const ALWAYS_DESTRUCTIVE_CLASSIFIERS: readonly ClassifierRegistration[] = [
  { names: ["rm", "rmdir", "unlink", "truncate", "dd", "mkfs", "shred"], classify: () => APPROVAL },
];
