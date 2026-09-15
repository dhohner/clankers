import { access, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Signal when the command parks, then block until the test releases it.
 * This handshake avoids slower guessed delays and races on loaded machines.
 * Bound the wait with `SECONDS` so a failed test cannot leave the command spinning.
 */
export const PARK = "touch ready; while [ ! -f go ] && [ $SECONDS -lt 10 ]; do sleep 0.01; done";

export function waitUntilParked(directory: string): Promise<void> {
  return waitFor(() => exists(join(directory, "ready")), "command did not reach its parking point");
}

export async function release(directory: string): Promise<void> {
  await writeFile(join(directory, "go"), "");
}

export async function waitFor(
  condition: () => Promise<boolean> | boolean,
  description = "condition not met in time",
  timeoutMs = 5000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await condition())) {
    if (Date.now() > deadline) throw new Error(description);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
