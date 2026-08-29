// The positive-path tests prove that a system executable runs, which depends on the environment the runner
// inherited: a `BASH_ENV`, a look-alike `rm` earlier in PATH, or a shell setting in the developer's own Pi
// agent directory would make them fail or pass by accident. Each worker therefore starts from a known state;
// the agent directory itself comes from global-setup.ts.
const SYSTEM_PATH = "/usr/bin:/bin:/usr/sbin:/sbin";

delete process.env.BASH_ENV;
delete process.env.ENV;
for (const name of Object.keys(process.env)) {
  if (name.startsWith("BASH_FUNC_")) delete process.env[name];
}
process.env.PATH = [SYSTEM_PATH, process.env.PATH ?? ""].filter(Boolean).join(":");
