import { createHash } from "node:crypto";
import { request } from "node:http";
import { networkInterfaces } from "node:os";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { HOST, isLoopback, startDashboardServer } from "../../src/dashboard/server.js";
import { openRunFolder } from "../../src/storage/runFolder.js";
import type { DashboardHandle } from "../../src/workflows/context.js";
import { filesUnder, tempDir } from "../helpers.js";

const FIXTURE = "tests/fixtures/dashboard-sample";
const running: DashboardHandle[] = [];
afterEach(async () => {
  for (const h of running.splice(0)) await h.close();
});

async function start() {
  const appDir = await tempDir();
  const { writeFile } = await import("node:fs/promises");
  await writeFile(join(appDir, "index.html"), "<!doctype html><title>reb</title>");
  const run = await openRunFolder("unused", FIXTURE);
  const handle = await startDashboardServer({
    scope: { root: await tempDir(), pinned: [run] },
    appDir,
    port: 0,
  });
  running.push(handle);
  return new URL(handle.url);
}

/** A raw HTTP request, so tests can set any method and Host header. */
function send(
  url: URL,
  path: string,
  options: { method?: string; host?: string; address?: string } = {},
): Promise<{ status: number; body: string; headers: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: options.address ?? url.hostname,
        port: url.port,
        path,
        method: options.method ?? "GET",
        headers: { host: options.host ?? url.host },
      },
      (res) => {
        let body = "";
        res.on("data", (c: Buffer) => (body += c.toString()));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body, headers: res.headers }));
      },
    );
    req.on("error", reject);
    req.end();
  });
}

const json = async (url: URL, path: string) => {
  const res = await send(url, path);
  expect(res.status, `${path}: ${res.body}`).toBe(200);
  return JSON.parse(res.body) as Record<string, unknown>;
};

async function snapshot(dir: string) {
  const files = await filesUnder(dir);
  return Promise.all(
    files.map(async (f) => [
      f,
      createHash("sha256")
        .update(await readFile(join(dir, f)))
        .digest("hex"),
    ]),
  );
}

describe("dashboard server", () => {
  it("listens on 127.0.0.1 only", async () => {
    const url = await start();
    expect(url.hostname).toBe(HOST);
    const other = Object.values(networkInterfaces())
      .flat()
      .find((i) => i && i.family === "IPv4" && !i.internal);
    if (other) {
      // Another machine would reach this computer on this address: nothing listens there.
      await expect(send(url, "/api/runs", { address: other.address })).rejects.toThrow();
    }
  });

  it("knows which addresses are this computer", () => {
    expect(isLoopback("127.0.0.1")).toBe(true);
    expect(isLoopback("::1")).toBe(true);
    expect(isLoopback("::ffff:127.0.0.1")).toBe(true);
    expect(isLoopback("192.168.1.20")).toBe(false);
    expect(isLoopback("::ffff:10.0.0.1")).toBe(false);
    expect(isLoopback(undefined)).toBe(false);
  });

  it("refuses any method that could write", async () => {
    const url = await start();
    for (const method of ["POST", "PUT", "DELETE", "PATCH"]) {
      const res = await send(url, "/api/runs", { method });
      expect(res.status, method).toBe(405);
      expect(res.headers.allow).toBe("GET, HEAD");
      expect(JSON.parse(res.body).problem).toMatch(/read-only/);
    }
  });

  it("refuses requests that name another host (DNS rebinding)", async () => {
    const url = await start();
    expect((await send(url, "/api/runs", { host: `evil.example:${url.port}` })).status).toBe(403);
    expect((await send(url, "/api/runs", { host: `localhost:${url.port}` })).status).toBe(200);
  });

  it("returns runs, plan history and diff, graph, node, path, ledger, logs and reports", async () => {
    const url = await start();
    const r = "/api/runs/dashboard-sample";
    expect((await json(url, "/api/runs")).runs).toHaveLength(1);
    expect(await json(url, r)).toMatchObject({
      product: "acme-notes.example",
      counts: { nodes: 20 },
    });
    expect(await json(url, `${r}/plan`)).toMatchObject({ current_version: 11 });
    expect(await json(url, `${r}/plan?version=2`)).toMatchObject({ plan: { version: 2 } });
    const diff = (await json(url, `${r}/plan/diff?from=1&to=3`)).diff as { changed: unknown[] };
    expect(diff.changed).toHaveLength(1);
    expect(((await json(url, `${r}/graph`)).nodes as unknown[]).length).toBe(20);
    const node = await json(url, `${r}/nodes/feature-export`);
    expect((node.evidence as Array<{ id: string }>).map((e) => e.id)).toEqual(["E-005", "E-009"]);
    expect(await json(url, `${r}/path?from=persona-writer&to=feature-export`)).toMatchObject({
      found: true,
    });
    const records = (await json(url, `${r}/evidence`)).records as Array<{
      id: string;
      corrected_by: string | null;
    }>;
    expect(records.find((x) => x.id === "E-005")?.corrected_by).toBe("E-009");
    expect(((await json(url, `${r}/logs`)).entries as unknown[]).length).toBeGreaterThan(50);
    expect(await json(url, `${r}/reports`)).toMatchObject({
      reports: [{ name: "feature.md", format: "markdown" }],
    });
    expect((await json(url, `${r}/reports/feature.md`)).text).toMatch(/Feature report/);
    const frameworks = (await json(url, `${r}/frameworks`)).frameworks as Array<{
      framework: string;
      count: number;
      markdown: string;
    }>;
    expect(frameworks.map((f) => f.framework)).toContain("risk_register");
    expect(frameworks.find((f) => f.framework === "user_stories")!.count).toBeGreaterThan(0);
    expect(frameworks.find((f) => f.framework === "funding")!.markdown).toMatch(
      /Nothing in the graph/,
    );
  });

  it("explains unknown runs, nodes and reports instead of failing", async () => {
    const url = await start();
    for (const path of [
      "/api/runs/no-such-run",
      "/api/runs/..%2F..%2Fetc",
      "/api/runs/dashboard-sample/nodes/feature-missing",
      "/api/runs/dashboard-sample/reports/..%2Fbrief.md",
      "/api/nothing",
    ]) {
      const res = await send(url, path);
      expect(res.status, path).toBe(404);
      expect(JSON.parse(res.body)).toHaveProperty("fix");
    }
  });

  it("serves the web page for other addresses and never leaves its folder", async () => {
    const url = await start();
    for (const path of ["/", "/anything", "/../../package.json", "/%2e%2e/%2e%2e/package.json"]) {
      const res = await send(url, path);
      expect(res.status).toBe(200);
      expect(res.body).toContain("<title>reb</title>");
    }
    expect((await send(url, "/")).headers["content-security-policy"]).toMatch(/default-src 'self'/);
  });

  it("changes no file in the run folder", async () => {
    const before = await snapshot(FIXTURE);
    const url = await start();
    const r = "/api/runs/dashboard-sample";
    for (const p of [
      "",
      "/plan",
      "/plan/diff?from=1&to=11",
      "/graph",
      "/nodes/feature-single-sign-on",
      "/evidence",
      "/logs",
      "/reports",
    ]) {
      await json(url, `${r}${p}`);
    }
    await send(url, `${r}/plan`, { method: "POST" });
    expect(await snapshot(FIXTURE)).toEqual(before);
  });
});
