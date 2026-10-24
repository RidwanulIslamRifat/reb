import type { NodeType } from "./links.js";
import { NFR_CATEGORIES } from "./productModel.js";

/**
 * Typed front-matter fields (SPEC 6.3, v2). Some node types carry extra fields that frameworks
 * (risk register, SWOT, PESTLE ...) and reports read. Fields are plain front-matter keys next to
 * id, type, name and label; validate_graph reports missing required fields and unknown values.
 */
export type FieldKind = "text" | "enum" | "date" | "list" | "fields";

export interface FieldSpec {
  name: string;
  kind: FieldKind;
  required: boolean;
  /** Allowed values, for kind "enum". */
  values?: readonly string[];
  about: string;
}

export const LEVELS = ["low", "medium", "high"] as const;
export type Level = (typeof LEVELS)[number];

export const SWOT = ["strength", "weakness", "opportunity", "threat"] as const;
export const PESTLE = [
  "political",
  "economic",
  "social",
  "technological",
  "legal",
  "environmental",
] as const;
export const FORCES = [
  "rivalry",
  "new_entrants",
  "substitutes",
  "buyer_power",
  "supplier_power",
] as const;
export const RISK_CATEGORIES = [
  "market",
  "competitive",
  "product",
  "technology",
  "security",
  "regulatory",
  "financial",
  "operational",
  "dependency",
  "reputational",
  "people",
] as const;
export const FINDING_AREAS = [
  "strategy",
  "product",
  "market",
  "customers",
  "finance",
  "technology",
  "operations",
  "compliance",
  "people",
] as const;
export const METRIC_KINDS = [
  "revenue",
  "recurring_revenue",
  "customers",
  "users",
  "employees",
  "growth_rate",
  "valuation",
  "funding_total",
  "tam",
  "sam",
  "som",
  "other",
] as const;
export const SIGNAL_KINDS = [
  "hiring",
  "launch",
  "expansion",
  "funding",
  "partnership",
  "acquisition",
  "leadership_change",
  "pricing_change",
  "layoff",
  "outage",
  "other",
] as const;
export const TECH_CATEGORIES = [
  "frontend",
  "backend",
  "database",
  "hosting",
  "cdn",
  "analytics",
  "payments",
  "auth",
  "email",
  "monitoring",
  "ai",
  "other",
] as const;
export const REVENUE_MODELS = [
  "subscription",
  "usage",
  "transaction_fee",
  "license",
  "services",
  "advertising",
  "commission",
  "product_sales",
  "other",
] as const;
export const CHANNEL_KINDS = [
  "self_serve",
  "direct_sales",
  "partner",
  "marketplace",
  "content",
  "community",
  "paid_ads",
  "referral",
  "retail",
  "other",
] as const;
export const COMPLIANCE_KINDS = ["regulation", "certification", "standard", "policy"] as const;
export const TOKEN_CATEGORIES = [
  "color",
  "typography",
  "spacing",
  "radius",
  "shadow",
  "size",
  "breakpoint",
  "motion",
] as const;
export const PATTERN_KINDS = [
  "component",
  "layout",
  "navigation",
  "interaction",
  "feedback",
  "state",
] as const;
export const RULE_KINDS = [
  "limit",
  "validation",
  "permission",
  "workflow",
  "billing",
  "retention",
  "other",
] as const;
export const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
export const PRIORITIES = ["must", "should", "could"] as const;
export const REQUIREMENT_KINDS = ["functional", "non_functional"] as const;

const enumField = (
  name: string,
  values: readonly string[],
  about: string,
  required = true,
): FieldSpec => ({ name, kind: "enum", values, required, about });
const text = (name: string, about: string, required = false): FieldSpec => ({
  name,
  kind: "text",
  required,
  about,
});

const list = (name: string, about: string, required = false): FieldSpec => ({
  name,
  kind: "list",
  required,
  about,
});

