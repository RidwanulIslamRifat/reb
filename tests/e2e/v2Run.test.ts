import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildProgram } from "../../src/adapters/cli/program.js";
import { readJsonLines } from "../../src/storage/jsonl.js";
import { tempDir } from "../helpers.js";

/**
 * v2 end-to-end test: a business-depth analysis of a made-up invoicing and payments company
 * (Ledgerly, ledgerly.example) through reb's own commands only: a fintech plan with the
 * due_diligence, risk, strategy and rebuild reports, typed nodes for the business model, condition,
 * risks, strategy and product spec, a document the business "provided", framework views, the four
 * audit-grade reports with Word and HTML copies, and a comparison with a competitor's run.
 * Nothing touches the internet; every source is recorded with a fixed fingerprint.
 *
 * Set REB_E2E_KEEP_V2=<folder> to keep a copy of the finished run (this is how examples/ was made).
 */

const SHA = "0".repeat(64);

type Row = [type: string, name: string, fields?: string[], label?: string];

// What the research "found". Ids are <type>-<name in kebab case>; every node gets one evidence record.
const NODES: Row[] = [
  ["company", "Ledgerly Labs"],
  ["product", "Ledgerly"],
  ["module", "Invoicing"],
  ["module", "Payments"],
  ["feature", "Send invoice", ["acceptance=The customer gets an email with a pay link"]],
  ["feature", "Recurring invoices"],
  ["feature", "Payment reminders"],
  ["feature", "Card payments"],
  ["feature", "Bank reconciliation"],
  ["pricing_tier", "Free"],
  ["pricing_tier", "Pro"],
  ["integration", "Xero"],
  ["persona", "Freelancer"],
  ["journey", "Get paid"],
  ["journey", "Chase a late invoice"],
  ["market_segment", "Freelancers and small agencies"],
  ["competitor", "Billbird"],
  ["competitor", "Paypad"],
  ["value_proposition", "Get paid in one click"],
  ["value_proposition", "No more chasing late payers"],
  ["revenue_stream", "Pro subscription", ["model=subscription"]],
  ["revenue_stream", "Card payment fees", ["model=transaction_fee"]],
  ["channel", "Self-serve sign-up", ["kind=self_serve"]],
  ["cost_driver", "Payment processing", [], "inferred"],
  ["partner", "Example Bank"],
  ["customer", "Example Studio"],
  ["metric", "Customers mid 2026", ["kind=customers", "value=4000", "as_of=2026-06"]],
  ["metric", "Employees mid 2026", ["kind=employees", "value=35", "as_of=2026-06"]],
  ["metric", "Invoicing software market", ["kind=tam", "value=12B", "unit=USD", "as_of=2026"]],
  ["funding_round", "Seed round", ["date=2025-03", "stage=Seed", "amount=USD 3M"]],
  ["leader", "Test Founder", ["title=CEO and co-founder"]],
  ["signal", "Hiring engineers", ["kind=hiring", "date=2026-08", "direction=positive"]],
  ["signal", "Card payments launch", ["kind=launch", "date=2026-05", "direction=positive"]],
  ["geography", "European Union"],
  ["compliance", "PSD2", ["kind=regulation", "status=applies"]],
  ["compliance", "GDPR", ["kind=regulation", "status=claimed"]],
  ["trend", "E-invoicing mandates", ["pestle=legal", "direction=tailwind"]],
  ["trend", "Higher interest rates", ["pestle=economic", "direction=headwind"]],
  ["trend", "AI bookkeeping", ["pestle=technological", "direction=tailwind"]],
  ["force", "Many invoicing apps", ["force=rivalry", "strength=high"], "inferred"],
  ["force", "Easy switching", ["force=buyer_power", "strength=medium"], "inferred"],
  ["force", "Spreadsheets and bank apps", ["force=substitutes", "strength=medium"], "inferred"],
  [
    "risk",
    "One payment processor",
    ["category=dependency", "likelihood=medium", "impact=high", "mitigation=None public"],
    "inferred",
  ],
  [
    "risk",
    "Payment regulation changes",
    [
      "category=regulatory",
      "likelihood=medium",
      "impact=medium",
      "mitigation=Legal page names a compliance lead",
    ],
    "inferred",
  ],
  [
    "risk",
    "Price war with bigger rivals",
    [
      "category=competitive",
      "likelihood=high",
      "impact=medium",
      "mitigation=Free plan and niche focus",
    ],
    "inferred",
  ],
  [
    "risk",
    "Small-business churn",
    ["category=market", "likelihood=medium", "impact=low", "mitigation=Annual plans"],
    "inferred",
  ],
  [
    "risk",
    "Card data breach",
    [
      "category=security",
      "likelihood=low",
      "impact=high",
      "mitigation=Card data stays with the processor",
    ],
    "inferred",
  ],
  [
    "finding",
    "Fast onboarding",
    ["rating=high", "area=product", "swot=strength", "recommendation=Keep the three-step setup"],
    "inferred",
  ],
  [
    "finding",
    "No public API",
    ["rating=medium", "area=technology", "swot=weakness", "recommendation=Publish a read-only API"],
    "inferred",
  ],
  [
    "finding",
    "E-invoicing creates demand",
    [
      "rating=high",
      "area=market",
      "swot=opportunity",
      "recommendation=Ship e-invoice formats early",
    ],
    "inferred",
  ],
  [
    "finding",
    "Dependence on one processor",
    ["rating=high", "area=operations", "swot=threat", "recommendation=Add a second processor"],
    "inferred",
  ],
  [
    "finding",
    "Small team for a regulated product",
    [
      "rating=medium",
      "area=people",
      "swot=weakness",
      "recommendation=Hire a compliance specialist",
    ],
    "inferred",
  ],
  [
    "finding",
    "Healthy growth signals",
    ["rating=medium", "area=finance", "swot=strength", "recommendation=Publish growth figures"],
    "inferred",
  ],
  ["technology", "React", ["category=frontend"]],
  ["technology", "PostgreSQL", ["category=database"], "inferred"],
  ["technology", "Stripe", ["category=payments"]],
  ["screen", "Dashboard", ["path=/"]],
  ["screen", "Invoices", ["path=/invoices"]],
  ["screen", "New invoice", ["path=/invoices/new"]],
  ["screen", "Clients", ["path=/clients"]],
  ["screen", "Billing settings", ["path=/settings/billing"]],
  ["user_role", "Owner"],
  ["user_role", "Accountant"],
  ["business_rule", "Five invoices a month on Free", ["kind=limit"]],
  ["business_rule", "Invoice numbers never repeat", ["kind=validation"]],
  ["business_rule", "Reminders after 7 days", ["kind=workflow"]],
  ["data_object", "Invoice", ["states=draft,sent,paid"]],
  ["data_object", "Client"],
  ["data_object", "Payment"],
  ["api_endpoint", "List invoices", ["method=GET", "path=/v1/invoices"]],
  ["hypothesis", "Invoices and payments live in one database", [], "inferred"],
  ["design_token", "Primary", ["category=color", "value=#4F46E5", "usage=main buttons and links"]],
  ["design_token", "Page background", ["category=color", "value=#FFFFFF"]],
  ["design_token", "Body text", ["category=typography", "value=14px/20px Inter 400"]],
  ["design_token", "Base spacing", ["category=spacing", "value=8px"]],
  ["design_token", "Corner radius", ["category=radius", "value=6px"]],
  [
    "ux_pattern",
    "Primary button",
    ["kind=component", "anatomy=height 32px with 6px corners", "states=default,hover,disabled"],
  ],
  ["ux_pattern", "Invoice table", ["kind=component", "states=default,empty"]],
  ["ux_pattern", "Sidebar layout", ["kind=layout", "anatomy=fixed left sidebar 240px wide"]],
];

