import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { createMcpServer, TOOLS } from "../../src/adapters/mcp/server.js";
import { createContext } from "../../src/workflows/context.js";
import { createRun } from "../../src/workflows/runs.js";
import { savePlan } from "../../src/workflows/plan.js";
import { samplePlan, tempDir } from "../helpers.js";

/** Every MCP tool name in SPEC 9. Tools from later milestones are not registered yet. */
const SPEC_TOOLS = [
  "create_run",
  "get_brief",
  "update_brief",
  "list_runs",
  "create_plan",
  "get_plan",
  "next_task",
  "update_task_status",
  "check_gate",
  "run_audit",
  "apply_replan",
  "record_source",
  "record_evidence",
  "list_evidence",
  "upsert_node",
  "link_nodes",
  "get_node",
  "query_graph",
  "validate_graph",
  "build_graph",
  "read_public_page",
  "detect_tech_stack",
  "summarize_har",
  "make_test_plan",
  "make_test_dataset",
  "import_inbox",
  "render_report",
  "open_dashboard",
  "log_role_work",
];
const LATER = [
  "make_test_plan",
  "make_test_dataset",
  "import_inbox",
  "render_report",
  "open_dashboard",
];
/** Not in SPEC 9: lets the planner save a whole hand-written plan (create_plan covers the usual case). */
const EXTRA = ["save_plan"];

