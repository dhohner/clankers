// Load the actual Pi extension factory and dispatch lifecycle events through Pi's runner.
// Only OS process creation is replaced: the fake executable holds no power assertion.
import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { once } from "node:events";
import { resolve } from "node:path";

const realSpawn = childProcess.spawn;
const children = [];
childProcess.spawn = (command, args, options) => {
  if (command !== "/usr/bin/caffeinate") return realSpawn(command, args, options);
  const child = realSpawn(process.env.INSOMNIAC_TEST_EXECUTABLE, args, options);
  children.push(child);
  return child;
};
syncBuiltinESMExports();
const host = await import(process.env.INSOMNIAC_TEST_PI ?? "@earendil-works/pi-coding-agent");
const plugin = resolve(import.meta.dirname, "../../index.ts");
const loaded = await host.discoverAndLoadExtensions([plugin], process.cwd(), process.env.PI_CODING_AGENT_DIR);
assert.deepEqual(loaded.errors, []);
assert.equal(children.length, 0, "loading the factory must not start resources");
loaded.runtime.getThinkingLevel = () => "high";
const models = await host.ModelRuntime.create({
  authPath: resolve(process.env.PI_CODING_AGENT_DIR, "auth.json"),
  modelsPath: null,
  modelsStorePath: resolve(process.env.PI_CODING_AGENT_DIR, "models-cache.json"),
  allowModelNetwork: false,
  refreshOnCreate: false,
});
const sessionManager = host.SessionManager.inMemory();
const runner = new host.ExtensionRunner(
  loaded.extensions,
  loaded.runtime,
  process.cwd(),
  sessionManager,
  new host.ModelRegistry(models),
);
const errors = [];
runner.onError((error) => errors.push(error));
let footer;
let renders = 0;
runner.setUIContext(
  {
    setFooter(factory) {
      footer?.dispose?.();
      footer = factory?.(
        { requestRender: () => renders++ },
        { getThinkingBorderColor: () => (text) => text },
        {
          getGitBranch: () => "main",
          getExtensionStatuses: () => new Map([["other", "other active"]]),
          getAvailableProviderCount: () => 0,
          onBranchChange: () => () => {},
        },
      );
    },
  },
  "tui",
);
const render = () => footer.render(100).join("\n");
const live = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
const gone = async (child) => {
  if (child.exitCode === null && child.signalCode === null) await once(child, "exit");
  assert.equal(live(child.pid), false);
};
try {
  await runner.emit({ type: "session_start" });
  assert.match(render(), /can sleep/u);
  assert.match(render(), /~\$0\.000/u);
  sessionManager.appendUsage("cache_warm", "test", "test", {
    input: 100,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 100,
    cost: { input: 0.123, output: 0, cacheRead: 0, cacheWrite: 0, total: 0.123 },
  });
  assert.match(render(), /~\$0\.123/u);
  await runner.emit({ type: "agent_start" });
  assert.equal(children.length, 1);
  await once(children[0], "spawn");
  assert.match(render(), /awake/u);
  assert.ok(renders > 0);
  await runner.emit({ type: "agent_end", messages: [] });
  await runner.emit({ type: "agent_start" });
  assert.equal(children.length, 1);
  assert.equal(live(children[0].pid), true);
  await runner.emit({ type: "agent_settled" });
  assert.match(render(), /can sleep/u);
  await gone(children[0]);
  await runner.emit({ type: "agent_start" });
  await once(children[1], "spawn");
  await runner.emit({ type: "session_shutdown", reason: "reload" });
  await gone(children[1]);
  assert.match(render(), /can sleep/u);
  await runner.emit({ type: "session_start" });
  await runner.emit({ type: "agent_start" });
  await once(children[2], "spawn");
  await runner.emit({ type: "session_shutdown", reason: "exit" });
  await gone(children[2]);
  assert.match(render(), /can sleep/u);
  assert.deepEqual(errors, []);
  console.log(
    "Pi lifecycle integration passed: session cost, startup, duplicate/retry, settlement, reload, shutdown, real child termination",
  );
} finally {
  for (const child of children) child.kill();
  footer?.dispose?.();
}