const LINKS: Array<[string, string, string]> = [
  ["company-ledgerly-labs", "makes", "product-ledgerly"],
  ["product-ledgerly", "has", "module-invoicing"],
  ["product-ledgerly", "has", "module-payments"],
  ["module-invoicing", "has", "feature-send-invoice"],
  ["module-invoicing", "has", "feature-recurring-invoices"],
  ["module-invoicing", "has", "feature-payment-reminders"],
  ["module-payments", "has", "feature-card-payments"],
  ["module-payments", "has", "feature-bank-reconciliation"],
  ["feature-send-invoice", "gated_by", "pricing_tier-free"],
  ["feature-recurring-invoices", "gated_by", "pricing_tier-pro"],
  ["feature-payment-reminders", "gated_by", "pricing_tier-free"],
  ["feature-card-payments", "gated_by", "pricing_tier-free"],
  ["feature-bank-reconciliation", "gated_by", "pricing_tier-pro"],
  ["feature-bank-reconciliation", "connects_to", "integration-xero"],
  ["persona-freelancer", "does", "journey-get-paid"],
  ["persona-freelancer", "does", "journey-chase-a-late-invoice"],
  ["persona-freelancer", "belongs_to", "market_segment-freelancers-and-small-agencies"],
  ["journey-get-paid", "uses", "feature-send-invoice"],
  ["journey-get-paid", "uses", "feature-card-payments"],
  ["journey-chase-a-late-invoice", "uses", "feature-payment-reminders"],
  ["competitor-billbird", "also_offers", "feature-send-invoice"],
  ["competitor-billbird", "competes_in", "market_segment-freelancers-and-small-agencies"],
  ["competitor-paypad", "competes_in", "market_segment-freelancers-and-small-agencies"],
  ["product-ledgerly", "delivers", "value_proposition-get-paid-in-one-click"],
  ["product-ledgerly", "delivers", "value_proposition-no-more-chasing-late-payers"],
  ["value_proposition-get-paid-in-one-click", "serves", "persona-freelancer"],
  ["company-ledgerly-labs", "earns", "revenue_stream-pro-subscription"],
  ["company-ledgerly-labs", "earns", "revenue_stream-card-payment-fees"],
  ["company-ledgerly-labs", "sells_through", "channel-self-serve-sign-up"],
  ["company-ledgerly-labs", "incurs", "cost_driver-payment-processing"],
  ["company-ledgerly-labs", "partners_with", "partner-example-bank"],
  ["customer-example-studio", "buys", "product-ledgerly"],
  ["metric-customers-mid-2026", "measures", "product-ledgerly"],
  ["metric-employees-mid-2026", "measures", "company-ledgerly-labs"],
  ["company-ledgerly-labs", "raised", "funding_round-seed-round"],
  ["leader-test-founder", "leads", "company-ledgerly-labs"],
  ["signal-hiring-engineers", "affects", "company-ledgerly-labs"],
  ["company-ledgerly-labs", "operates_in", "geography-european-union"],
  ["company-ledgerly-labs", "complies_with", "compliance-psd2"],
  ["company-ledgerly-labs", "complies_with", "compliance-gdpr"],
  ["trend-e-invoicing-mandates", "affects", "product-ledgerly"],
  ["force-many-invoicing-apps", "affects", "company-ledgerly-labs"],
  ["risk-one-payment-processor", "threatens", "feature-card-payments"],
  ["risk-card-data-breach", "threatens", "product-ledgerly"],
  ["finding-fast-onboarding", "concerns", "product-ledgerly"],
  ["technology-react", "powers", "product-ledgerly"],
  ["technology-stripe", "powers", "feature-card-payments"],
  ["screen-dashboard", "navigates_to", "screen-invoices"],
  ["screen-dashboard", "navigates_to", "screen-clients"],
  ["screen-invoices", "navigates_to", "screen-new-invoice"],
  ["screen-invoices", "shows", "feature-send-invoice"],
  ["screen-billing-settings", "shows", "data_object-payment"],
  ["user_role-owner", "can", "feature-card-payments"],
  ["user_role-owner", "can", "screen-billing-settings"],
  ["user_role-accountant", "can", "feature-bank-reconciliation"],
  ["business_rule-five-invoices-a-month-on-free", "governs", "pricing_tier-free"],
  ["business_rule-invoice-numbers-never-repeat", "governs", "data_object-invoice"],
  ["business_rule-reminders-after-7-days", "governs", "feature-payment-reminders"],
  ["data_object-invoice", "relates_to", "data_object-client"],
  ["data_object-payment", "relates_to", "data_object-invoice"],
  ["product-ledgerly", "exposes", "api_endpoint-list-invoices"],
  ["api_endpoint-list-invoices", "reads_writes", "data_object-invoice"],
  ["feature-send-invoice", "reads_writes", "data_object-invoice"],
  ["hypothesis-invoices-and-payments-live-in-one-database", "explains", "data_object-payment"],
  ["ux_pattern-invoice-table", "appears_on", "screen-invoices"],
  ["design_token-primary", "appears_on", "screen-invoices"],
];

