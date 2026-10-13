import { describe, expect, it } from "vitest";
import {
  formatDecision,
  formatRoleLogEntry,
  parseDecisions,
  parseRoleLog,
} from "../../src/domain/event.js";
import { shortestPath } from "../../src/domain/graphPath.js";
import { parsePlan } from "../../src/domain/plan.js";
import { diffPlans } from "../../src/domain/planDiff.js";
import { openRunFolder } from "../../src/storage/runFolder.js";
import {
  findRun,
  viewGraph,
  viewLogs,
  viewPath,
  viewPlan,
  viewPlanDiff,
  viewReport,
  viewRuns,
} from "../../src/workflows/dashboard.js";
import { tempDir } from "../helpers.js";

const FIXTURE = "tests/fixtures/dashboard-sample";

async function scope() {
  const run = await openRunFolder("unused", FIXTURE);
  return { root: await tempDir(), pinned: [run] };
}

describe("plan diff", () => {
  const base = { product: "x", pipeline: "", reports: [] };
  const task = (id: string, extra = {}) => ({
    id,
    title: id,
    role: "planner",
    added_in: 1,
    ...extra,
  });
  it("lists added, removed and changed tasks", () => {
    const older = parsePlan({ ...base, version: 1, tasks: [task("a"), task("b")] }, "v1");
    const newer = parsePlan(
      { ...base, version: 2, tasks: [task("a", { status: "done" }), task("c", { added_in: 2 })] },
      "v2",
    );
    const diff = diffPlans(older, newer);
    expect(diff.added.map((t) => t.id)).toEqual(["c"]);
    expect(diff.removed.map((t) => t.id)).toEqual(["b"]);
    expect(diff.changed).toEqual([
      { id: "a", title: "a", changes: [{ field: "status", before: "pending", after: "done" }] },
    ]);
    expect(diff.reordered).toBe(false);
  });
});

describe("shortest path", () => {
  const edges = [
    { from: "a", type: "has", to: "b" },
    { from: "b", type: "has", to: "c" },
    { from: "d", type: "uses", to: "c" },
    { from: "a", type: "has", to: "x" },
    { from: "x", type: "has", to: "y" },
    { from: "y", type: "has", to: "d" },
  ];
  it("follows links both ways and takes the fewest steps", () => {
    expect(shortestPath(["a", "b", "c", "d", "x", "y"], edges, "a", "d")?.nodes).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
  });
  it("returns null for unknown or unconnected nodes, and a single node for itself", () => {
    expect(shortestPath(["a", "z"], edges, "a", "z")).toBeNull();
    expect(shortestPath(["a"], edges, "a", "missing")).toBeNull();
    expect(shortestPath(["a"], edges, "a", "a")).toEqual({ nodes: ["a"], edges: [] });
  });

  it("finds the shortest path between two fixture nodes", async () => {
    const path = await viewPath(
      await scope(),
      "dashboard-sample",
      "persona-writer",
      "feature-export",
    );
    expect(path.found).toBe(true);
    expect(path.nodes).toEqual(["persona-writer", "journey-export-a-note", "feature-export"]);
    expect(path.edges.map((e) => e.type)).toEqual(["does", "uses"]);
  });
});

describe("log parsers", () => {
  it("read back what reb writes", () => {
    const d = {
      at: "2026-10-01T10:00:00.000Z",
      plan_version: 3,
      change: "task a: x -> y",
      reason: "because | why",
    };
    expect(parseDecisions(formatDecision(d) + "not a decision\n")).toEqual([d]);
    const e = {
      at: "2026-10-01T10:00:00.000Z",
      role: "planner" as const,
      task: "t1",
      summary: "Did it.\n\nTwo lines.",
    };
    const f = { at: "2026-10-01T11:00:00.000Z", role: "planner" as const, summary: "No task." };
    expect(parseRoleLog(formatRoleLogEntry(e) + formatRoleLogEntry(f), "planner")).toEqual([e, f]);
  });
});

describe("dashboard views of the fixture run", () => {
  it("list the runs, the plan with its history, and diffs", async () => {
    const s = await scope();
    const runs = await viewRuns(s);
    expect(runs.runs.map((r) => r.slug)).toEqual(["dashboard-sample"]);
    expect(runs.runs[0]).toMatchObject({ product: "acme-notes.example", plan_version: 11 });

    const plan = await viewPlan(s, "dashboard-sample");
    expect(plan.current_version).toBe(11);
    expect(plan.versions).toEqual([11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
    expect((await viewPlan(s, "dashboard-sample", 1)).plan?.version).toBe(1);

    const { diff, decisions } = await viewPlanDiff(s, "dashboard-sample", 10, 11);
    expect(diff.added.map((t) => t.id)).toEqual(["a1-feature", "audit-r1"]);
    expect(decisions.every((d) => d.plan_version === 11)).toBe(true);
    await expect(viewPlan(s, "dashboard-sample", 99)).rejects.toThrow(/no plan version 99/);
  });

  it("show the graph without evidence links, and logs from every source", async () => {
    const s = await scope();
    const graph = await viewGraph(s, "dashboard-sample");
    expect(graph.nodes).toHaveLength(20);
    expect(graph.edges.some((e) => e.type === "evidence")).toBe(false);
    expect(graph.nodes.find((n) => n.id === "feature-export")?.evidence).toBe(2);

    const kinds = new Set((await viewLogs(s, "dashboard-sample")).entries.map((e) => e.kind));
    expect([...kinds].sort()).toEqual(["audit", "plan", "role", "tool"]);
  });

  it("refuse run and report names that are paths", async () => {
    const s = await scope();
    await expect(findRun(s, "../etc")).rejects.toThrow(/not a run name/);
    await expect(viewReport(s, "dashboard-sample", "../brief.md")).rejects.toThrow(
      /no Markdown report/,
    );
    expect((await viewReport(s, "dashboard-sample", "feature.md")).text).toMatch(
      /^# Feature report/,
    );
  });
});
