import { describe, expect, it } from "vitest";
import { BriefSchema } from "../../src/domain/brief.js";
import type { GraphNode, NodeMeta } from "../../src/domain/node.js";
import { buildTestPlan, renderTestPlan } from "../../src/domain/testPlan.js";

type Args = Pick<NodeMeta, "id" | "type" | "name"> & Partial<NodeMeta> & Record<string, unknown>;
const node = ({ links, label, ...rest }: Args): GraphNode => ({
  meta: { label: label ?? "documented", links: links ?? {}, ...rest } as NodeMeta,
  body: "",
});
const brief = (reports: string[]) =>
  BriefSchema.parse({ product: "ledgerly.example", url: "https://ledgerly.example", reports });

const NODES = [
  node({ id: "journey-get-paid", type: "journey", name: "Get paid" }),
  node({ id: "screen-invoices", type: "screen", name: "Invoices", path: "/invoices" }),
  node({ id: "user_role-accountant", type: "user_role", name: "Accountant" }),
  node({ id: "business_rule-free-limit", type: "business_rule", name: "Five invoices on Free" }),
];

describe("make_test_plan (v2 rebuild steps)", () => {
  it("adds screens, roles and rules steps that name the graph's nodes", () => {
    const plan = buildTestPlan({
      brief: brief(["rebuild"]),
      nodes: NODES,
      records: [],
      session: "session-01",
    });
    expect(plan.steps.map((s) => s.kind)).toEqual([
      "setup",
      "journey",
      "screens",
      "roles",
      "rules",
    ]);
    const md = renderTestPlan(plan, "ledgerly.example");
    expect(md).toContain('Find "Invoices" (/invoices)');
    expect(md).toContain("`screen-invoices.png`");
    expect(md).toContain('Check what "Accountant" can and cannot use.');
    expect(md).toContain("[business_rule-free-limit] confirmed or not");
  });

  it("leaves them out when no rebuild report is asked for and the graph has none of those nodes", () => {
    const plan = buildTestPlan({
      brief: brief(["feature"]),
      nodes: NODES.slice(0, 1),
      records: [],
      session: "session-01",
    });
    expect(plan.steps.map((s) => s.kind)).toEqual(["setup", "journey"]);
  });
});
