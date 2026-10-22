import type { Brief, ReportType } from "./brief.js";
import type { EvidenceRecord, LedgerRecord } from "./evidence.js";
import { FRAMEWORK_INFO, frameworkView } from "./frameworks.js";
import { GraphIndex, summaryOf } from "./graphIndex.js";
import { TYPE_FIELDS } from "./nodeFields.js";
import { LINK_TYPES, NODE_TYPES, type LinkType, type NodeType } from "./links.js";
import { isNodeIdFor, type GraphNode } from "./node.js";
import type { ReportTemplate } from "./reportSpec.js";

/** The report_writer's draft for a report: prose per section, rendered into the report. */
export const reportDraftPath = (report: ReportType) => `notes/report-${report}.md`;

/** Section headings reb writes itself in every report (SPEC 11). */
export const DETAILS_HEADING = "Report details";
export const SUMMARY_HEADING = "Executive summary";
export const SCOPE_HEADING = "Scope and methodology";
export const LIMITATIONS_HEADING = "Limitations and disclaimer";
export const SOURCES_HEADING = "Sources";
export const OPEN_QUESTIONS_HEADING = "Open questions";
const REB_HEADINGS = [
  DETAILS_HEADING,
  SCOPE_HEADING,
  LIMITATIONS_HEADING,
  SOURCES_HEADING,
  OPEN_QUESTIONS_HEADING,
];

// ---------------------------------------------------------------------------------------------
// Citations

const LEDGER_LIKE = /^[ES]-\d+$/;

/** True for a token that is meant as a citation: a node id or an E-/S- id. */
export function isCitationId(token: string): boolean {
  return LEDGER_LIKE.test(token) || NODE_TYPES.some((t) => isNodeIdFor(token, t));
}

/**
 * Ids cited in a piece of Markdown, in order: ids in square brackets, separated by commas,
 * semicolons or spaces, for example "[feature-sso, E-004]". Links like [text](url) are not citations.
 */
