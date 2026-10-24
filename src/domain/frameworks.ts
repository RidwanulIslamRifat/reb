import { z } from "zod";
import type { LedgerRecord } from "./evidence.js";
import { GraphIndex, summaryOf } from "./graphIndex.js";
import type { NodeType } from "./links.js";
import type { GraphNode } from "./node.js";
import {
  FORCES,
  LEVELS,
  levelScore,
  PATTERN_KINDS,
  PESTLE,
  PRIORITIES,
  TECH_CATEGORIES,
  TOKEN_CATEGORIES,
} from "./nodeFields.js";
import { NFR_CATEGORIES } from "./productModel.js";

/**
 * Framework views (SPEC 9, v2): standard business-analysis frameworks drawn from the graph.
 * Each view is Markdown that cites node and E-/S- ids on every line, so it can go straight into a
 * report section (template `views`) or be shown on its own (get_framework, the dashboard).
 */
export const FRAMEWORKS = [
  "swot",
  "pestle",
  "five_forces",
  "business_model_canvas",
  "risk_register",
  "findings",
  "recommendations",
  "metrics",
  "market_size",
  "funding",
  "growth_signals",
  "leadership",
  "compliance",
  "tech_stack",
  "competitor_matrix",
  "sitemap",
  "permission_matrix",
  "data_model",
  "user_stories",
  "business_rules",
  "api",
  "feature_logic",
  "requirements",
  "nfr",
  "design_system",
  "ux_spec",
] as const;
export const FrameworkSchema = z.enum(FRAMEWORKS);
export type Framework = z.infer<typeof FrameworkSchema>;

export const FRAMEWORK_INFO: Record<Framework, { title: string; about: string; uses: NodeType[] }> =
  {
    swot: {
      title: "SWOT analysis",
      about:
        "Strengths, weaknesses, opportunities and threats: findings with a swot field, plus tailwind and headwind trends and the highest risks.",
      uses: ["finding", "trend", "risk"],
    },
    pestle: {
      title: "PESTLE analysis",
      about:
        "Political, economic, social, technological, legal and environmental trends around the business.",
      uses: ["trend"],
    },
    five_forces: {
      title: "Porter's five forces",
      about:
        "Rivalry, threat of new entrants, threat of substitutes, buyer power and supplier power.",
      uses: ["force"],
    },
    business_model_canvas: {
      title: "Business model canvas",
      about: "The nine building blocks of the business model, from the graph.",
      uses: [
        "market_segment",
        "customer",
        "persona",
        "value_proposition",
        "channel",
        "journey",
        "revenue_stream",
        "technology",
        "data_object",
        "module",
        "partner",
        "integration",
        "cost_driver",
      ],
    },
    risk_register: {
      title: "Risk register",
      about:
        "Every risk with its likelihood, impact, score (likelihood x impact, 1 to 9) and mitigation, highest first, and a heat map.",
      uses: ["risk"],
    },
    findings: {
      title: "Key findings",
      about: "Assessed findings with their rating and area, most important first.",
      uses: ["finding"],
    },
    recommendations: {
      title: "Recommendations",
      about: "What to do, from the findings' recommendations, most important first.",
      uses: ["finding"],
    },
    metrics: {
      title: "Key metrics",
      about: "Dated numbers about the business, each with its source.",
      uses: ["metric"],
    },
    market_size: {
      title: "Market size",
      about:
        "Total addressable (TAM), serviceable addressable (SAM) and serviceable obtainable (SOM) market.",
      uses: ["metric"],
    },
    funding: {
      title: "Funding history",
      about: "Funding rounds in date order.",
      uses: ["funding_round"],
    },
    growth_signals: {
      title: "Growth signals",
      about: "Dated events that say whether the business is growing: hiring, launches, expansion.",
      uses: ["signal"],
    },
    leadership: {
      title: "Leadership",
      about: "The people who publicly lead the company, with their roles.",
      uses: ["leader"],
    },
    compliance: {
      title: "Compliance and certifications",
      about: "Laws that apply, and certifications or standards the business claims or holds.",
      uses: ["compliance"],
    },
    tech_stack: {
      title: "Technology stack",
      about: "Technologies the product is built with, by part of the stack.",
      uses: ["technology"],
    },
    competitor_matrix: {
      title: "Competitor feature matrix",
      about: "Which of the product's features each competitor also offers.",
      uses: ["feature", "competitor"],
    },
    sitemap: {
      title: "Screens and navigation",
      about: "The product's screens, how they lead to each other and what each shows.",
      uses: ["screen"],
    },
    permission_matrix: {
      title: "Roles and permissions",
      about: "Which user role can use which feature or screen.",
      uses: ["user_role", "feature", "screen"],
    },
    data_model: {
      title: "Data model",
      about: "The data objects, their fields, states and relations, with an ER diagram.",
      uses: ["data_object"],
    },
    user_stories: {
      title: "User stories",
      about:
        "One story per persona and journey, with the steps in order and each feature's acceptance criteria.",
      uses: ["persona", "journey", "feature"],
    },
    business_rules: {
      title: "Business rules and limits",
      about: "Rules, limits and validations the product applies, and what each governs.",
      uses: ["business_rule"],
    },
    api: {
      title: "Public API",
      about: "Endpoints from the public API documentation, and the data they read or write.",
      uses: ["api_endpoint"],
    },
    feature_logic: {
      title: "Feature logic and data reuse",
      about:
        "Per feature: what it does, the data it reads and writes, how it probably works behind the screen, how its data is reused, and the rules and roles that apply.",
      uses: ["feature"],
    },
    requirements: {
      title: "Functional requirements",
      about:
        "Numbered functional requirements (FR-001 ...) by module, drawn from the features, their data, rules, roles, plans and acceptance criteria, plus requirement nodes of kind functional.",
      uses: ["feature", "data_object", "business_rule", "requirement"],
    },
    nfr: {
      title: "Non-functional requirements",
      about:
        "Numbered non-functional requirements (NFR-001 ...) by quality: performance, scalability, security, privacy, audit, usability and more, with priority and why.",
      uses: ["requirement"],
    },
    design_system: {
      title: "Design system",
      about:
        "The measured design values a clone needs, by kind: colours, typography, spacing, corner radius, shadows, sizes, breakpoints and motion, with where each is used.",
      uses: ["design_token"],
    },
    ux_spec: {
      title: "UX specification",
      about:
        "Per screen: layout, regions and their sizes, components and states; then each component or pattern with its anatomy, variants, states and behaviour.",
      uses: ["screen", "ux_pattern"],
    },
  };

