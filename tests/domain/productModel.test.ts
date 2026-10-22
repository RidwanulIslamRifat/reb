import { describe, expect, it } from "vitest";
import { screenDetail } from "../../src/domain/capture.js";
import {
  attributeType,
  featureModelNotes,
  inferProductModel,
  plural,
  singular,
} from "../../src/domain/productModel.js";
import { crmScreens } from "./crmScreens.js";

const model = () => inferProductModel(crmScreens());

describe("screen detail (what reb keeps from a screen's deeper parts)", () => {
  it("keeps kind columns and product choices, but not people's names or long lists", () => {
    const detail = screenDetail({
      url: "",
      title: "",
      headings: [],
      links: [],
      buttons: [],
      fields: [],
      columns: [],
      form_fields: [
        {
          label: "Lead status",
          kind: "select",
          required: false,
          options: ["Select...", "New", "Open"],
        },
        {
          label: "Contact owner",
          kind: "select",
          required: false,
          options: ["Jane Roe", "John Doe"],
        },
        { label: "Email", kind: "email", required: true, options: [] },
      ],
      values: [
        { column: "Status", values: ["Paid", "Sent", "Paid"] },
        { column: "Client", values: ["Acme", "Globex"] },
        { column: "Type", values: Array.from({ length: 20 }, (_, i) => `Kind ${i}`) },
        { column: "Stage", values: ["$1,200", "jane@acme.com"] },
      ],
    });
    expect(detail.form_fields).toEqual([
      { label: "Lead status", kind: "select", required: false, options: ["New", "Open"] },
      { label: "Contact owner", kind: "select", required: false, options: [] },
      { label: "Email", kind: "email", required: true, options: [] },
    ]);
    expect(detail.values).toEqual([{ column: "Status", values: ["Paid", "Sent"] }]);
    expect(detail.charts).toBe(0);
  });
});

