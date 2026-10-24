import { describe, expect, it } from "vitest";
import type { LedgerRecord } from "../../src/domain/evidence.js";
import {
  FRAMEWORK_INFO,
  FRAMEWORKS,
  frameworkView,
  riskRating,
  riskScore,
} from "../../src/domain/frameworks.js";
import type { GraphNode, NodeMeta } from "../../src/domain/node.js";

type Args = Pick<NodeMeta, "id" | "type" | "name"> & Partial<NodeMeta> & Record<string, unknown>;

function node({ links, label, body, ...rest }: Args & { body?: string }): GraphNode {
  return {
    meta: { label: label ?? "documented", links: links ?? {}, ...rest } as NodeMeta,
    body: body ?? "",
  };
}

const RECORDS: LedgerRecord[] = [
  {
    kind: "evidence",
    id: "E-001",
    role: "risk_analyst",
    subject: "risk-payment-processor",
    operation: "reasoning",
    source: "S-001",
    finding: "All payments go through one processor.",
    confidence: "inferred",
    limitations: [],
    links: [],
    at: "2026-10-01T09:00:00.000Z",
  },
];

const NODES: GraphNode[] = [
  node({ id: "product-ledgerly", type: "product", name: "Ledgerly" }),
  node({
    id: "risk-payment-processor",
    type: "risk",
    name: "One payment processor",
    category: "dependency",
    likelihood: "medium",
    impact: "high",
    mitigation: "None public.",
    links: { threatens: ["product-ledgerly"] },
  }),
  node({
    id: "risk-churn",
    type: "risk",
    name: "Small-business churn",
    category: "market",
    likelihood: "low",
    impact: "medium",
    mitigation: "Annual plans.",
  }),
  node({
    id: "finding-strong-onboarding",
    type: "finding",
    name: "Fast onboarding",
    rating: "high",
    area: "product",
    swot: "strength",
    recommendation: "Keep the three-step setup.",
    body: "\n# Fast onboarding\n\nA first invoice can be sent in three steps.\n",
  }),
  node({
    id: "finding-no-api",
    type: "finding",
    name: "No public API",
    rating: "medium",
    area: "technology",
    swot: "weakness",
  }),
  node({
    id: "trend-e-invoicing-mandates",
    type: "trend",
    name: "E-invoicing mandates",
    pestle: "legal",
    direction: "tailwind",
  }),
  node({
    id: "force-rivalry",
    type: "force",
    name: "Many invoicing apps",
    force: "rivalry",
    strength: "high",
  }),
  node({
    id: "metric-tam",
    type: "metric",
    name: "Invoicing software market",
    kind: "tam",
    value: "12B",
    unit: "USD",
    as_of: "2026",
  }),
  node({
    id: "metric-customers",
    type: "metric",
    name: "Customers",
    kind: "customers",
    value: 4000,
    as_of: "2026-06",
    links: { measures: ["product-ledgerly"] },
  }),
  node({
    id: "data_object-invoice",
    type: "data_object",
    name: "Invoice",
    fields: [
      { name: "number", type: "text", required: true },
      { name: "total", type: "money" },
    ],
    states: ["draft", "sent", "paid"],
    links: { relates_to: ["data_object-customer"] },
  }),
  node({ id: "data_object-customer", type: "data_object", name: "Customer" }),
  node({
    id: "screen-dashboard",
    type: "screen",
    name: "Dashboard",
    path: "/",
    links: { navigates_to: ["screen-invoices"] },
  }),
  node({
    id: "screen-invoices",
    type: "screen",
    name: "Invoices",
    path: "/invoices",
    links: { shows: ["feature-send-invoice"] },
  }),
  node({
    id: "feature-send-invoice",
    type: "feature",
    name: "Send invoice",
    acceptance: ["The customer gets an email with a pay link."],
  }),
  node({
    id: "user_role-accountant",
    type: "user_role",
    name: "Accountant",
    links: { can: ["feature-send-invoice"] },
  }),
  node({
    id: "persona-freelancer",
    type: "persona",
    name: "Freelancer",
    links: { does: ["journey-get-paid"] },
  }),
  node({
    id: "journey-get-paid",
    type: "journey",
    name: "Get paid",
    links: { uses: ["feature-send-invoice"] },
  }),
];