export interface FrameworkView {
  framework: Framework;
  title: string;
  about: string;
  /** Markdown without a heading; every line that states something cites its ids. */
  markdown: string;
  /** How many nodes the view is built from; 0 means the graph has nothing for it yet. */
  count: number;
}

/** Text safe inside a Markdown table cell. */
const cell = (text: string) => text.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
const str = (value: unknown) => (value === undefined || value === null ? "" : String(value));
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ") : "");
const names = (nodes: GraphNode[]) => nodes.map((n) => n.meta.name).join(", ");
const field = (n: GraphNode, key: string) => str(n.meta[key]);

/** Builds one framework view from the graph. */
export function frameworkView(
  framework: Framework,
  nodes: GraphNode[],
  records: LedgerRecord[],
): FrameworkView {
  const g = new GraphIndex(nodes, records);
  const { lines, count } = BUILDERS[framework](g);
  const info = FRAMEWORK_INFO[framework];
  const empty = `_Nothing in the graph for this yet: it needs ${info.uses.join(", ")} nodes._`;
  return {
    framework,
    title: info.title,
    about: info.about,
    markdown: (count === 0 ? empty : lines.join("\n")).trim(),
    count,
  };
}

type Built = { lines: string[]; count: number };

/** likelihood x impact, 1 to 9. */
export function riskScore(risk: GraphNode): number {
  return levelScore(risk.meta["likelihood"]) * levelScore(risk.meta["impact"]);
}

/** The rating of a risk score: 6 and up high, 3 and 4 medium, below that low. */
export function riskRating(score: number): "high" | "medium" | "low" {
  return score >= 6 ? "high" : score >= 3 ? "medium" : "low";
}

const byRating = (a: GraphNode, b: GraphNode) =>
  levelScore(b.meta["rating"]) - levelScore(a.meta["rating"]) ||
  a.meta.name.localeCompare(b.meta.name);

const byDate = (key: string) => (a: GraphNode, b: GraphNode) =>
  field(a, key).localeCompare(field(b, key)) || a.meta.name.localeCompare(b.meta.name);