describe("feature model (inferred from captured screens)", () => {
  it("knows simple English plurals", () => {
    expect(singular("companies")).toBe("company");
    expect(singular("deals")).toBe("deal");
    expect(singular("statuses")).toBe("status");
    expect(plural("company")).toBe("companies");
    expect(plural("deal")).toBe("deals");
  });

  it("types attributes from input kinds, names and other entities", () => {
    const keys = new Set(["company"]);
    expect(attributeType("Email", "", [], keys).type).toBe("email");
    expect(attributeType("Amount", "", [], keys).type).toBe("money");
    expect(attributeType("Close date", "", [], keys).type).toBe("date");
    expect(attributeType("Deal stage", "select", ["A", "B"], keys).type).toBe("state");
    expect(attributeType("Contact owner", "select", [], keys).type).toBe("user");
    expect(attributeType("Company", "", [], keys)).toEqual({
      type: "reference",
      refers_to: "company",
    });
    expect(attributeType("Associated company", "", [], keys).refers_to).toBe("company");
    expect(attributeType("Notes", "textarea", [], keys).type).toBe("long text");
    expect(attributeType("Industry", "select", ["Retail"], keys).type).toBe("choice");
  });

  it("finds the entities with their attributes, states and relations", () => {
    const m = model();
    expect(m.entities.map((e) => e.name)).toEqual(["Contact", "Company", "Deal", "User"]);
    const contact = m.entities.find((e) => e.name === "Contact")!;
    expect(contact.attributes.find((a) => a.name === "Email")).toMatchObject({
      type: "email",
      required: true,
    });
    expect(contact.attributes.find((a) => a.name === "Company")).toMatchObject({
      type: "reference",
      refers_to: "company",
    });
    expect(contact.states).toEqual(["New", "Open", "In progress", "Unqualified"]);
    expect(contact.relations).toEqual(
      expect.arrayContaining([
        { to: "company", kind: "belongs_to", via: "Company" },
        { to: "user", kind: "belongs_to", via: "Contact owner" },
        { to: "deal", kind: "has_many", via: '"Deals" section on the Contact page' },
      ]),
    );
    expect(contact.operations).toEqual(
      expect.arrayContaining([
        "list",
        "view",
        "create",
        "edit",
        "delete",
        "search",
        "filter",
        "import",
        "export",
        "bulk",
      ]),
    );
    const deal = m.entities.find((e) => e.name === "Deal")!;
    expect(deal.states.at(-1)).toBe("Closed lost");
    // User is implied by owner fields and the team screen; the person's names are never attributes.
    const user = m.entities.find((e) => e.name === "User")!;
    expect(user.implied).toBe(true);
    expect(user.attributes.map((a) => a.name)).toEqual(["Name", "Email", "Role", "Last active"]);
  });

  it("finds modules, features of every kind, and how data is reused", () => {
    const m = model();
    expect(m.modules.map((x) => x.name)).toEqual([
      "Contacts",
      "Companies",
      "Deals",
      "Reports",
      "Workflows",
      "Settings",
    ]);
    const kinds = Object.fromEntries(m.features.map((f) => [f.name, f.kind]));
    expect(kinds).toMatchObject({
      "Contact management": "record_management",
      "Deal pipeline": "workflow",
      "Sales dashboard": "analytics",
      Workflows: "automation",
      "Team and user management": "user_management",
      "Custom fields and data model settings": "customization",
      Integrations: "integrations",
    });
    const company = m.features.find((f) => f.name === "Company management")!;
    expect(company.data_use.join(" ")).toContain(
      "Other records point to it: Contact (Company), Deal (Company)",
    );
    const pipeline = m.features.find((f) => f.name === "Deal pipeline")!;
    expect(pipeline.logic.join(" ")).toContain("Closed won, Closed lost are likely end states");
    const dashboard = m.features.find((f) => f.name === "Sales dashboard")!;
    expect(dashboard.entities).toEqual(["data_object-deal"]);
    for (const f of m.features) {
      expect(f.logic.length + f.questions.length, f.name).toBeGreaterThan(0);
    }
    expect(m.screen_features["screen-contacts"]).toEqual(
      expect.arrayContaining(["feature-contact-management", "feature-contact-lifecycle"]),
    );
  });

  it("finds rules, roles and non-functional requirements", () => {
    const m = model();
    const rules = Object.fromEntries(m.rules.map((r) => [r.name, r.kind]));
    expect(rules).toMatchObject({
      "Contact required fields": "validation",
      "Deal stage flow": "workflow",
      "Users & Teams usage limit": "limit",
      "Access depends on the user's role": "permission",
    });
    expect(m.roles.map((r) => r.name)).toEqual(["Super Admin", "Sales Rep", "Viewer"]);
    const nfr = Object.fromEntries(m.nfrs.map((n) => [n.name, `${n.category} ${n.basis}`]));
    expect(nfr).toMatchObject({
      "Fast lists at scale": "performance seen",
      "Account isolation and plan limits": "scalability seen",
      "Role-based access": "security seen",
      "Personal data protection": "privacy seen",
      "Configurable data model": "configurability seen",
      "Public API, webhooks and connectors": "interoperability seen",
      "Accessible interface": "accessibility baseline",
    });
    expect(new Set(m.nfrs.map((n) => n.id)).size).toBe(m.nfrs.length);
  });

  it("writes the feature model as notes, citing the screenshots", () => {
    const screens = crmScreens();
    const md = featureModelNotes({
      product: "Acme CRM",
      session: "session-01",
      model: inferProductModel(screens),
      screens,
      evidence: { "screen-deals": "E-005" },
    });
    for (const heading of [
      "## Modules and features",
      "## Data model",
      "## Features in depth",
      "## Business rules",
      "## Roles",
      "## Non-functional requirements",
    ]) {
      expect(md).toContain(heading);
    }
    expect(md).toContain("erDiagram");
    expect(md).toContain("### Deal pipeline [feature-deal-pipeline]");
    expect(md).toContain("[E-005]");
    expect(md).toContain("- [ ] Can a deal skip states or move backwards?");
    expect(md).not.toContain("Jane Roe |"); // a record's name never becomes a feature
  });

  it("returns an empty model for no screens", () => {
    const m = inferProductModel([]);
    expect(m.entities).toEqual([]);
    expect(m.features).toEqual([]);
    expect(m.nfrs.every((n) => n.basis === "baseline")).toBe(true);
  });
});