/** The typed fields of each node type that has any. */
export const TYPE_FIELDS: Partial<Record<NodeType, FieldSpec[]>> = {
  feature: [
    {
      name: "acceptance",
      kind: "list",
      required: false,
      about: "Acceptance criteria a rebuilt feature must meet, one sentence each.",
    },
    {
      name: "logic",
      kind: "list",
      required: false,
      about:
        "How the feature probably works behind the screen (calculations, triggers, states), one sentence each.",
    },
    {
      name: "data_use",
      kind: "list",
      required: false,
      about:
        "How the feature's data is reused elsewhere (reports, other records, automation), one sentence each.",
    },
    enumField(
      "priority",
      PRIORITIES,
      "MoSCoW priority for a rebuild: must, should or could.",
      false,
    ),
  ],
  data_object: [
    {
      name: "fields",
      kind: "fields",
      required: false,
      about: "The fields it holds: a list of { name, type, required } (type in plain words).",
    },
    {
      name: "states",
      kind: "list",
      required: false,
      about: "The states it moves through, in order, for example [draft, sent, paid].",
    },
  ],
  revenue_stream: [enumField("model", REVENUE_MODELS, "How the money is charged.")],
  channel: [enumField("kind", CHANNEL_KINDS, "How customers are reached.")],
  metric: [
    enumField("kind", METRIC_KINDS, "What is measured (tam, sam and som are market sizes)."),
    text("value", "The number as stated, for example 120 or 4.5M.", true),
    text("unit", "The unit, for example USD, customers, % per year."),
    { name: "as_of", kind: "date", required: true, about: "When the number was true." },
  ],
  funding_round: [
    { name: "date", kind: "date", required: true, about: "When the round was announced." },
    text("stage", "For example Seed, Series A."),
    text("amount", "As stated, with currency, for example USD 12M."),
    { name: "investors", kind: "list", required: false, about: "Lead and other investors." },
  ],
  leader: [text("title", "Their public role, for example CEO or co-founder.", true)],
  signal: [
    enumField("kind", SIGNAL_KINDS, "What happened."),
    { name: "date", kind: "date", required: true, about: "When it happened or was announced." },
    enumField(
      "direction",
      ["positive", "negative", "neutral"],
      "What it says about growth.",
      false,
    ),
  ],
  compliance: [
    enumField("kind", COMPLIANCE_KINDS, "A law that applies, or a certification or standard."),
    enumField(
      "status",
      ["certified", "claimed", "applies", "unknown"],
      "certified: a certificate is public; claimed: the company says so; applies: the law applies.",
      false,
    ),
  ],
  technology: [enumField("category", TECH_CATEGORIES, "What part of the stack it is.")],
  finding: [
    enumField("rating", LEVELS, "How much it matters: high, medium or low."),
    enumField("area", FINDING_AREAS, "Which part of the business it is about."),
    enumField("swot", SWOT, "Where it sits in a SWOT analysis.", false),
    text("recommendation", "What the business (or a buyer, investor or builder) should do."),
  ],
  risk: [
    enumField("category", RISK_CATEGORIES, "What kind of risk."),
    enumField("likelihood", LEVELS, "How likely it is: low, medium or high."),
    enumField("impact", LEVELS, "How bad it would be: low, medium or high."),
    text("mitigation", "What reduces it, or what the business already does about it.", true),
  ],
  trend: [
    enumField("pestle", PESTLE, "Which PESTLE factor it is."),
    enumField("direction", ["tailwind", "headwind"], "Whether it helps or hurts the business."),
  ],
  force: [
    enumField("force", FORCES, "Which of Porter's five forces."),
    enumField("strength", LEVELS, "How strong the force is: low, medium or high."),
  ],
  screen: [
    text("path", "Where it is, for example /settings/billing (from normal use)."),
    text(
      "layout",
      "How the screen is laid out, for example: left sidebar 240px, top bar 56px, main area with a table.",
      false,
    ),
    list("regions", "The parts of the screen with their place and size, one per item."),
    list("components", "The components on the screen (ux_pattern names), one per item."),
    list("states", "States seen on the screen: empty, loading, error, selected, disabled ..."),
    text("viewport", "The window size the screen was seen at, for example 1440x900.", false),
  ],
  design_token: [
    enumField("category", TOKEN_CATEGORIES, "What kind of design value."),
    text("value", "The measured value, for example #4F46E5, 14px/20px Inter 500, 8px.", true),
    text("usage", "Where it is used, for example primary buttons and links.", false),
  ],
  ux_pattern: [
    enumField("kind", PATTERN_KINDS, "What kind of pattern: component, layout, navigation ..."),
    text("anatomy", "Its parts and measurements: size, padding, colours, font, corners."),
    list("variants", "Its variants, for example primary, secondary, ghost."),
    list("states", "Its states, for example default, hover, focus, disabled, loading."),
    text("behaviour", "What it does when used, in plain words (from normal use).", false),
  ],
  business_rule: [enumField("kind", RULE_KINDS, "What kind of rule.")],
  requirement: [
    enumField("kind", REQUIREMENT_KINDS, "functional (what it does) or non_functional (how well)."),
    text("statement", "The requirement in one sentence: The system shall ...", true),
    enumField(
      "category",
      NFR_CATEGORIES,
      "For a non-functional requirement: which quality.",
      false,
    ),
    enumField("priority", PRIORITIES, "MoSCoW priority: must, should or could.", false),
  ],
  api_endpoint: [
    enumField("method", HTTP_METHODS, "The HTTP method from the public API docs."),
    text("path", "The path from the public API docs, for example /v1/invoices.", true),
  ],
};

