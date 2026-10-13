import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { buildProgram } from "../../src/adapters/cli/program.js";
import { createMcpServer } from "../../src/adapters/mcp/server.js";
import type { DashboardLauncher } from "../../src/workflows/context.js";
import { createRun } from "../../src/workflows/runs.js";
import { testContext } from "../helpers.js";

/** A launcher that records what it was asked and pretends a server runs at port 4747. */
function fakeLauncher() {
  const calls: Array<{ root: string; run?: string; port?: number }> = [];
  const opened: string[] = [];
  const dashboard: DashboardLauncher = async ({ root, run, port }) => {
    calls.push({ root, run: run?.slug, port });
    return { url: "http://127.0.0.1:4747/", close: async () => {} };
  };
  const openBrowser = async (url: string) => {
    opened.push(url);
  };
  return { dashboard, openBrowser, calls, opened };
}

describe("reb dashboard", () => {
  it("starts the dashboard on the named run and opens the browser", async () => {
    const fake = fakeLauncher();
    let out = "";
    await buildProgram({ out: (t) => (out += t), env: { REB_HOME: "unused" }, ...fake }).parseAsync(
      ["dashboard", "--run", "tests/fixtures/dashboard-sample", "--port", "5000"],
      { from: "user" },
    );
    expect(fake.calls).toEqual([{ root: expect.any(String), run: "dashboard-sample", port: 5000 }]);
    expect(fake.opened).toEqual(["http://127.0.0.1:4747/#/run/dashboard-sample"]);
    expect(out).toContain(
      "The reb dashboard is running at http://127.0.0.1:4747/#/run/dashboard-sample",
    );
    expect(out).toContain("Ctrl+C");
  });

  it("with --no-open only prints the address", async () => {
    const fake = fakeLauncher();
    let out = "";
    const root = (await testContext()).root;
    await buildProgram({ out: (t) => (out += t), env: { REB_HOME: root }, ...fake }).parseAsync(
      ["dashboard", "--no-open"],
      { from: "user" },
    );
    expect(fake.opened).toEqual([]);
    expect(out).toContain("Open that address in your browser.");
  });
});

describe("open_dashboard MCP tool", () => {
  async function connect(home: string, extras = {}) {
    const server = await createMcpServer("0.0.0-test", { REB_HOME: home }, extras);
    const client = new Client({ name: "test", version: "0" });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(a), client.connect(b)]);
    return async (args: Record<string, unknown>) =>
      (await client.callTool({ name: "open_dashboard", arguments: args })) as {
        isError?: boolean;
        content: Array<{ text: string }>;
      };
  }

  it("opens the dashboard on a run and returns its address", async () => {
    const ctx = await testContext();
    const { slug } = await createRun(ctx, { domain: "example.com" });
    const fake = fakeLauncher();
    const call = await connect(ctx.root, fake);
    const result = await call({ run: slug });
    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0]!.text);
    expect(data).toMatchObject({ url: `http://127.0.0.1:4747/#/run/${slug}`, opened: true, slug });
    expect(data).not.toHaveProperty("handle");
    expect(fake.calls).toEqual([{ root: ctx.root, run: slug, port: undefined }]);
  });

  it("explains when this process cannot start a dashboard", async () => {
    const call = await connect(join((await testContext()).root));
    const result = await call({});
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toMatch(/reb dashboard/);
  });
});
