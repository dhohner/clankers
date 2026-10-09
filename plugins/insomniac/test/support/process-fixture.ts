import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Obeys caffeinate's -w lifetime option without creating a power assertion.
const source = `#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <signal.h>
#include <unistd.h>
int main(int argc, char **argv) {
  int parent = 0;
  for (int i = 1; i + 1 < argc; i++) if (!strcmp(argv[i], "-w")) parent = atoi(argv[++i]);
  FILE *log = fopen(getenv("INSOMNIAC_TEST_LOG"), "a");
  fprintf(log, "%d\\n", getpid());
  fclose(log);
  while (!parent || kill(parent, 0) == 0) usleep(10000);
  return 0;
}
`;

export function createProcessFixture() {
  const directory = mkdtempSync(join(tmpdir(), "insomniac-process-"));
  const executable = join(directory, "fake-caffeinate");
  const dispose = () => rmSync(directory, { recursive: true, force: true });

  try {
    writeFileSync(`${executable}.c`, source);
    const build = spawnSync("cc", ["-o", executable, `${executable}.c`], { encoding: "utf8" });

    if (build.error) throw new Error("compile fake caffeinate", { cause: build.error });

    if (build.status !== 0) throw new Error(`compile fake caffeinate: ${build.stderr}`);
  } catch (error) {
    dispose();
    throw error;
  }

  return { directory, executable, dispose };
}