const DATE = /^\d{4}(-\d{2}(-\d{2})?)?$/;

const isEmpty = (v: unknown) =>
  v === undefined || v === null || (typeof v === "string" && v.trim() === "");

/**
 * Problems with one node's typed fields, in plain words: a required field missing, a value not
 * in the allowed list, a date in the wrong shape, or a list that is not a list.
 */
export function fieldProblems(type: NodeType, meta: Record<string, unknown>): string[] {
  const problems: string[] = [];
  for (const f of TYPE_FIELDS[type] ?? []) {
    const value = meta[f.name];
    if (isEmpty(value)) {
      if (f.required) problems.push(`has no ${f.name} (${f.about})`);
      continue;
    }
    switch (f.kind) {
      case "enum":
        if (!f.values!.includes(String(value))) {
          problems.push(`has ${f.name} "${String(value)}"; use one of: ${f.values!.join(", ")}`);
        }
        break;
      case "date":
        if (!DATE.test(String(value))) {
          problems.push(`has ${f.name} "${String(value)}"; use a date like 2026-09-01`);
        }
        break;
      case "list":
        if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) {
          problems.push(`has a ${f.name} that is not a list of text`);
        }
        break;
      case "fields":
        if (
          !Array.isArray(value) ||
          value.some(
            (v) =>
              typeof v !== "object" ||
              v === null ||
              typeof (v as { name?: unknown }).name !== "string",
          )
        ) {
          problems.push(`has ${f.name} that is not a list of { name, type, required }`);
        }
        break;
      case "text":
        if (typeof value !== "string" && typeof value !== "number") {
          problems.push(`has a ${f.name} that is not text`);
        }
        break;
    }
  }
  return problems;
}

/** Number for a low/medium/high level: 1, 2 or 3 (0 when unknown). */
export function levelScore(value: unknown): number {
  const i = LEVELS.indexOf(String(value) as Level);
  return i === -1 ? 0 : i + 1;
}

/** One line per typed field, for tool descriptions and the handbook: "risk: category*, ...". */
export function describeTypeFields(): string {
  return Object.entries(TYPE_FIELDS)
    .map(
      ([type, fields]) =>
        `${type}: ${fields!.map((f) => `${f.name}${f.required ? "*" : ""}`).join(", ")}`,
    )
    .join("; ");
}
