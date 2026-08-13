import http from "node:http";
import https from "node:https";
import net from "node:net";
import { beforeEach } from "vitest";

/**
 * Fails any test that opens a network connection. A test that reaches the network is slow, is
 * flaky, and depends on the machine that runs it.
 *
 * The guard works on two levels. It replaces the global `fetch` function and the request functions
 * of `node:http` and `node:https`, which gives a message that names the requested URL. It also
 * replaces `net.Socket.prototype.connect`, which is the one point that every outgoing connection
 * passes. The second level catches a caller that holds a reference the first level cannot reach,
 * for example `import { request } from "node:http"`. Such a named import copies the function
 * before any hook runs, so a replacement of the module property misses it.
 */

/** Names the target of a `fetch` call, which accepts a string, a `URL`, or a `Request`. */
function describeFetchTarget(input: unknown): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  if (typeof input === "object" && input !== null && "url" in input) {
    const { url } = input as { url: unknown };
    if (typeof url === "string") return url;
  }
  return String(input);
}

type RequestOptions = Record<string, unknown>;

/** Splits a URL into the request options that Node derives from it. */
function optionsFromUrl(url: URL): RequestOptions {
  return {
    protocol: url.protocol,
    hostname: url.hostname,
    port: url.port === "" ? undefined : url.port,
    path: `${url.pathname}${url.search}`,
  };
}

/**
 * Names the target of an `http` or `https` request call. Both functions accept a URL, an options
 * object, or a URL followed by an options object. Node merges both arguments in that last form,
 * and a value in the options object wins over the same value from the URL.
 */
function describeRequestTarget(defaultProtocol: string, args: readonly unknown[]): string {
  const [first, second] = args;
  const fromUrl =
    typeof first === "string"
      ? optionsFromUrl(new URL(first))
      : first instanceof URL
        ? optionsFromUrl(first)
        : undefined;
  const explicit = fromUrl === undefined ? first : second;
  const fromOptions = (
    typeof explicit === "object" && explicit !== null ? explicit : {}
  ) as RequestOptions;
  const options: RequestOptions = { ...fromUrl, ...fromOptions };

  const protocol = typeof options.protocol === "string" ? options.protocol : defaultProtocol;
  const path = typeof options.path === "string" ? options.path : "/";
  // The option socketPath names a Unix domain socket, which replaces the host and the port.
  if (typeof options.socketPath === "string") {
    return `${protocol}//unix:${options.socketPath}:${path}`;
  }

  const host =
    typeof options.hostname === "string"
      ? options.hostname
      : typeof options.host === "string"
        ? options.host
        : "localhost";
  const port = options.port === undefined ? "" : `:${String(options.port)}`;
  return `${protocol}//${host}${port}${path}`;
}

/**
 * Names the target of a socket connection. Node takes an options object, a port with a host, or a
 * socket path. A caller inside Node passes an already normalized argument array instead, whose
 * first item holds the options.
 */
function describeConnectTarget(args: readonly unknown[]): string {
  const [first, second] = Array.isArray(args[0]) ? (args[0] as unknown[]) : args;
  if (typeof first === "number") {
    const host = typeof second === "string" ? second : "localhost";
    return `${host}:${first}`;
  }
  if (typeof first === "string") return first;

  const options = (typeof first === "object" && first !== null ? first : {}) as RequestOptions;
  if (typeof options.path === "string") return options.path;

  const host =
    typeof options.host === "string"
      ? options.host
      : typeof options.hostname === "string"
        ? options.hostname
        : "localhost";
  return options.port === undefined ? host : `${host}:${String(options.port)}`;
}

function refuse(callName: string, target: string): never {
  throw new Error(
    `Network access is not allowed in this test suite. ${callName} tried to reach ${target}.`,
  );
}

function install(): void {
  globalThis.fetch = ((input: unknown) => {
    refuse("fetch", describeFetchTarget(input));
  }) as typeof globalThis.fetch;

  http.request = ((...args: unknown[]) => {
    refuse("http.request", describeRequestTarget("http:", args));
  }) as unknown as typeof http.request;
  http.get = ((...args: unknown[]) => {
    refuse("http.get", describeRequestTarget("http:", args));
  }) as unknown as typeof http.get;
  https.request = ((...args: unknown[]) => {
    refuse("https.request", describeRequestTarget("https:", args));
  }) as unknown as typeof https.request;
  https.get = ((...args: unknown[]) => {
    refuse("https.get", describeRequestTarget("https:", args));
  }) as unknown as typeof https.get;

  net.Socket.prototype.connect = function guardedConnect(...args: unknown[]): never {
    refuse("A socket connection", describeConnectTarget(args));
  } as unknown as typeof net.Socket.prototype.connect;
}

/**
 * The guard stays installed for the whole test file. The first call covers the module scope and
 * every hook, and the `beforeEach` hook repairs a surface that the restore of mocks or of stubbed
 * globals returned to its real function. The guard never restores a real function, because a
 * concurrent test that finished would otherwise open the network for a concurrent test that still
 * runs.
 */
install();
beforeEach(install);