const DD_DRAFT = `## Executive summary

Ledgerly is a small, growing invoicing and payments company for freelancers in the EU
[company-ledgerly-labs, metric-customers-mid-2026]. Its strengths are fast onboarding and clear
growth signals [finding-fast-onboarding, signal-hiring-engineers]; its biggest risk is depending on
one payment processor [risk-one-payment-processor].

## Key findings and recommendations

The most urgent step is a second payment processor [finding-dependence-on-one-processor].
`;

const kebab = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

async function cli(home: string, ...args: string[]): Promise<string> {
  let output = "";
  const program = buildProgram({ out: (text) => (output += text), env: { REB_HOME: home } })
    .exitOverride()
    .configureOutput({
      writeOut: (text) => (output += text),
      writeErr: (text) => (output += text),
      getOutHelpWidth: () => 200,
    });
  await program.parseAsync(args, { from: "user" });
  return output;
}

describe("end to end (v2): a business-depth analysis with audit-grade reports", () => {
  it("plans, records typed nodes, imports a provided document, renders four reports and compares", async () => {
    const home = await tempDir();
    const reb = (...args: string[]) => cli(home, ...args);
    const runOf = async (prefix: string) =>
      (await readdir(home)).find((name) => name.startsWith(prefix))!;

    // 1. A fintech run asking for the four v2 reports, and its plan.
    await reb(
      "new",
      "ledgerly.example",
      "--category",
      "fintech",
      "--reports",
      "due_diligence,risk,strategy,rebuild",
    );
    const slug = await runOf("ledgerly-example-");
    const dir = join(home, slug);
    const r = ["--run", slug];
    const brief = (await readFile(join(dir, "brief.md"), "utf8"))
      .replace('plan_tier: ""', 'plan_tier: "Free"')
      .replace(/focus_questions: \[\]/, 'focus_questions: ["What are the biggest risks?"]')
      .replace(
        /\n# Brief\n[\s\S]*$/,
        "\n# Brief\n\nMade-up sample business for the reb examples.\n",
      );
    await writeFile(join(dir, "brief.md"), brief);
    expect(await reb("plan", "create", ...r)).toContain("Created plan v1 from pipeline fintech.");
    const plan = JSON.parse(await readFile(join(dir, "plan", "plan.json"), "utf8")) as {
      tasks: Array<{ id: string; role: string }>;
    };
    const roleOf = (id: string) => plan.tasks.find((t) => t.id === id)?.role;
    expect(roleOf("condition")).toBe("financial_analyst");
    expect(roleOf("risks")).toBe("risk_analyst");
    expect(roleOf("findings")).toBe("strategy_analyst");
    expect(roleOf("product-spec")).toBe("feature_analyst");
    expect(roleOf("focus-1")).toBe("risk_analyst");
    expect(plan.tasks.map((t) => t.id)).toContain("report-due_diligence");

    // 2. Sources, typed nodes with one evidence record each, and links.
    for (const [url, title] of [
      ["https://ledgerly.example", "Ledgerly home page"],
      ["https://ledgerly.example/pricing", "Ledgerly pricing"],
      ["https://ledgerly.example/legal", "Ledgerly legal and compliance"],
    ]) {
      await reb(
        "evidence",
        "source",
        url!,
        "--title",
        title!,
        "--publisher",
        "Ledgerly Labs",
        "--published",
        "2026-09-01",
        "--sha256",
        SHA,
        ...r,
      );
    }
    for (const [type, name, fields = [], label = "documented"] of NODES) {
      const id = `${type}-${kebab(name)}`;
      const out = await reb(
        "kb",
        "add",
        type,
        name,
        "--label",
        label,
        ...fields.flatMap((f) => ["--field", f]),
        ...r,
      );
      expect(out, id).toContain(`node ${id}`);
      expect(out, id).not.toContain("Note:");
      const evidence = await reb(
        "evidence",
        "add",
        `${name}: as read on the public pages.`,
        "--subject",
        id,
        "--role",
        "desk_researcher",
        "--source",
        type === "compliance" || type === "risk" ? "S-003" : "S-001",
        "--confidence",
        label,
        "--operation",
        label === "inferred" ? "reasoning" : "read_public_page",
        ...r,
      );
      await reb("kb", "link", id, "evidence", /Recorded (E-\d+)/.exec(evidence)![1]!, ...r);
    }
    for (const [from, type, to] of LINKS) await reb("kb", "link", from, type, to, ...r);
    expect(await reb("kb", "validate", ...r)).toMatch(/no problems/i);

    // 3. A document the business handed over becomes "provided" evidence.
    await mkdir(join(dir, "evidence", "inbox", "provided"), { recursive: true });
    await writeFile(join(dir, "evidence", "inbox", "provided", "pitch-deck.pdf"), "%PDF-1.4 fake");
    expect(await reb("evidence", "import", "provided", ...r)).toMatch(/1 document/);
    const ledger = (await readJsonLines(join(dir, "evidence", "ledger.jsonl"))) as Array<{
      confidence?: string;
      finding?: string;
    }>;
    expect(
      ledger.some((e) => e.confidence === "provided" && e.finding?.includes("pitch-deck.pdf")),
    ).toBe(true);

    // 4. Framework views from the graph.
    const register = await reb("kb", "framework", "risk_register", ...r);
    expect(register).toMatch(/\| R1 \| One payment processor \|/);
    const swot = await reb("kb", "framework", "swot", ...r);
    expect(swot.split("**Threats**")[1]).toContain("Dependence on one processor");

    // 5. With the focus question answered, the audit finds no gaps for the four reports.
    await writeFile(
      join(dir, "notes", "focus-1.md"),
      "The biggest risks are one payment processor and a price war " +
        "[risk-one-payment-processor, risk-price-war-with-bigger-rivals].\n",
    );
    expect(await reb("audit", ...r)).toContain("Audit 1: 0 gaps");

    // 6. The four reports, with Word and HTML copies of the due diligence report.
    await writeFile(join(dir, "notes", "report-due_diligence.md"), DD_DRAFT);
    const dd = await reb("report", "due_diligence", "--docx", "--html", ...r);
    expect(dd).toMatch(/Overall confidence: (High|Medium|Low) \(\d+ of 100\)/);
    expect(dd).toContain("due_diligence.html");
    const text = await readFile(join(dir, "reports", "due_diligence.md"), "utf8");
    expect(text.split("\n").filter((l) => l.startsWith("## "))).toEqual([
      "## Report details",
      "## Executive summary",
      "## Scope and methodology",
      "## Key findings and recommendations",
      "## Company and leadership",
      "## Business model",
      "## Traction and financial condition",
      "## Market and competition",
      "## Risks and compliance",
      "## Technology and operations",
      "## Limitations and disclaimer",
      "## Sources",
      "## Open questions",
    ]);
    expect(text).toContain("### Risk register");
    expect(text).toContain("### Business model canvas");
    expect(text).toContain("It is not an audit opinion, legal advice or investment advice.");
    expect(text).toContain("pitch-deck.pdf");
    const html = await readFile(join(dir, "reports", "due_diligence.html"), "utf8");
    expect(html).toContain('<section class="cover">');
    expect(
      (await readFile(join(dir, "reports", "due_diligence.docx"))).subarray(0, 2).toString(),
    ).toBe("PK");
    for (const report of ["risk", "strategy", "rebuild"]) {
      expect(await reb("report", report, ...r)).toMatch(/Overall confidence/);
    }
    const rebuild = await readFile(join(dir, "reports", "rebuild.md"), "utf8");
    expect(rebuild).toContain("`/settings/billing`");
    expect(rebuild).toContain("INVOICE }o--o{ CLIENT");
    expect(rebuild).toContain("As a Freelancer, I want to get paid.");
    expect(rebuild).toContain("`#4F46E5`");
    expect(rebuild).toMatch(/Invoice table.*\n(.*\n)*.*Appears on: Invoices/);
    const strategy = await readFile(join(dir, "reports", "strategy.md"), "utf8");
    expect(strategy).toContain("Overall competitive pressure");

    // 7. A competitor's run, compared with this one.
    await reb("new", "billbird.example", "--category", "fintech", "--reports", "risk");
    const rival = await runOf("billbird-example-");
    for (const [type, name] of [
      ["product", "Billbird"],
      ["feature", "Send invoice"],
      ["feature", "Time tracking"],
    ]) {
      await reb("kb", "add", type!, name!, "--label", "documented", "--run", rival);
    }
    const compared = await reb("compare", rival, ...r);
    expect(compared).toMatch(/Different products: \d+ nodes only in ledgerly/);
    const comparison = await readFile(join(dir, "reports", `compare-${rival}.md`), "utf8");
    expect(comparison).toContain("Time tracking [feature-time-tracking]");

    // Every step is in the activity log, and none failed.
    const events = (await readJsonLines(join(dir, "logs", "events.jsonl"))) as Array<{
      tool: string;
      ok: boolean;
    }>;
    expect(events.filter((e) => !e.ok)).toEqual([]);
    for (const tool of ["import_inbox", "get_framework", "render_report", "compare_runs"]) {
      expect(events.map((e) => e.tool)).toContain(tool);
    }

    if (process.env.REB_E2E_KEEP_V2) {
      await cp(dir, process.env.REB_E2E_KEEP_V2, { recursive: true });
    }
  }, 30_000);
});
