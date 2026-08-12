/**
 * Stands in for a Pi release that keeps the prompt module but drops or renames its
 * `buildSystemPrompt` export. `prompt-parity.test.ts` loads it to prove that the loader fails with
 * the expected path and the installed Pi version instead of skipping.
 */
export function formatSkillsForPrompt() {
  return "";
}