describe("framework views", () => {
  it("has a title, an about text and node types for every framework", () => {
    for (const f of FRAMEWORKS) {
      expect(FRAMEWORK_INFO[f].title.length, f).toBeGreaterThan(3);
      expect(FRAMEWORK_INFO[f].uses.length, f).toBeGreaterThan(0);
    }
  });

  it("says plainly when the graph has nothing for a framework", () => {
    const view = frameworkView("funding", NODES, RECORDS);
    expect(view.count).toBe(0);
    expect(view.markdown).toContain("needs funding_round nodes");
  });

  it("scores risks as likelihood x impact and sorts the register highest first", () => {
    expect(riskScore(NODES[1]!)).toBe(6);
    expect(riskRating(6)).toBe("high");
    expect(riskRating(4)).toBe("medium");
    expect(riskRating(2)).toBe("low");
    const view = frameworkView("risk_register", NODES, RECORDS);
    expect(view.count).toBe(2);
    const rows = view.markdown.split("\n").filter((l) => l.startsWith("| R"));
    expect(rows[0]).toContain("One payment processor");
    expect(rows[0]).toContain("| 6 | high |");
    expect(rows[0]).toContain("[risk-payment-processor, E-001]");
    expect(view.markdown).toContain("| High |  | R1 |  |");
  });

  it("builds a SWOT from findings, trends and high risks", () => {
    const md = frameworkView("swot", NODES, RECORDS).markdown;
    expect(md.indexOf("Fast onboarding")).toBeLessThan(md.indexOf("**Weaknesses**"));
    expect(md).toContain("No public API");
    expect(md.split("**Opportunities**")[1]).toContain("E-invoicing mandates");
    expect(md.split("**Threats**")[1]).toContain("One payment processor");
  });

  it("lists recommendations most important first, and five forces with an overall level", () => {
    expect(frameworkView("recommendations", NODES, RECORDS).markdown).toMatch(
      /^1\. \*\*High priority\*\*: Keep the three-step setup\./,
    );
    expect(frameworkView("five_forces", NODES, RECORDS).markdown).toContain(
      "Overall competitive pressure: **high**",
    );
  });

  it("keeps market sizes out of the metrics table and puts them in market_size", () => {
    expect(frameworkView("metrics", NODES, RECORDS).markdown).not.toContain("tam");
    expect(frameworkView("market_size", NODES, RECORDS).markdown).toContain(
      "TAM (total addressable market) | 12B USD | 2026",
    );
  });

  it("draws the rebuild views: sitemap, permissions, data model and user stories", () => {
    expect(frameworkView("sitemap", NODES, RECORDS).markdown).toMatch(
      /- \*\*Dashboard\*\* `\/`.*\n {2}- \*\*Invoices\*\* `\/invoices`: shows Send invoice/,
    );
    expect(frameworkView("permission_matrix", NODES, RECORDS).markdown).toContain(
      "| Send invoice | yes |",
    );
    const model = frameworkView("data_model", NODES, RECORDS).markdown;
    expect(model).toContain(
      "fields: number (text, required), total (money); states: draft -> sent -> paid",
    );
    expect(model).toContain("INVOICE }o--o{ CUSTOMER");
    const stories = frameworkView("user_stories", NODES, RECORDS).markdown;
    expect(stories).toContain("**US-1** As a Freelancer, I want to get paid.");
    expect(stories).toContain("Step 1: Send invoice");
    expect(stories).toContain("Accept: The customer gets an email with a pay link.");
  });

  it("draws the design system by kind and the UX specification per screen and pattern", () => {
    const nodes: GraphNode[] = [
      node({
        id: "screen-invoices",
        type: "screen",
        name: "Invoices",
        path: "/invoices",
        layout: "sidebar 240px wide on the left, top bar 56px high",
        regions: ["sidebar: at 0,0, 240x900px"],
        states: ["empty"],
        viewport: "1440x900",
      }),
      node({
        id: "design_token-primary",
        type: "design_token",
        name: "Primary",
        category: "color",
        value: "#4f46e5",
        usage: "fill of the main buttons",
        links: { appears_on: ["screen-invoices"] },
      }),
      node({
        id: "design_token-body-text",
        type: "design_token",
        name: "Body text",
        category: "typography",
        value: "14px/20px Inter 400",
      }),
      node({
        id: "ux_pattern-button",
        type: "ux_pattern",
        name: "Button",
        kind: "component",
        anatomy: "height 32px, corners 6px",
        variants: ["most common: background #4f46e5"],
        states: ["default", "disabled: opacity 0.5"],
        links: { appears_on: ["screen-invoices"] },
      }),
    ];
    const design = frameworkView("design_system", nodes, []);
    expect(design.count).toBe(2);
    expect(design.markdown).toContain(
      "| Primary | `#4f46e5` | fill of the main buttons | Invoices | documented | [design_token-primary] |",
    );
    expect(design.markdown.indexOf("**Color**")).toBeLessThan(
      design.markdown.indexOf("**Typography**"),
    );
    expect(design.markdown).toMatch(/Not measured yet: Spacing, Radius/);
    const ux = frameworkView("ux_spec", nodes, []).markdown;
    expect(ux).toContain("- **Invoices** (`/invoices`, seen at 1440x900) [screen-invoices]");
    expect(ux).toContain("  - Layout: sidebar 240px wide on the left, top bar 56px high");
    expect(ux).toContain("  - Components: Button");
    expect(ux).toContain("  - States: empty");
    expect(ux).toContain("**Component patterns**");
    expect(ux).toContain("  - States: default, disabled: opacity 0.5");
    expect(ux).toContain("  - Appears on: Invoices");
  });
});
