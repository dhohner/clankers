import http from "node:http";
import https from "node:https";
import net from "node:net";
import { beforeEach } from "vitest";

/** Guard both public request APIs and sockets, including callers holding named imports. */
function describeFetchTarget(input: Parameters<typeof fetch>[0]): string {
  if (input instanceof URL) return input.href;

  if (input instanceof Request) return input.url;

  return String(input);
}

function isString<Value>(value: Value): value is Value & string {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Decode overloaded Node request arguments at the guard boundary.
  return typeof value === "string";
}

function isNumber(value: unknown): value is number {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Decode overloaded Node socket arguments at the guard boundary.
  return typeof value === "number";
}

function isObject(value: unknown): value is object {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Decode request options at the guard boundary.
  return typeof value === "object" && value !== null;
}

type TargetOptions = {
  protocol?: string;
  hostname?: string;
  host?: string;
  port?: string | number;
  path?: string;
  socketPath?: string;
};

/** Keep only the options used in a target description; callbacks and other arguments are ignored. */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- This decoder accepts Node's overloaded and internal normalized arguments.
function parseTargetOptions(value: unknown): TargetOptions {
  if (!isObject(value)) return {};

  const options: TargetOptions = {};

  if ("protocol" in value) options.protocol = isString(value.protocol) ? value.protocol : undefined;

  if ("hostname" in value) options.hostname = isString(value.hostname) ? value.hostname : undefined;

  if ("host" in value) options.host = isString(value.host) ? value.host : undefined;

  if ("port" in value) options.port = isString(value.port) || isNumber(value.port) ? value.port : undefined;

  if ("path" in value) options.path = isString(value.path) ? value.path : undefined;

  if ("socketPath" in value) options.socketPath = isString(value.socketPath) ? value.socketPath : undefined;

  return options;
}

function optionsFromUrl(url: URL): TargetOptions {
  return {
    protocol: url.protocol,
    hostname: url.hostname,
    port: url.port === "" ? undefined : url.port,
    path: `${url.pathname}${url.search}`,
  };
}

function describeRequestTarget(defaultProtocol: string, args: readonly unknown[]): string {
  const [first, second] = args;

  const fromUrl = isString(first)
    ? optionsFromUrl(new URL(first))
    : first instanceof URL
      ? optionsFromUrl(first)
      : undefined;

  const explicit = fromUrl === undefined ? first : second;
  const options = { ...fromUrl, ...parseTargetOptions(explicit) };

  const protocol = options.protocol ?? defaultProtocol;
  const path = options.path ?? "/";

  if (options.socketPath !== undefined) return `${protocol}//unix:${options.socketPath}:${path}`;

  const host = options.hostname ?? options.host ?? "localhost";
  const port = options.port === undefined ? "" : `:${String(options.port)}`;

  return `${protocol}//${host}${port}${path}`;
}

function describeConnectTarget(args: readonly unknown[]): string {
  const [first, second] = Array.isArray(args[0]) ? args[0] : args;

  if (isNumber(first)) return `${isString(second) ? second : "localhost"}:${first}`;

  if (isString(first)) return first;

  const options = parseTargetOptions(first);

  if (options.path !== undefined) return options.path;

  const host = options.host ?? options.hostname ?? "localhost";

  return options.port === undefined ? host : `${host}:${String(options.port)}`;
}

function refuse(callName: string, target: string): never {
  throw new Error(`Network access is not allowed in this test suite. ${callName} tried to reach ${target}.`);
}

function install(): void {
  globalThis.fetch = (input) => refuse("fetch", describeFetchTarget(input));
  http.request = (...args: unknown[]): never => refuse("http.request", describeRequestTarget("http:", args));
  http.get = (...args: unknown[]): never => refuse("http.get", describeRequestTarget("http:", args));
  https.request = (...args: unknown[]): never => refuse("https.request", describeRequestTarget("https:", args));
  https.get = (...args: unknown[]): never => refuse("https.get", describeRequestTarget("https:", args));
  net.Socket.prototype.connect = (...args: unknown[]): never =>
    refuse("A socket connection", describeConnectTarget(args));
}

// Keep the guard installed between tests; restoring it could expose a concurrent test to the network.
install();

beforeEach(install);
