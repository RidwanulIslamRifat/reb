import { describe, expect, it } from "vitest";
import { compareGraphs } from "../../src/domain/compare.js";
import type { GraphNode, NodeMeta } from "../../src/domain/node.js";

type Args = Pick<NodeMeta, "id" | "type" | "name"> & Partial<NodeMeta> & Record<string, unknown>;
const node = ({ links, label, ...rest }: Args): GraphNode => ({
  meta: { label: label ?? "documented", links: links ?? {}, ...rest } as NodeMeta,
  body: "",
});

const EARLIER: GraphNode[] = [
  node({ id: "product-ledgerly", type: "product", name: "Ledgerly" }),
  node({ id: "feature-send-invoice", type: "feature", name: "Send invoice", label: "documented" }),
  node({ id: "feature-fax", type: "feature", name: "Fax invoices" }),
  node({
    id: "risk-one-processor",
    type: "risk",
    name: "One payment processor",
    category: "dependency",
    likelihood: "medium",
    impact: "high",
    mitigation: "None public.",
  }),
  node({
    id: "metric-customers-2025",
    type: "metric",
    name: "Customers 2025",
    kind: "customers",
    value: 2000,
    as_of: "2025-06",
  }),
];

const LATER: GraphNode[] = [
  node({ id: "product-ledgerly", type: "product", name: "Ledgerly" }),
  node({ id: "feature-send-invoice", type: "feature", name: "Send invoice", label: "observed" }),
  node({ id: "feature-recurring", type: "feature", name: "Recurring invoices" }),
  node({
    id: "risk-one-processor",
    type: "risk",
    name: "One payment processor",
    category: "dependency",
    likelihood: "low",
    impact: "high",
    mitigation: "Second processor added.",
  }),
  node({
    id: "metric-customers-2026",
    type: "metric",
    name: "Customers 2026",
    kind: "customers",
    value: 4000,
    as_of: "2026-06",
  }),
];

const RIVAL: GraphNode[] = [
  node({ id: "product-billbird", type: "product", name: "Billbird" }),
  node({ id: "feature-send-invoice", type: "feature", name: "Send invoice" }),
  node({ id: "feature-time-tracking", type: "feature", name: "Time tracking" }),
  node({ id: "pricing_tier-free", type: "pricing_tier", name: "Free" }),
];

describe("compare_runs", () => {
  it("shows what changed between two runs of the same product", () => {
    const c = compareGraphs(
      { slug: "ledgerly-2025", product: "ledgerly.example", nodes: EARLIER },
      { slug: "ledgerly-2026", product: "ledgerly.example", nodes: LATER },
    );
    expect(c.same_product).toBe(true);
    expect(c.only_in_b.map((r) => r.name)).toEqual(["Recurring invoices", "Customers 2026"]);
    expect(c.only_in_a.map((r) => r.name)).toEqual(["Fax invoices", "Customers 2025"]);
    expect(c.changes.map((x) => `${x.name} ${x.what}: ${x.from} -> ${x.to}`)).toEqual([
      "Send invoice label: documented -> observed",
      "One payment processor likelihood: medium -> low",
      "One payment processor mitigation: None public. -> Second processor added.",
    ]);
    expect(c.metrics).toEqual([{ kind: "customers", a: "2000 (2025-06)", b: "4000 (2026-06)" }]);
    expect(c.markdown).toContain("## What changed");
    expect(c.markdown).toContain("New in the later run, ledgerly.example (ledgerly-2026)");
  });

  it("shows the gap between two competing products", () => {
    const c = compareGraphs(
      { slug: "ledgerly-2026", product: "ledgerly.example", nodes: LATER },
      { slug: "billbird-2026", product: "billbird.example", nodes: RIVAL },
    );
    expect(c.same_product).toBe(false);
    expect(c.in_both).toBe(1);
    expect(c.markdown).toContain("Only in billbird.example (billbird-2026)");
    const rivalOnly = c.markdown.split("## Only in billbird.example")[1]!;
    expect(rivalOnly).toContain("Time tracking [feature-time-tracking]");
    expect(rivalOnly).toContain("**pricing_tier**: Free");
    // Product nodes differ by name, but they are not a "gap" worth listing.
    expect(rivalOnly.split("## Read with care")[0]).not.toContain("Billbird [product-billbird]");
    expect(c.markdown).not.toContain("## What changed");
  });
});
