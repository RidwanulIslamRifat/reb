import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { RebError } from "../../src/domain/errors.js";
import {
  assertNoSecrets,
  endpointPattern,
  harSecretValues,
  parseHar,
  summarizeHar,
} from "../../src/sources/har.js";

const sample = await readFile("tests/fixtures/har/sample.har", "utf8");

describe("HAR summary", () => {
  it("turns ids, uuids, hashes and tokens in paths into :id", () => {
    expect(endpointPattern("/users/123")).toBe("/users/:id");
    expect(endpointPattern("/users/456")).toBe("/users/:id");
    expect(endpointPattern("/docs/550e8400-e29b-41d4-a716-446655440000/edit")).toBe(
      "/docs/:id/edit",
    );
    expect(endpointPattern("/blobs/9f86d081884c7d659a2f")).toBe("/blobs/:id");
    expect(endpointPattern("/api/v1/me")).toBe("/api/v1/me");
    expect(endpointPattern("/people/test.user@example.com")).toBe("/people/:id");
  });

  it("groups requests by endpoint pattern", () => {
    const { endpoints, requests, hosts } = summarizeHar(sample);
    expect(requests).toBe(15);
    expect(hosts).toEqual(["app.acme-notes.example"]);
    const users = endpoints.find((e) => e.pattern === "/api/v1/users/:id")!;
    expect(users).toMatchObject({ method: "GET", count: 2, kind: "api", statuses: { "200": 2 } });
    expect(endpoints.find((e) => e.method === "POST")).toMatchObject({
      pattern: "/api/v1/documents",
      statuses: { "201": 1 },
    });
    expect(endpoints.find((e) => e.pattern === "/")!.kind).toBe("page");
  });

  it("detects polling and streaming", () => {
    const { endpoints } = summarizeHar(sample);
    const notifications = endpoints.find((e) => e.pattern === "/api/v1/notifications")!;
    expect(notifications.polling).toEqual({ every_seconds: 10, calls: 6 });
    expect(endpoints.find((e) => e.pattern === "/api/v1/events")!.streaming).toBe(
      "server-sent events",
    );
    expect(endpoints.find((e) => e.pattern === "/socket")!.streaming).toBe("websocket");
    expect(endpoints.find((e) => e.pattern === "/api/v1/users/:id")!.polling).toBeUndefined();
  });

  it("keeps no planted fake secret, and shows [REDACTED] where a secret query value was", () => {
    const summary = summarizeHar(sample);
    const text = JSON.stringify(summary);
    expect(sample).toContain("FAKE-SECRET");
    expect(text).not.toContain("FAKE-SECRET");
    expect(text).not.toContain("test.user@example.com");
    expect(
      summary.endpoints.find((e) => e.pattern === "/api/v1/notifications")!.query_params,
    ).toEqual(["access_token=[REDACTED]", "api_key=[REDACTED]", "since"]);
    expect(summary.removed.auth_headers).toBeGreaterThan(0);
    expect(summary.removed.cookies).toBeGreaterThan(0);
    expect(summary.removed.request_bodies).toBe(1);
  });

  it('refuses files that are not a HAR with "file is not a HAR"', async () => {
    for (const name of ["not-a-har.json", "broken.har"]) {
      const text = await readFile(`tests/fixtures/har/${name}`, "utf8");
      expect(() => summarizeHar(text)).toThrow(RebError);
      expect(() => summarizeHar(text)).toThrow("not a HAR");
    }
  });
});

describe("HAR secrets guard (M7)", () => {
  const inbox = "tests/fixtures/run-sample/evidence/inbox/session-01/network.har";

  it("measures request timing per endpoint: average and slowest", async () => {
    const { endpoints } = summarizeHar(await readFile(inbox, "utf8"));
    const status = endpoints.find((e) => e.pattern === "/api/v1/exports/status")!;
    expect(status).toMatchObject({ count: 4, avg_ms: 40, max_ms: 42 });
    expect(status.polling).toEqual({ every_seconds: 5, calls: 4 });
    expect(endpoints.find((e) => e.pattern === "/api/v1/events")!.streaming).toBe(
      "server-sent events",
    );
  });

  it("finds every planted credential value, and the summary holds none of them", async () => {
    const text = await readFile(inbox, "utf8");
    const secrets = harSecretValues(parseHar(text));
    for (const planted of [
      "Bearer FAKE-SECRET-BEARER-TOKEN-0001",
      "FAKE-SECRET-BEARER-TOKEN-0001",
      "FAKE-SECRET-COOKIE-0001",
      "FAKE-SECRET-SETCOOKIE-0001",
      "FAKE-SECRET-APIKEY-0001",
      "FAKE-SECRET-QUERY-TOKEN-0001",
      "FAKE-SECRET-SESSION-QUERY-0001",
    ]) {
      expect(secrets).toContain(planted);
    }
    const summary = JSON.stringify(summarizeHar(text));
    expect(() => assertNoSecrets(summary, secrets)).not.toThrow();
    expect(summary).not.toContain("FAKE-SECRET");
  });

  it("stops before storing when a secret would leak", () => {
    expect(() =>
      assertNoSecrets('{"x":"FAKE-SECRET-COOKIE-0001"}', ["FAKE-SECRET-COOKIE-0001"]),
    ).toThrow("reb stopped before storing a HAR summary");
  });
});