export function citationsIn(text: string): string[] {
  const ids: string[] = [];
  for (const match of text.matchAll(/\[([^[\]]+)\](?!\()/g)) {
    for (const token of match[1]!.split(/[\s,;]+/)) if (isCitationId(token)) ids.push(token);
  }
  return ids;
}

export interface Claim {
  line: number;
  text: string;
}

const TABLE_SEPARATOR = /^\|?[\s:|-]*-[\s:|-]*\|?$/;

/**
 * Splits Markdown into claims: each paragraph, list item and table row. Headings, table header
 * and separator rows, horizontal rules, code blocks and lead-in lines ending with ":" are not claims.
 */
export function claimsIn(markdown: string): Claim[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const claims: Claim[] = [];
  let current: Claim | null = null;
  let fenced = false;
  const close = () => {
    if (current && !current.text.endsWith(":")) claims.push(current);
    current = null;
  };
  lines.forEach((raw, i) => {
    const text = raw.trim();
    const line = i + 1;
    if (/^(```|~~~)/.test(text)) {
      close();
      fenced = !fenced;
      return;
    }
    if (fenced) return;
    if (text === "" || /^#{1,6}(\s|$)/.test(text) || /^([-*_])(\s*\1){2,}$/.test(text)) {
      close();
      return;
    }
    if (text.startsWith("|")) {
      close();
      const next = lines[i + 1]?.trim() ?? "";
      if (TABLE_SEPARATOR.test(text) || TABLE_SEPARATOR.test(next)) return;
      claims.push({ line, text });
      return;
    }
    if (/^([-*+]|\d+[.)])\s/.test(text)) {
      close();
      current = { line, text };
      return;
    }
    if (current) current.text += ` ${text}`;
    else current = { line, text };
  });
  close();
  return claims;
}

/** The ids a report may cite: node ids in the graph and record ids in the ledger. */
export interface KnownIds {
  nodes: ReadonlySet<string>;
  ledger: ReadonlySet<string>;
}

const short = (text: string) => (text.length > 70 ? `${text.slice(0, 67)}...` : text);

/**
 * Citation check (SPEC 11): every claim cites at least one node id or E-/S- id, and every cited
 * id exists. Returns one plain-language problem per finding, with its line number.
 */
export function citationProblems(markdown: string, known: KnownIds): string[] {
  const problems: string[] = [];
  for (const claim of claimsIn(markdown)) {
    const ids = citationsIn(claim.text);
    if (ids.length === 0) {
      problems.push(`line ${claim.line}: no citation in "${short(claim.text)}"`);
    }
    for (const id of new Set(ids)) {
      if (LEDGER_LIKE.test(id) && !known.ledger.has(id)) {
        problems.push(`line ${claim.line}: cites ${id}, which is not in the evidence ledger`);
      } else if (!LEDGER_LIKE.test(id) && !known.nodes.has(id)) {
        problems.push(`line ${claim.line}: cites ${id}, which is not a node in the graph`);
      }
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------------------------
// The report_writer's draft

export interface ReportDraft {
  /** Text before the first section heading: rendered as the report's summary. */
  summary: string;
  /** Text under each `## <section>` heading, by section id. */
  sections: Map<string, string>;
  /** Headings that are not sections of this report. */
  problems: string[];
}

const normal = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Splits a draft into the template's sections. A section is started by a `## ` heading with the
 * section's title or id; "## Summary" (or text before the first heading) is the summary.
 * A `# ` title line is ignored.
 */
export function parseReportDraft(text: string, template: ReportTemplate): ReportDraft {
  const parts = new Map<string, string[]>([["", []]]);
  const problems: string[] = [];
  let at = "";
  text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .forEach((line, i) => {
      if (/^#\s/.test(line)) return;
      const heading = /^##\s+(.*?)\s*#*\s*$/.exec(line);
      if (!heading) {
        parts.get(at)!.push(line);
        return;
      }
      const name = normal(heading[1]!);
      const section = template.sections.find((s) => normal(s.title) === name || s.id === name);
      if (section) at = section.id;
      else if (name === "summary" || name === normal(SUMMARY_HEADING)) at = "";
      else {
        problems.push(
          `line ${i + 1}: "## ${heading[1]}" is not a section of the ${template.report} report ` +
            `(use one of: ${template.sections.map((s) => s.title).join(", ")}; ` +
            `reb writes ${REB_HEADINGS.map((h) => `"${h}"`).join(", ")} itself)`,
        );
        at = `?${i}`;
      }
      if (!parts.has(at)) parts.set(at, []);
    });
  const textOf = (key: string) => (parts.get(key) ?? []).join("\n").trim();
  const sections = new Map<string, string>();
  for (const s of template.sections) if (textOf(s.id)) sections.set(s.id, textOf(s.id));
  return { summary: textOf(""), sections, problems };
}

// ---------------------------------------------------------------------------------------------
// Rendering

const TYPE_HEADING: Record<NodeType, string> = {
  company: "Company",
  product: "Product",
  module: "Modules",
  feature: "Features",
  journey: "Journeys",
  persona: "Personas",
  data_object: "Data objects",
  integration: "Integrations",
  pricing_tier: "Plans",
  competitor: "Competitors",
  market_segment: "Market segments",
  hypothesis: "Hypotheses",
  question: "Questions",
  value_proposition: "Value propositions",
  revenue_stream: "Revenue streams",
  cost_driver: "Cost drivers",
  channel: "Channels",
  partner: "Partners",
  customer: "Customers",
  metric: "Metrics",
  funding_round: "Funding rounds",
  leader: "Leadership",
  signal: "Growth signals",
  geography: "Geographies",
  compliance: "Compliance",
  finding: "Findings",
  risk: "Risks",
  trend: "Trends",
  force: "Competitive forces",
  technology: "Technologies",
  screen: "Screens",
  user_role: "User roles",
  business_rule: "Business rules",
  api_endpoint: "API endpoints",
  requirement: "Requirements",
};

/** How a link reads from its start node, and from its end node. */
const LINK_WORDS: Record<Exclude<LinkType, "evidence">, { out: string; in: string }> = {
  makes: { out: "Makes", in: "Made by" },
  has: { out: "Has", in: "Part of" },
  does: { out: "Does", in: "Done by" },
  uses: { out: "Steps, in order", in: "Used in" },
  gated_by: { out: "Available on", in: "Unlocks" },
  reads_writes: { out: "Reads and writes", in: "Read and written by" },
  connects_to: { out: "Connects to", in: "Used by" },
  also_offers: { out: "Also offers", in: "Also offered by" },
  belongs_to: { out: "Belongs to", in: "Includes" },
  explains: { out: "Explains", in: "Explained by" },
  about: { out: "About", in: "Open questions about it" },
  delivers: { out: "Delivers", in: "Delivered by" },
  serves: { out: "Serves", in: "Served by" },
  earns: { out: "Earns from", in: "Earned by" },
  incurs: { out: "Incurs", in: "Incurred by" },
  sells_through: { out: "Sells through", in: "Sells" },
  partners_with: { out: "Partners with", in: "Partner of" },
  buys: { out: "Buys", in: "Bought by" },
  measures: { out: "Measures", in: "Measured by" },
  raised: { out: "Raised", in: "Raised by" },
  leads: { out: "Leads", in: "Led by" },
  complies_with: { out: "Complies with", in: "Applies to" },
  operates_in: { out: "Operates in", in: "Home to" },
  competes_in: { out: "Competes in", in: "Contested by" },
  powers: { out: "Powers", in: "Built with" },
  threatens: { out: "Threatens", in: "Threatened by" },
  concerns: { out: "Concerns", in: "Findings about it" },
  affects: { out: "Affects", in: "Affected by" },
  shows: { out: "Shows", in: "Shown on" },
  navigates_to: { out: "Leads to", in: "Reached from" },
  can: { out: "Can use", in: "Usable by" },
  governs: { out: "Governs", in: "Governed by" },
  exposes: { out: "Exposes", in: "Exposed by" },
  relates_to: { out: "Relates to", in: "Related from" },
  specifies: { out: "Specifies", in: "Required by" },
};

export interface RenderReportInput {
  template: ReportTemplate;
  product: string;
  slug: string;
  /** The day the report is rendered, YYYY-MM-DD. */
  date: string;
  nodes: GraphNode[];
  records: LedgerRecord[];
  draft: ReportDraft | null;
  /** What the brief says, for the report details and the scope (v2). */
  brief?: Pick<Brief, "url" | "category" | "focus_questions" | "plan_tier">;
}

export interface Confidence {
  /** 0 to 100. */
  score: number;
  rating: "High" | "Medium" | "Low";
  /** How the score was worked out, in one sentence. */
  basis: string;
}

export interface RenderedReport {
  markdown: string;
  /** Every id cited, once each, in order of first use. */
  citations: string[];
  /** S- ids listed under Sources. */
  sources: string[];
  /** The items listed under Open questions. */
  openQuestions: string[];
  /** Section needs the graph does not meet yet (also listed as open questions). */
  unmet: string[];
  /** Overall confidence in the report (v2). */
  confidence: Confidence;
}

/** Ends a phrase with a full stop unless it already ends with punctuation. */
const sentence = (text: string) => (/[.!?]$/.test(text) ? text : `${text}.`);

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** How much each evidence label counts towards the confidence score. */
const LABEL_WEIGHT: Record<EvidenceRecord["confidence"], number> = {
  observed: 1,
  provided: 1,
  documented: 0.85,
  inferred: 0.5,
  unknown: 0.1,
};

/**
 * Overall confidence (v2): the average weight of the evidence behind the nodes a report shows
 * (observed and provided 1, documented 0.85, inferred 0.5, unknown 0.1; a source counts as
 * documented), times the share of shown nodes that have any evidence, minus 5 points for every
 * section need the graph does not meet (at most 30).
 */
export function reportConfidence(
  labels: Array<EvidenceRecord["confidence"]>,
  shown: number,
  backed: number,
  unmet: number,
): Confidence {
  const avg = labels.length ? labels.reduce((a, l) => a + LABEL_WEIGHT[l], 0) / labels.length : 0;
  const coverage = shown ? backed / shown : 0;
  const score = Math.max(0, Math.round(avg * coverage * 100) - Math.min(30, unmet * 5));
  const rating = score >= 75 ? "High" : score >= 50 ? "Medium" : "Low";
  return {
    score,
    rating,
    basis:
      `${plural(labels.length, "evidence record")} behind ${plural(shown, "item")} shown ` +
      `(${backed} with evidence), weighted by label, minus ${Math.min(30, unmet * 5)} points for ` +
      `${plural(unmet, "unmet section need")}`,
  };
}

const LABELS_TEXT =
  "**observed** (seen in the analyst's own use of the product), **provided** (from a document the " +
  "business handed over), **documented** (stated publicly), **inferred** (a reasoned judgement) and " +
  "**unknown** (not confirmed)";

/**
 * Renders reports/<type>.md (SPEC 11): report details with an overall confidence rating, the
 * executive summary, scope and methodology, the template's sections in order (each with the
 * writer's draft text, its framework views and the graph nodes of the types it needs, with
 * labels, links and evidence findings), limitations and disclaimer, then Sources and Open
 * questions. Every generated line cites its node and evidence ids.
 */
export function renderReport(input: RenderReportInput): RenderedReport {
  const { template, nodes, records, draft } = input;
  const g = new GraphIndex(nodes, records);
  const nameOf = (id: string) => g.nameOf(id);

  const nodeLines = (node: GraphNode): string[] => {
    const { id, name, label } = node.meta;
    const evidence = g.evidenceOf(node);
    const summary = summaryOf(node.body);
    const facts: string[] = summary ? [summary] : [];
    for (const type of LINK_TYPES) {
      if (type === "evidence") continue;
      const names = (node.meta.links[type] ?? []).map(nameOf).filter((n) => n !== undefined);
      if (names.length) facts.push(sentence(`${LINK_WORDS[type].out}: ${names.join(", ")}`));
    }
    for (const type of LINK_TYPES) {
      if (type === "evidence") continue;
      const from = g.incomingOf(id).filter((l) => l.type === type);
      const names = [...new Set(from.map((l) => nameOf(l.from)!))];
      if (names.length) facts.push(sentence(`${LINK_WORDS[type].in}: ${names.join(", ")}`));
    }
    const typed = typedFacts(node);
    if (typed) facts.push(typed);
    if (!evidence.length) facts.push("No evidence yet.");
    const lines = [
      `- **${name}** (${label}): ${facts.join(" ")} [${[id, ...evidence].join(", ")}]`,
    ];
    for (const eid of evidence) {
      const record = g.ledger.get(eid)!;
      if (record.kind !== "evidence") continue;
      const cite =
        record.source.startsWith("S-") && g.ledger.has(record.source) ? [record.source] : [];
      const limits = record.limitations.length
        ? ` Limits: ${sentence(record.limitations.join("; "))}`
        : "";
      lines.push(
        `  - ${record.confidence}: ${sentence(record.finding.replace(/\s+/g, " ").trim())}${limits} [${[eid, ...cite].join(", ")}]`,
      );
    }
    return lines;
  };

  // The sections first, so the details at the top can report on what the body shows.
  const body: string[] = [];
  const shown = new Set<string>();
  const unmet: string[] = [];
  for (const section of template.sections) {
    body.push(`## ${section.title}`, "");
    if (section.about) body.push(`_${section.about}_`, "");
    const text = draft?.sections.get(section.id);
    if (text) body.push(text, "");
    for (const framework of section.views) {
      const view = frameworkView(framework, nodes, records);
      body.push(`### ${view.title}`, "", view.markdown, "");
    }
    // Types a view of this section already shows are not listed again one by one.
    const covered = new Set(section.views.flatMap((v) => FRAMEWORK_INFO[v].uses));
    const types = [...new Set(section.needs.map((n) => n.type))];
    for (const type of types) {
      const list = g.ofType(type);
      for (const n of list) shown.add(n.meta.id);
      if (!section.list || covered.has(type)) continue;
      body.push(`### ${TYPE_HEADING[type]} (${list.length})`, "");
      if (!list.length) body.push(`_No ${type} nodes in the graph yet._`, "");
      else body.push(...list.flatMap(nodeLines), "");
    }
    for (const need of section.needs) {
      const list = g.ofType(need.type);
      if (list.length < need.min) {
        unmet.push(
          `"${section.title}" needs at least ${plural(need.min, `${need.type} node`)}; the graph has ${list.length}.`,
        );
      }
      const without = need.evidence ? list.filter((n) => !g.evidenceOf(n).length) : [];
      if (without.length) {
        unmet.push(
          `"${section.title}" needs evidence for every ${need.type} node; none yet for ` +
            `${without.map((n) => `${n.meta.name} [${n.meta.id}]`).join(", ")}.`,
        );
      }
    }
  }

  // Evidence behind what the report shows: labels for the confidence score and the evidence base.
  const shownNodes = [...shown].map((id) => g.byId.get(id)!);
  const behind = [...new Set(shownNodes.flatMap((n) => g.evidenceOf(n)))]
    .map((id) => g.ledger.get(id)!)
    .filter(Boolean);
  const labels = behind.map((r) => (r.kind === "source" ? "documented" : r.confidence));
  const backed = shownNodes.filter((n) => g.evidenceOf(n).length > 0).length;
  const confidence = reportConfidence(labels, shownNodes.length, backed, unmet.length);
  const evidenceRecords = records.filter((r): r is EvidenceRecord => r.kind === "evidence");
  const count = (label: string) => evidenceRecords.filter((r) => r.confidence === label).length;
  const dates = records.map((r) => (r.kind === "source" ? r.read_at : r.at).slice(0, 10)).sort();
  const sessions = new Set(
    evidenceRecords
      .filter((r) => r.confidence === "observed" && r.source.startsWith("evidence/inbox/"))
      .map((r) => r.source.split("/")[2]),
  );

  const out: string[] = [`# ${template.title}: ${input.product}`, ""];
  if (template.intro) out.push(template.intro.replaceAll("{product}", input.product), "");

  out.push(
    `## ${DETAILS_HEADING}`,
    "",
    "| | |",
    "| --- | --- |",
    `| Subject | ${input.product}${input.brief?.url ? ` (${input.brief.url})` : ""} |`,
    `| Report | ${template.title} |`,
    `| Analysis run | ${input.slug} |`,
    `| Date | ${input.date} |`,
    `| Evidence base | ${plural(records.filter((r) => r.kind === "source").length, "source")}, ${plural(evidenceRecords.length, "evidence record")} (${count("observed")} observed, ${count("provided")} provided, ${count("documented")} documented, ${count("inferred")} inferred, ${count("unknown")} unknown) |`,
    `| Overall confidence | **${confidence.rating}** (${confidence.score} of 100): ${confidence.basis} |`,
    "",
  );
  if (draft?.summary) out.push(`## ${SUMMARY_HEADING}`, "", draft.summary, "");

  const scope = [
    `- **Subject**: ${input.product}${input.brief?.category ? `, analysed as a ${input.brief.category} business` : ""}.`,
    input.brief?.focus_questions.length
      ? `- **Focus questions**: ${input.brief.focus_questions.map((q) => `"${q}"`).join("; ")}.`
      : "",
    `- **Sources**: public pages read one at a time (obeying robots.txt), each recorded with its address, date read and a fingerprint of its content` +
      (sessions.size
        ? `; the analyst's own use of the product in ${plural(sessions.size, "hands-on session")}${input.brief?.plan_tier ? ` on the ${input.brief.plan_tier} plan` : ""}`
        : "") +
      (count("provided") ? "; documents the business handed over" : "") +
      ".",
    dates.length ? `- **Period**: evidence collected from ${dates[0]} to ${dates.at(-1)}.` : "",
    `- **Evidence labels**: every finding is labelled ${LABELS_TEXT}. Ids in [brackets] cite knowledge-graph items (kb/nodes/<id>.md) and evidence (E-) or source (S-) records (evidence/ledger.jsonl).`,
    "- **Boundaries**: normal use only. reb never logs in to the product for the analyst, never calls its private interfaces, never replays or alters requests, never scrapes and never automates clicks.",
  ].filter(Boolean);
  out.push(`## ${SCOPE_HEADING}`, "", ...scope, "");

  out.push(...body);

  // Limitations and disclaimer: the most common limits of the evidence shown, then standard text.
  const limitCounts = new Map<string, number>();
  for (const r of behind) {
    if (r.kind !== "evidence") continue;
    for (const l of r.limitations) limitCounts.set(l, (limitCounts.get(l) ?? 0) + 1);
  }
  const topLimits = [...limitCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 6);
  const inferredShare = labels.length
    ? Math.round(
        (labels.filter((l) => l === "inferred" || l === "unknown").length / labels.length) * 100,
      )
    : 0;
  out.push(`## ${LIMITATIONS_HEADING}`, "");
  if (topLimits.length) {
    out.push("The main limits of the evidence behind this report:", "");
    for (const [limit, n] of topLimits) out.push(`- ${sentence(limit)} (${plural(n, "record")})`);
    out.push("");
  }
  out.push(
    `${inferredShare}% of the evidence behind this report is inferred or unconfirmed; those points are judgements, not facts. ` +
      "This report is based on public information" +
      (count("provided") ? ", documents the business provided" : "") +
      (sessions.size ? " and the analyst's own use of the product" : "") +
      ". It is not an audit opinion, legal advice or investment advice. Facts may have changed since the dates given. " +
      "Check the cited sources before relying on any single point.",
    "",
  );

  // Sources: S- records cited directly, or behind cited evidence; then other evidence sources.
  const cited = [...new Set(citationsIn(out.join("\n")))];
  const sourceIds = new Set<string>();
  const otherEvidence: EvidenceRecord[] = [];
  for (const id of cited) {
    const record = g.ledger.get(id);
    if (!record) continue;
    if (record.kind === "source") sourceIds.add(id);
    else if (g.ledger.get(record.source)?.kind === "source") sourceIds.add(record.source);
    else otherEvidence.push(record);
  }
  const sources = [...sourceIds].sort();
  out.push(`## ${SOURCES_HEADING}`, "");
  if (!sources.length && !otherEvidence.length) out.push("No sources are cited yet.");
  for (const id of sources) {
    const s = g.ledger.get(id)!;
    if (s.kind !== "source") continue;
    const when = [s.published ? `published ${s.published}` : "", `read ${s.read_at.slice(0, 10)}`]
      .filter(Boolean)
      .join("; ");
    out.push(`- **${id}** ${s.title}${s.publisher ? `, ${s.publisher}` : ""}. ${s.url} (${when})`);
  }
  if (otherEvidence.length) {
    if (sources.length) out.push("");
    out.push("Hands-on, provided and other evidence:", "");
    for (const e of otherEvidence.sort((a, b) => a.id.localeCompare(b.id))) {
      out.push(`- **${e.id}** ${e.source} (${e.confidence}, ${e.at.slice(0, 10)})`);
    }
  }
  out.push("");

  // Open questions: question nodes, unknowns shown in the report, and needs not met yet.
  const openQuestions: string[] = [];
  for (const q of g.ofType("question")) {
    const about = (q.meta.links.about ?? []).map(nameOf).filter((n) => n !== undefined);
    openQuestions.push(
      `- ${q.meta.name}${about.length ? ` (about: ${about.join(", ")})` : ""} [${q.meta.id}]`,
    );
  }
  for (const id of shown) {
    const n = g.byId.get(id)!;
    if (n.meta.label === "unknown" && n.meta.type !== "question") {
      openQuestions.push(`- ${n.meta.name} is not confirmed (label unknown). [${id}]`);
    }
  }
  openQuestions.push(...unmet.map((u) => `- ${u}`));
  out.push(`## ${OPEN_QUESTIONS_HEADING}`, "");
  out.push(...(openQuestions.length ? openQuestions : ["No open questions."]), "");

  const markdown = out.join("\n").replace(/\n{3,}/g, "\n\n");
  return {
    markdown,
    citations: [...new Set(citationsIn(markdown))],
    sources,
    openQuestions,
    unmet,
    confidence,
  };
}

/** Typed fields of a node in words (v2), for example "Likelihood: high. Impact: medium." */
function typedFacts(node: GraphNode): string {
  const parts: string[] = [];
  for (const f of TYPE_FIELDS[node.meta.type] ?? []) {
    const value = node.meta[f.name];
    if (value === undefined || value === null || value === "") continue;
    const label = f.name.charAt(0).toUpperCase() + f.name.slice(1).replace(/_/g, " ");
    let text: string;
    if (Array.isArray(value)) {
      text = value
        .map((v) =>
          typeof v === "object" && v !== null
            ? `${String((v as Record<string, unknown>)["name"] ?? "")}${(v as Record<string, unknown>)["type"] ? ` (${String((v as Record<string, unknown>)["type"])})` : ""}`
            : String(v),
        )
        .join("; ");
    } else text = String(value).replace(/_/g, f.kind === "enum" ? " " : "_");
    if (text) parts.push(sentence(`${label}: ${text}`));
  }
  return parts.join(" ");
}