const BUILDERS: Record<Framework, (g: GraphIndex) => Built> = {
  swot(g) {
    const findings = g.ofType("finding");
    const trends = g.ofType("trend");
    const risks = g.ofType("risk").filter((r) => riskScore(r) >= 6);
    const quadrants: Array<{ title: string; items: string[] }> = [
      { title: "Strengths", items: [] },
      { title: "Weaknesses", items: [] },
      { title: "Opportunities", items: [] },
      { title: "Threats", items: [] },
    ];
    const at = { strength: 0, weakness: 1, opportunity: 2, threat: 3 } as Record<string, number>;
    let count = 0;
    for (const f of findings.sort(byRating)) {
      const i = at[field(f, "swot")];
      if (i === undefined) continue;
      count++;
      quadrants[i]!.items.push(
        `- **${f.meta.name}** (${field(f, "rating") || "unrated"}): ${summaryOf(f.body, 200) || cap(field(f, "area"))} ${g.cite(f)}`,
      );
    }
    for (const t of trends) {
      const dir = field(t, "direction");
      if (dir !== "tailwind" && dir !== "headwind") continue;
      count++;
      quadrants[dir === "tailwind" ? 2 : 3]!.items.push(
        `- **${t.meta.name}** (${cap(field(t, "pestle"))} trend, ${dir}) ${g.cite(t)}`,
      );
    }
    for (const r of risks) {
      count++;
      quadrants[3]!.items.push(
        `- **${r.meta.name}** (risk, score ${riskScore(r)} of 9) ${g.cite(r)}`,
      );
    }
    const lines = quadrants.flatMap((q) => [
      `**${q.title}**`,
      "",
      ...(q.items.length ? q.items : ["- None recorded yet."]),
      "",
    ]);
    return { lines, count };
  },

  pestle(g) {
    const trends = g.ofType("trend");
    const lines = [
      "| Factor | Trend | Direction | Affects | Cites |",
      "| --- | --- | --- | --- | --- |",
    ];
    for (const factor of PESTLE) {
      const list = trends.filter((t) => field(t, "pestle") === factor);
      if (!list.length) {
        lines.push(`| ${cap(factor)} | None recorded | | | |`);
        continue;
      }
      for (const t of list) {
        lines.push(
          `| ${cap(factor)} | ${cell(t.meta.name)} | ${field(t, "direction")} | ${cell(names(g.out(t, "affects")))} | ${g.cite(t)} |`,
        );
      }
    }
    return { lines, count: trends.length };
  },

  five_forces(g) {
    const forces = g.ofType("force");
    const lines = ["| Force | Strength | What drives it | Cites |", "| --- | --- | --- | --- |"];
    const scores: number[] = [];
    for (const force of FORCES) {
      const list = forces.filter((f) => field(f, "force") === force);
      if (!list.length) {
        lines.push(`| ${cap(force)} | not assessed | | |`);
        continue;
      }
      for (const f of list) {
        scores.push(levelScore(f.meta["strength"]));
        const why = summaryOf(f.body, 160);
        lines.push(
          `| ${cap(force)} | ${field(f, "strength")} | ${cell(why ? `${f.meta.name}: ${why}` : f.meta.name)} | ${g.cite(f)} |`,
        );
      }
    }
    if (scores.length) {
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      const level = LEVELS[Math.min(2, Math.max(0, Math.round(avg) - 1))]!;
      lines.push(
        "",
        `Overall competitive pressure: **${level}** (average of ${scores.length} assessed force${scores.length === 1 ? "" : "s"}) [${forces.map((f) => f.meta.id).join(", ")}].`,
      );
    }
    return { lines, count: forces.length };
  },

  business_model_canvas(g) {
    const blocks: Array<[string, NodeType[]]> = [
      ["Customer segments", ["market_segment", "customer", "persona"]],
      ["Value propositions", ["value_proposition"]],
      ["Channels", ["channel"]],
      ["Customer relationships (main journeys)", ["journey"]],
      ["Revenue streams", ["revenue_stream"]],
      ["Key resources", ["technology", "data_object"]],
      ["Key activities (product areas)", ["module"]],
      ["Key partners", ["partner", "integration"]],
      ["Cost structure", ["cost_driver"]],
    ];
    const lines: string[] = [];
    let count = 0;
    for (const [title, types] of blocks) {
      const list = types.flatMap((t) => g.ofType(t));
      count += list.length;
      lines.push(`**${title}**`, "");
      if (!list.length) lines.push("- None recorded yet.");
      for (const n of list) {
        const extra = field(n, "model") || field(n, "kind");
        lines.push(`- ${n.meta.name}${extra ? ` (${extra.replace(/_/g, " ")})` : ""} ${g.cite(n)}`);
      }
      lines.push("");
    }
    return { lines, count };
  },

  risk_register(g) {
    const risks = g
      .ofType("risk")
      .sort((a, b) => riskScore(b) - riskScore(a) || a.meta.name.localeCompare(b.meta.name));
    const lines = [
      "| # | Risk | Category | Likelihood | Impact | Score | Rating | Mitigation | Threatens | Cites |",
      "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ];
    risks.forEach((r, i) => {
      const score = riskScore(r);
      lines.push(
        `| R${i + 1} | ${cell(r.meta.name)} | ${field(r, "category")} | ${field(r, "likelihood")} | ${field(r, "impact")} | ${score || "?"} | ${score ? riskRating(score) : "unrated"} | ${cell(field(r, "mitigation") || "None recorded")} | ${cell(names(g.out(r, "threatens")))} | ${g.cite(r)} |`,
      );
    });
    // Heat map: impact down the side (high first), likelihood across.
    lines.push(
      "",
      "Heat map (risk numbers by impact and likelihood):",
      "",
      "| Impact \\ Likelihood | Low | Medium | High |",
      "| --- | --- | --- | --- |",
    );
    for (const impact of [...LEVELS].reverse()) {
      const row = LEVELS.map((likelihood) =>
        risks
          .map((r, i) => ({ r, i }))
          .filter(({ r }) => field(r, "impact") === impact && field(r, "likelihood") === likelihood)
          .map(({ i }) => `R${i + 1}`)
          .join(" "),
      );
      lines.push(`| ${cap(impact)} | ${row.join(" | ")} |`);
    }
    const high = risks.filter((r) => riskRating(riskScore(r)) === "high").length;
    lines.push(
      "",
      `${risks.length} risk${risks.length === 1 ? "" : "s"}, ${high} rated high [${risks.map((r) => r.meta.id).join(", ")}].`,
    );
    return { lines, count: risks.length };
  },

  findings(g) {
    const findings = g.ofType("finding").sort(byRating);
    const lines = [
      "| Rating | Area | Finding | Recommendation | Cites |",
      "| --- | --- | --- | --- | --- |",
    ];
    for (const f of findings) {
      const text = summaryOf(f.body, 220);
      lines.push(
        `| ${cap(field(f, "rating")) || "Unrated"} | ${cap(field(f, "area"))} | ${cell(text ? `**${f.meta.name}**: ${text}` : `**${f.meta.name}**`)} | ${cell(field(f, "recommendation") || "None")} | ${g.cite(f)} |`,
      );
    }
    return { lines, count: findings.length };
  },

  recommendations(g) {
    const findings = g
      .ofType("finding")
      .filter((f) => field(f, "recommendation"))
      .sort(byRating);
    const lines = findings.map(
      (f, i) =>
        `${i + 1}. **${cap(field(f, "rating")) || "Unrated"} priority**: ${field(f, "recommendation")} (from: ${f.meta.name}) ${g.cite(f)}`,
    );
    return { lines, count: findings.length };
  },

  metrics(g) {
    const metrics = g
      .ofType("metric")
      .filter((m) => !["tam", "sam", "som"].includes(field(m, "kind")))
      .sort((a, b) => field(a, "kind").localeCompare(field(b, "kind")) || byDate("as_of")(b, a));
    const lines = [
      "| Metric | Kind | Value | As of | Measures | Cites |",
      "| --- | --- | --- | --- | --- | --- |",
    ];
    for (const m of metrics) lines.push(metricRow(g, m));
    return { lines, count: metrics.length };
  },

  market_size(g) {
    const order = ["tam", "sam", "som"];
    const sizes = g
      .ofType("metric")
      .filter((m) => order.includes(field(m, "kind")))
      .sort((a, b) => order.indexOf(field(a, "kind")) - order.indexOf(field(b, "kind")));
    const label: Record<string, string> = {
      tam: "TAM (total addressable market)",
      sam: "SAM (serviceable addressable market)",
      som: "SOM (serviceable obtainable market)",
    };
    const lines = [
      "| Measure | Value | As of | Market | Cites |",
      "| --- | --- | --- | --- | --- |",
      ...sizes.map(
        (m) =>
          `| ${label[field(m, "kind")]} | ${cell(`${field(m, "value")} ${field(m, "unit")}`)} | ${field(m, "as_of")} | ${cell(names(g.out(m, "measures")) || m.meta.name)} | ${g.cite(m)} |`,
      ),
    ];
    return { lines, count: sizes.length };
  },

  funding(g) {
    const rounds = g.ofType("funding_round").sort(byDate("date"));
    const lines = [
      "| Date | Round | Amount | Investors | Cites |",
      "| --- | --- | --- | --- | --- |",
      ...rounds.map((r) => {
        const investors = Array.isArray(r.meta["investors"])
          ? (r.meta["investors"] as unknown[]).map(str).join(", ")
          : field(r, "investors");
        return `| ${field(r, "date")} | ${cell(field(r, "stage") || r.meta.name)} | ${cell(field(r, "amount") || "not disclosed")} | ${cell(investors)} | ${g.cite(r)} |`;
      }),
    ];
    return { lines, count: rounds.length };
  },

  growth_signals(g) {
    const signals = g.ofType("signal").sort((a, b) => byDate("date")(b, a));
    const lines = [
      "| Date | Signal | Kind | Direction | Cites |",
      "| --- | --- | --- | --- | --- |",
      ...signals.map(
        (s) =>
          `| ${field(s, "date")} | ${cell(s.meta.name)} | ${field(s, "kind").replace(/_/g, " ")} | ${field(s, "direction") || "neutral"} | ${g.cite(s)} |`,
      ),
    ];
    const pos = signals.filter((s) => field(s, "direction") === "positive").length;
    const neg = signals.filter((s) => field(s, "direction") === "negative").length;
    if (signals.length) {
      lines.push(
        "",
        `${pos} positive and ${neg} negative signal${neg === 1 ? "" : "s"} of ${signals.length} [${signals.map((s) => s.meta.id).join(", ")}].`,
      );
    }
    return { lines, count: signals.length };
  },

  leadership(g) {
    const leaders = g.ofType("leader");
    const lines = leaders.map(
      (l) =>
        `- **${l.meta.name}**, ${field(l, "title") || "role not stated"}${g.out(l, "leads").length ? ` at ${names(g.out(l, "leads"))}` : ""} ${g.cite(l)}`,
    );
    return { lines, count: leaders.length };
  },

  compliance(g) {
    const items = g.ofType("compliance");
    const lines = [
      "| Name | Kind | Status | Applies to | Cites |",
      "| --- | --- | --- | --- | --- |",
      ...items.map(
        (c) =>
          `| ${cell(c.meta.name)} | ${field(c, "kind")} | ${field(c, "status") || "unknown"} | ${cell(names(g.into(c, "complies_with")))} | ${g.cite(c)} |`,
      ),
    ];
    return { lines, count: items.length };
  },

  tech_stack(g) {
    const techs = g.ofType("technology");
    const lines = [
      "| Part of the stack | Technology | Label | Powers | Cites |",
      "| --- | --- | --- | --- | --- |",
    ];
    const order = [...TECH_CATEGORIES] as string[];
    techs.sort(
      (a, b) =>
        order.indexOf(field(a, "category")) - order.indexOf(field(b, "category")) ||
        a.meta.name.localeCompare(b.meta.name),
    );
    for (const t of techs) {
      lines.push(
        `| ${cap(field(t, "category")) || "Unknown"} | ${cell(t.meta.name)} | ${t.meta.label} | ${cell(names(g.out(t, "powers")))} | ${g.cite(t)} |`,
      );
    }
    return { lines, count: techs.length };
  },

  competitor_matrix(g) {
    const competitors = g.ofType("competitor").slice(0, 8);
    const features = g.ofType("feature");
    if (!competitors.length || !features.length) return { lines: [], count: 0 };
    const lines = [
      `| Feature | ${competitors.map((c) => cell(c.meta.name)).join(" | ")} | Cites |`,
      `| --- | ${competitors.map(() => "---").join(" | ")} | --- |`,
    ];
    for (const f of features) {
      const offeredBy = new Set(g.into(f, "also_offers").map((c) => c.meta.id));
      lines.push(
        `| ${cell(f.meta.name)} | ${competitors.map((c) => (offeredBy.has(c.meta.id) ? "yes" : "")).join(" | ")} | ${g.cite(f)} |`,
      );
    }
    const more = g.ofType("competitor").length - competitors.length;
    lines.push(
      "",
      `"yes" means the competitor also offers the feature; an empty cell means no evidence was recorded, not that it is missing [${competitors.map((c) => c.meta.id).join(", ")}].${more > 0 ? ` ${more} more competitors are left out of the table.` : ""}`,
    );
    return { lines, count: competitors.length };
  },

  sitemap(g) {
    const screens = g.ofType("screen");
    const reached = new Set(
      screens.flatMap((s) => (s.meta.links.navigates_to ?? []).filter((id) => id !== s.meta.id)),
    );
    const roots = screens.filter((s) => !reached.has(s.meta.id));
    const lines: string[] = [];
    const seen = new Set<string>();
    const walk = (s: GraphNode, depth: number) => {
      if (seen.has(s.meta.id)) return;
      seen.add(s.meta.id);
      const path = field(s, "path");
      const shows = names(g.out(s, "shows"));
      lines.push(
        `${"  ".repeat(depth)}- **${s.meta.name}**${path ? ` \`${path}\`` : ""}${shows ? `: shows ${shows}` : ""} ${g.cite(s)}`,
      );
      for (const next of g.out(s, "navigates_to")) walk(next, Math.min(depth + 1, 2));
    };
    for (const root of roots) walk(root, 0);
    for (const s of screens) walk(s, 0); // screens only reachable through a cycle
    return { lines, count: screens.length };
  },

  permission_matrix(g) {
    const roles = g.ofType("user_role");
    const targets = [...g.ofType("feature"), ...g.ofType("screen")].filter(
      (t) => g.into(t, "can").length,
    );
    if (!roles.length) return { lines: [], count: 0 };
    const lines = [
      `| Feature or screen | ${roles.map((r) => cell(r.meta.name)).join(" | ")} | Cites |`,
      `| --- | ${roles.map(() => "---").join(" | ")} | --- |`,
    ];
    for (const t of targets) {
      const allowed = new Set(g.into(t, "can").map((r) => r.meta.id));
      lines.push(
        `| ${cell(t.meta.name)} | ${roles.map((r) => (allowed.has(r.meta.id) ? "yes" : "")).join(" | ")} | ${g.cite(t)} |`,
      );
    }
    if (!targets.length) lines.push(`| No can links yet | ${roles.map(() => "").join(" | ")} | |`);
    lines.push(
      "",
      `Roles: ${roles.map((r) => `${r.meta.name} ${g.cite(r)}`).join("; ")}. An empty cell means no evidence was recorded.`,
    );
    return { lines, count: roles.length };
  },

  data_model(g) {
    const objects = g.ofType("data_object");
    const lines: string[] = [];
    for (const o of objects) {
      const fields = Array.isArray(o.meta["fields"])
        ? (o.meta["fields"] as Array<Record<string, unknown>>)
        : [];
      const states = Array.isArray(o.meta["states"]) ? (o.meta["states"] as unknown[]) : [];
      const usedBy = names(g.into(o, "reads_writes"));
      const parts = [
        fields.length
          ? `fields: ${fields.map((f) => `${str(f["name"])}${f["type"] ? ` (${str(f["type"])}${f["required"] ? ", required" : ""})` : f["required"] ? " (required)" : ""}`).join(", ")}`
          : "fields not recorded",
        states.length ? `states: ${states.map(str).join(" -> ")}` : "",
        g.out(o, "relates_to").length ? `relates to ${names(g.out(o, "relates_to"))}` : "",
        usedBy ? `used by ${usedBy}` : "",
      ].filter(Boolean);
      lines.push(`- **${o.meta.name}**: ${parts.join("; ")}. ${g.cite(o)}`);
    }
    // ER diagram (Mermaid), for viewers that draw it; plain text otherwise.
    const ent = (n: GraphNode) =>
      n.meta.id.slice("data_object-".length).replace(/-/g, "_").toUpperCase();
    const diagram = ["```mermaid", "erDiagram"];
    for (const o of objects) {
      const fields = Array.isArray(o.meta["fields"])
        ? (o.meta["fields"] as Array<Record<string, unknown>>)
        : [];
      if (fields.length) {
        diagram.push(`  ${ent(o)} {`);
        for (const f of fields) {
          const type = str(f["type"] || "text").replace(/[^A-Za-z0-9_]/g, "_") || "text";
          const name = str(f["name"]).replace(/[^A-Za-z0-9_]/g, "_") || "field";
          diagram.push(`    ${type} ${name}`);
        }
        diagram.push("  }");
      }
      for (const other of g.out(o, "relates_to")) {
        diagram.push(`  ${ent(o)} }o--o{ ${ent(other)} : "relates to"`);
      }
      if (!fields.length && !g.out(o, "relates_to").length) {
        diagram.push(`  ${ent(o)} {`, "    text id", "  }");
      }
    }
    diagram.push("```");
    if (objects.length) lines.push("", ...diagram);
    return { lines, count: objects.length };
  },

  user_stories(g) {
    const lines: string[] = [];
    let n = 0;
    for (const persona of g.ofType("persona")) {
      for (const journey of g.out(persona, "does")) {
        n++;
        lines.push(
          `- **US-${n}** As a ${persona.meta.name}, I want to ${journey.meta.name.charAt(0).toLowerCase()}${journey.meta.name.slice(1)}. ${g.cite(persona, journey)}`,
        );
        g.out(journey, "uses").forEach((feature, i) => {
          lines.push(`  - Step ${i + 1}: ${feature.meta.name} ${g.cite(feature)}`);
          const acceptance = feature.meta["acceptance"];
          if (Array.isArray(acceptance)) {
            for (const a of acceptance) lines.push(`    - Accept: ${str(a)} [${feature.meta.id}]`);
          }
        });
      }
    }
    return { lines, count: n };
  },

  business_rules(g) {
    const rules = g.ofType("business_rule");
    const lines = [
      "| Rule | Kind | Governs | Cites |",
      "| --- | --- | --- | --- |",
      ...rules.map(
        (r) =>
          `| ${cell(summaryOf(r.body, 160) ? `**${r.meta.name}**: ${summaryOf(r.body, 160)}` : r.meta.name)} | ${field(r, "kind")} | ${cell(names(g.out(r, "governs")))} | ${g.cite(r)} |`,
      ),
    ];
    return { lines, count: rules.length };
  },

  feature_logic: featureLogic,
  requirements: functionalRequirements,
  nfr: nonFunctionalRequirements,
  design_system: designSystem,
  ux_spec: uxSpec,

  api(g) {
    const endpoints = g
      .ofType("api_endpoint")
      .sort((a, b) => field(a, "path").localeCompare(field(b, "path")));
    const lines = [
      "| Method | Path | What it does | Data | Cites |",
      "| --- | --- | --- | --- | --- |",
      ...endpoints.map(
        (e) =>
          `| ${field(e, "method")} | \`${cell(field(e, "path"))}\` | ${cell(e.meta.name)} | ${cell(names(g.out(e, "reads_writes")))} | ${g.cite(e)} |`,
      ),
    ];
    return { lines, count: endpoints.length };
  },
};

const listField = (n: GraphNode, key: string) =>
  Array.isArray(n.meta[key]) ? (n.meta[key] as unknown[]).map(str).filter(Boolean) : [];

const byPriority = (a: GraphNode, b: GraphNode) => {
  const at = (n: GraphNode) => {
    const i = PRIORITIES.indexOf(field(n, "priority") as (typeof PRIORITIES)[number]);
    return i === -1 ? PRIORITIES.length : i;
  };
  return at(a) - at(b) || a.meta.name.localeCompare(b.meta.name);
};

/** Features grouped by the module that has them; features in no module come last. */
function featuresByModule(
  g: GraphIndex,
): Array<{ module: GraphNode | null; features: GraphNode[] }> {
  const groups: Array<{ module: GraphNode | null; features: GraphNode[] }> = [];
  const placed = new Set<string>();
  for (const m of g.ofType("module")) {
    const features = g
      .out(m, "has")
      .filter((f) => f.meta.type === "feature" && !placed.has(f.meta.id));
    for (const f of features) placed.add(f.meta.id);
    if (features.length) groups.push({ module: m, features });
  }
  const rest = g.ofType("feature").filter((f) => !placed.has(f.meta.id));
  if (rest.length) groups.push({ module: null, features: rest });
  return groups;
}

function featureLogic(g: GraphIndex): Built {
  const lines: string[] = [];
  let count = 0;
  for (const { module, features } of featuresByModule(g)) {
    lines.push(
      `**${module ? module.meta.name : "Other features"}**${module ? ` ${g.cite(module)}` : ""}`,
      "",
    );
    for (const f of features) {
      count++;
      const what = summaryOf(f.body, 240);
      lines.push(
        `- **${f.meta.name}** (${f.meta.label}${field(f, "priority") ? `, ${field(f, "priority")}` : ""})${what ? `: ${what}` : ""} ${g.cite(f)}`,
      );
      const data = g.out(f, "reads_writes");
      if (data.length)
        lines.push(`  - Data: ${names(data)} [${data.map((d) => d.meta.id).join(", ")}]`);
      for (const l of listField(f, "logic")) lines.push(`  - Logic: ${l} [${f.meta.id}]`);
      for (const l of listField(f, "data_use")) lines.push(`  - Data reuse: ${l} [${f.meta.id}]`);
      const rules = g.into(f, "governs");
      if (rules.length)
        lines.push(`  - Rules: ${names(rules)} [${rules.map((r) => r.meta.id).join(", ")}]`);
      const roles = g.into(f, "can");
      if (roles.length)
        lines.push(
          `  - Who can use it: ${names(roles)} [${roles.map((r) => r.meta.id).join(", ")}]`,
        );
      const tiers = g.out(f, "gated_by");
      if (tiers.length)
        lines.push(`  - Plan: ${names(tiers)} [${tiers.map((t) => t.meta.id).join(", ")}]`);
      const tools = g.out(f, "connects_to");
      if (tools.length)
        lines.push(`  - Connects to: ${names(tools)} [${tools.map((t) => t.meta.id).join(", ")}]`);
    }
    lines.push("");
  }
  return { lines, count };
}

function functionalRequirements(g: GraphIndex): Built {
  const lines: string[] = [];
  let n = 0;
  const id = () => `FR-${String(++n).padStart(3, "0")}`;
  const fieldsOf = (o: GraphNode) =>
    Array.isArray(o.meta["fields"]) ? (o.meta["fields"] as Array<Record<string, unknown>>) : [];
  for (const { module, features } of featuresByModule(g)) {
    lines.push(`**${module ? module.meta.name : "Other features"}**`, "");
    for (const f of [...features].sort(byPriority)) {
      const priority = field(f, "priority") || (f.meta.label === "observed" ? "must" : "should");
      const what = summaryOf(f.body, 200);
      lines.push(
        `- **${id()} ${f.meta.name}** (${priority}; ${f.meta.label}): The system shall provide ${f.meta.name.charAt(0).toLowerCase()}${f.meta.name.slice(1)}${what ? `. ${what}` : "."} ${g.cite(f)}`,
      );
      for (const o of g.out(f, "reads_writes")) {
        const req = fieldsOf(o)
          .filter((x) => x["required"])
          .map((x) => str(x["name"]));
        lines.push(
          `  - Stores and reads ${o.meta.name}${req.length ? ` (required: ${req.join(", ")})` : ""}. [${o.meta.id}]`,
        );
      }
      for (const r of g.into(f, "governs"))
        lines.push(
          `  - Applies the rule ${r.meta.name}${summaryOf(r.body, 140) ? `: ${summaryOf(r.body, 140)}` : ""} [${r.meta.id}]`,
        );
      const roles = g.into(f, "can");
      if (roles.length)
        lines.push(
          `  - Available to: ${names(roles)}. [${roles.map((r) => r.meta.id).join(", ")}]`,
        );
      const tiers = g.out(f, "gated_by");
      if (tiers.length)
        lines.push(
          `  - Available from the ${names(tiers)} plan. [${tiers.map((t) => t.meta.id).join(", ")}]`,
        );
      for (const a of listField(f, "acceptance")) lines.push(`  - Accept: ${a} [${f.meta.id}]`);
    }
    lines.push("");
  }
  const objects = g.ofType("data_object");
  if (objects.length) lines.push("**Data**", "");
  for (const o of objects) {
    const fields = fieldsOf(o);
    const states = listField(o, "states");
    lines.push(
      `- **${id()} Store ${o.meta.name} records** (must; ${o.meta.label}): The system shall store ${o.meta.name} records${fields.length ? ` with ${fields.map((x) => `${str(x["name"])}${x["type"] ? ` (${str(x["type"])}${x["required"] ? ", required" : ""})` : ""}`).join(", ")}` : ""}. ${g.cite(o)}`,
    );
    if (states.length)
      lines.push(
        `  - ${o.meta.name} moves through the states ${states.join(" → ")}, and every move is recorded with its time. [${o.meta.id}]`,
      );
    const related = g.out(o, "relates_to");
    if (related.length)
      lines.push(
        `  - Each ${o.meta.name} is linked to ${names(related)}. [${[o, ...related].map((x) => x.meta.id).join(", ")}]`,
      );
  }
  if (objects.length) lines.push("");
  const rules = g
    .ofType("business_rule")
    .filter((r) => !g.out(r, "governs").some((t) => t.meta.type === "feature"));
  if (rules.length) lines.push("**Rules**", "");
  for (const r of rules) {
    lines.push(
      `- **${id()} ${r.meta.name}** (must; ${r.meta.label}): ${summaryOf(r.body, 200) || r.meta.name} ${g.cite(r)}`,
    );
  }
  if (rules.length) lines.push("");
  const extra = g
    .ofType("requirement")
    .filter((r) => field(r, "kind") === "functional")
    .sort(byPriority);
  if (extra.length) lines.push("**Other functional requirements**", "");
  for (const r of extra) {
    lines.push(
      `- **${id()} ${r.meta.name}** (${field(r, "priority") || "should"}; ${r.meta.label}): ${field(r, "statement") || summaryOf(r.body, 200)} ${g.cite(r)}`,
    );
  }
  return { lines, count: n };
}

function nonFunctionalRequirements(g: GraphIndex): Built {
  const all = g.ofType("requirement").filter((r) => field(r, "kind") === "non_functional");
  const lines = [
    "| # | Quality | Requirement | Priority | Label | Specifies | Cites |",
    "| --- | --- | --- | --- | --- | --- | --- |",
  ];
  let n = 0;
  const order = [...NFR_CATEGORIES] as string[];
  const sorted = [...all].sort(
    (a, b) =>
      (order.indexOf(field(a, "category")) + 1 || 99) -
        (order.indexOf(field(b, "category")) + 1 || 99) || byPriority(a, b),
  );
  for (const r of sorted) {
    n++;
    lines.push(
      `| NFR-${String(n).padStart(3, "0")} | ${cap(field(r, "category")) || "Other"} | ${cell(`**${r.meta.name}**: ${field(r, "statement") || summaryOf(r.body, 200)}`)} | ${field(r, "priority") || "should"} | ${r.meta.label} | ${cell(names(g.out(r, "specifies")))} | ${g.cite(r)} |`,
    );
  }
  const missing = NFR_CATEGORIES.filter((c) => !all.some((r) => field(r, "category") === c));
  if (all.length && missing.length) {
    lines.push(
      "",
      `Not assessed yet: ${missing.map(cap).join(", ")} [${all.map((r) => r.meta.id).join(", ")}].`,
    );
  }
  return { lines, count: all.length };
}

function designSystem(g: GraphIndex): Built {
  const tokens = g.ofType("design_token");
  const lines: string[] = [];
  for (const category of TOKEN_CATEGORIES) {
    const group = tokens.filter((t) => field(t, "category") === category);
    if (!group.length) continue;
    lines.push(
      `**${cap(category)}**`,
      "",
      "| Token | Value | Used for | Appears on | Label | Cites |",
      "| --- | --- | --- | --- | --- | --- |",
      ...group.map(
        (t) =>
          `| ${cell(t.meta.name)} | \`${cell(field(t, "value"))}\` | ${cell(field(t, "usage"))} | ${cell(names(g.out(t, "appears_on")))} | ${t.meta.label} | ${g.cite(t)} |`,
      ),
      "",
    );
  }
  const missing = TOKEN_CATEGORIES.filter((c) => !tokens.some((t) => field(t, "category") === c));
  if (tokens.length && missing.length) {
    lines.push(
      `Not measured yet: ${missing.map(cap).join(", ")} [${tokens.map((t) => t.meta.id).join(", ")}].`,
    );
  }
  return { lines, count: tokens.length };
}

function uxSpec(g: GraphIndex): Built {
  const screens = g.ofType("screen");
  const patterns = g.ofType("ux_pattern");
  const lines: string[] = [];
  const described = screens.filter(
    (s) => field(s, "layout") || listField(s, "regions").length || g.into(s, "appears_on").length,
  );
  if (described.length) lines.push("**Screens**", "");
  for (const s of described) {
    const components = [
      ...new Set([
        ...listField(s, "components"),
        ...g
          .into(s, "appears_on")
          .filter((p) => p.meta.type === "ux_pattern")
          .map((p) => p.meta.name),
      ]),
    ];
    const parts = [
      field(s, "path") ? `\`${field(s, "path")}\`` : "",
      field(s, "viewport") ? `seen at ${field(s, "viewport")}` : "",
    ].filter(Boolean);
    lines.push(`- **${s.meta.name}**${parts.length ? ` (${parts.join(", ")})` : ""} ${g.cite(s)}`);
    if (field(s, "layout")) lines.push(`  - Layout: ${field(s, "layout")}`);
    for (const r of listField(s, "regions")) lines.push(`  - Region: ${r}`);
    if (components.length) lines.push(`  - Components: ${components.join(", ")}`);
    if (listField(s, "states").length)
      lines.push(`  - States: ${listField(s, "states").join(", ")}`);
  }
  for (const kind of PATTERN_KINDS) {
    const group = patterns.filter((p) => field(p, "kind") === kind);
    if (!group.length) continue;
    lines.push("", `**${cap(kind)} patterns**`, "");
    for (const p of group) {
      lines.push(`- **${p.meta.name}** (${p.meta.label}) ${g.cite(p)}`);
      if (field(p, "anatomy")) lines.push(`  - Anatomy: ${field(p, "anatomy")}`);
      if (listField(p, "variants").length)
        lines.push(`  - Variants: ${listField(p, "variants").join(", ")}`);
      if (listField(p, "states").length)
        lines.push(`  - States: ${listField(p, "states").join(", ")}`);
      if (field(p, "behaviour")) lines.push(`  - Behaviour: ${field(p, "behaviour")}`);
      const on = names(g.out(p, "appears_on"));
      if (on) lines.push(`  - Appears on: ${on}`);
    }
  }
  return { lines, count: described.length + patterns.length };
}

function metricRow(g: GraphIndex, m: GraphNode): string {
  return `| ${cell(m.meta.name)} | ${field(m, "kind").replace(/_/g, " ")} | ${cell(`${field(m, "value")} ${field(m, "unit")}`)} | ${field(m, "as_of")} | ${cell(names(g.out(m, "measures")))} | ${g.cite(m)} |`;
}