async function connect(home: string) {
  const server = await createMcpServer("0.0.0-test", { REB_HOME: home });
  const client = new Client({ name: "test", version: "0" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const result = (await client.callTool({ name, arguments: args })) as {
      isError?: boolean;
      content: Array<{ text: string }>;
    };
    const text = result.content[0]!.text;
    return {
      isError: result.isError ?? false,
      text,
      data: result.isError ? null : JSON.parse(text),
    };
  };
  return { client, call };
}

describe("MCP server", () => {
  it("registers every SPEC 9 tool that exists so far, each with a description", async () => {
    const { client } = await connect(join(await tempDir(), "runs"));
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    const expected = [...SPEC_TOOLS.filter((t) => !LATER.includes(t)), ...EXTRA].sort();
    expect(names).toEqual(expected);
    expect(TOOLS.map((t) => t.name).sort()).toEqual(expected);
    for (const t of tools) {
      expect(t.description!.length).toBeGreaterThan(30);
      expect(t.inputSchema.type).toBe("object");
    }
    expect(client.getInstructions()).toContain("Safety rules");
  });

  it("runs a whole flow through the same workflows as the CLI and logs it with via mcp", async () => {
    const home = join(await tempDir(), "runs");
    const { call } = await connect(home);
    const created = await call("create_run", { domain: "example.com", reports: ["feature"] });
    const run = created.data.slug as string;
    expect(created.data.run_folder).toBe(join(home, run));
    expect(created.data).not.toHaveProperty("paths");

    expect(
      (await call("save_plan", { run, plan: samplePlan, reason: "first plan" })).data.plan.version,
    ).toBe(1);
    const next = await call("next_task", { run });
    expect(next.data.task.id).toBe("t1");
    expect(next.data.role_prompt).toContain("Desk researcher");
    expect(next.data.role_tools).toContain("record_source");

    const source = await call("record_source", {
      run,
      url: "https://example.com/pricing",
      title: "Pricing",
      content: "page text",
    });
    expect(source.data.record.id).toBe("S-001");
    await call("upsert_node", { run, type: "feature", name: "SSO", label: "documented" });
    const evidence = await call("record_evidence", {
      run,
      role: "desk_researcher",
      subject: "feature-sso",
      operation: "read pricing page",
      source: "S-001",
      finding: "SSO is on the Business plan.",
      confidence: "documented",
    });
    expect(evidence.data.record.id).toBe("E-001");
    expect(
      (await call("link_nodes", { run, from: "feature-sso", type: "evidence", to: "E-001" })).data
        .changed,
    ).toBe(true);
    expect((await call("get_node", { run, id: "feature-sso" })).data.evidence).toHaveLength(1);
    expect((await call("query_graph", { run, type: "feature" })).data.nodes).toHaveLength(1);
    expect((await call("validate_graph", { run })).data.problems).toEqual([]);
    expect((await call("build_graph", { run })).data.stats.features_with_evidence).toBe(1);
    expect((await call("list_evidence", { run, kind: "evidence" })).data.records).toHaveLength(1);
    expect(
      (await call("update_task_status", { run, task: "t1", status: "done" })).data.changed,
    ).toBe(true);
    expect(
      (await call("log_role_work", { run, role: "desk_researcher", summary: "Read pricing." }))
        .isError,
    ).toBe(false);
    expect((await call("get_plan", {})).data.note).toContain(`Using run ${run}`);
    expect(
      (await call("update_brief", { run, changes: { category: "b2b-saas" } })).data.brief.category,
    ).toBe("b2b-saas");
    expect((await call("get_brief", { run })).data.brief.category).toBe("b2b-saas");
    expect((await call("list_runs")).data.runs[0].slug).toBe(run);

    const events = (await readFile(join(home, run, "logs", "events.jsonl"), "utf8"))
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l) as { tool: string; via: string });
    expect(events.every((e) => e.via === "mcp")).toBe(true);
    expect(events.map((e) => e.tool)).toContain("record_evidence");

    // The CLI's workflow call writes the same plan file as the MCP tool.
    const cliHome = join(await tempDir(), "runs");
    const cliCtx = createContext("cli", { REB_HOME: cliHome });
    const cliRun = await createRun(cliCtx, { domain: "example.com", reports: ["feature"] });
    await savePlan(cliCtx, { run: cliRun.slug, plan: samplePlan, reason: "first plan" });
    const mcpPlan = JSON.parse(
      await readFile(join(home, run, "plan", "history", "plan-v1.json"), "utf8"),
    );
    const cliPlan = JSON.parse(
      await readFile(join(cliHome, cliRun.slug, "plan", "plan.json"), "utf8"),
    );
    expect(mcpPlan).toEqual(cliPlan);
  });

  it("runs the planner and auditor loop: create_plan, next_task, check_gate, run_audit, apply_replan", async () => {
    const { call } = await connect(join(await tempDir(), "runs"));
    const run = (
      await call("create_run", {
        domain: "example.com",
        category: "marketplace",
        reports: ["feature"],
      })
    ).data.slug as string;
    expect((await call("create_plan", { run })).data.plan.pipeline).toBe("marketplace");
    const next = await call("next_task", { run });
    expect(next.data.task.id).toBe("company");
    const gate = await call("check_gate", { run, task: "company" });
    expect(gate.data.passed).toBe(false);
    expect(gate.data.checks[0]).toMatchObject({ status: "fail" });
    const audit = await call("run_audit", { run });
    expect(audit.data.audit).toMatchObject({ number: 1, stop: false });
    expect(audit.data.file).toMatch(/audit-1\.md$/);
    const replan = await call("apply_replan", {
      run,
      changes: [{ op: "add", gap: 1, force: true, task: { title: "Map the company first" } }],
    });
    expect(replan.data.plan.version).toBe(2);
    expect(replan.data.decisions[0].reason).toMatch(/^audit 1 item 1 \[blocking\]/);
    const bad = await call("apply_replan", { run, changes: [{ op: "move", gap: 1 }] });
    expect(bad.isError).toBe(true);
  });

  it("returns reb errors as tool errors with Problem and Fix, and rejects invalid input", async () => {
    const { call } = await connect(join(await tempDir(), "runs"));
    const missing = await call("get_plan", {});
    expect(missing.isError).toBe(true);
    expect(missing.text).toMatch(/^Problem: There are no runs .*\nFix: /);
    const invalid = await call("upsert_node", { type: "nonsense", name: "x", label: "observed" });
    expect(invalid.isError).toBe(true);
    expect(invalid.text).toMatch(/Input validation error/);
  });

  it("offers the M5 research tools: HAR summary without secrets, and safe page refusals", async () => {
    const home = join(await tempDir(), "runs");
    const { call } = await connect(home);
    const har = await call("summarize_har", { file: "tests/fixtures/har/sample.har" });
    expect(har.data.summary.requests).toBe(15);
    expect(har.text).not.toContain("FAKE-SECRET");
    const run = (await call("create_run", { domain: "example.com" })).data.slug as string;
    // Refused before any network request: a private address is never read.
    const refused = await call("read_public_page", { run, url: "http://localhost:3000/" });
    expect(refused.isError).toBe(true);
    expect(refused.text).toMatch(/^Problem: localhost is a local or private address/);
  });
});
