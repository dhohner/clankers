import http, { request as httpRequest } from "node:http";
import https, { request as httpsRequest } from "node:https";
import net from "node:net";
import { describe, expect, it } from "vitest";

describe("offline guard", () => {
  it("fails a fetch call and names the target", () => {
    expect(() => fetch("https://example.com/styles")).toThrow("fetch tried to reach https://example.com/styles");
  });

  it("names the target of a URL instance", () => {
    expect(() => fetch(new URL("https://example.com/from-url"))).toThrow(
      "fetch tried to reach https://example.com/from-url",
    );
  });

  it("fails an http request and names the target", () => {
    expect(() => http.request("http://example.com/plain")).toThrow(
      "http.request tried to reach http://example.com/plain",
    );
    expect(() => http.get({ hostname: "example.com", port: 8080, path: "/from-options" })).toThrow(
      "http.get tried to reach http://example.com:8080/from-options",
    );
  });

  it("fails an https request and names the target", () => {
    expect(() => https.request("https://example.com/secure")).toThrow(
      "https.request tried to reach https://example.com/secure",
    );
    expect(() => https.get({ hostname: "example.com", path: "/secure-options" })).toThrow(
      "https.get tried to reach https://example.com/secure-options",
    );
  });

  it("prefers the options object over the URL, as Node does", () => {
    expect(() => http.request("http://example.com/from-url", { hostname: "other.example", path: "/override" })).toThrow(
      "http.request tried to reach http://other.example/override",
    );
  });

  it("names a Unix domain socket instead of a host", () => {
    expect(() => http.request({ socketPath: "/tmp/service.sock", path: "/status" })).toThrow(
      "http.request tried to reach http://unix:/tmp/service.sock:/status",
    );
  });

  it("fails a request that a named import made", () => {
    // A named import copies the function before any hook runs, so only the socket level sees it.
    expect(() => httpRequest("http://example.com/named")).toThrow("A socket connection tried to reach example.com:80");
    expect(() => httpsRequest("https://example.com/named")).toThrow(
      "A socket connection tried to reach example.com:443",
    );
  });

  it("fails a direct socket connection", () => {
    expect(() => net.createConnection({ host: "example.com", port: 80 })).toThrow(
      "A socket connection tried to reach example.com:80",
    );
    expect(() => net.createConnection(9999, "example.com")).toThrow(
      "A socket connection tried to reach example.com:9999",
    );
  });

  it("states the rule in the failure message", () => {
    expect(() => fetch("https://example.com")).toThrow("Network access is not allowed in this test suite.");
  });
});

// A guard that restores the real functions after each test would open the network for a concurrent
// test that still runs. The short test here finishes first, and the long test checks the guard
// afterwards.
describe.concurrent("offline guard under concurrent tests", () => {
  it("holds while a shorter concurrent test finishes", async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(() => fetch("https://example.com/late")).toThrow("fetch tried to reach https://example.com/late");
    expect(() => http.request("http://example.com/late")).toThrow(
      "http.request tried to reach http://example.com/late",
    );
    expect(() => net.createConnection({ host: "example.com", port: 80 })).toThrow(
      "A socket connection tried to reach example.com:80",
    );
  });

  it("finishes early", () => {
    expect(() => fetch("https://example.com/early")).toThrow("fetch tried to reach https://example.com/early");
  });
});
