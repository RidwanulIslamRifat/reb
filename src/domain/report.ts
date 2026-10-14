import type { ReportType } from "./brief.js";
import { correctionsOf, type EvidenceRecord, type LedgerRecord } from "./evidence.js";
import { LINK_TYPES, NODE_TYPES, type LinkType, type NodeType } from "./links.js";
import { isNodeIdFor, type GraphNode } from "./node.js";
import type { ReportTemplate } from "./reportSpec.js";

/** The report_writer's draft for a report: prose per section, rendered into the report. */
export const reportDraftPath = (report: ReportType) => `notes/report-${report}.md`;

/** Section headings reb writes itself at the end of every report (SPEC 11). */
export const SOURCES_HEADING = "Sources";
export const OPEN_QUESTIONS_HEADING = "Open questions";

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
      else if (name === "summary") at = "";
      else {
        problems.push(
          `line ${i + 1}: "## ${heading[1]}" is not a section of the ${template.report} report ` +
            `(use one of: ${template.sections.map((s) => s.title).join(", ")}; ` +
            `reb writes "${SOURCES_HEADING}" and "${OPEN_QUESTIONS_HEADING}" itself)`,
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
};

const LABEL_LEGEND =
  "Labels: **observed** (seen in a hands-on session), **documented** (stated publicly), " +
  "**inferred** (a reasoned guess), **unknown** (not confirmed). Ids in [brackets] cite nodes " +
  "(kb/nodes/<id>.md) and evidence (E-) or source (S-) records (evidence/ledger.jsonl).";

export interface RenderReportInput {
  template: ReportTemplate;
  product: string;
  slug: string;
  /** The day the report is rendered, YYYY-MM-DD. */
  date: string;
  nodes: GraphNode[];
  records: LedgerRecord[];
  draft: ReportDraft | null;
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
}

/** First paragraph of a node body, on one line. */
function summaryOf(body: string): string {
  const paragraph =
    body
      .trim()
      .split(/\n\s*\n/)
      .find((p) => p.trim() && !p.trim().startsWith("#")) ?? "";
  const line = paragraph.replace(/\s+/g, " ").trim();
  return line.length > 300 ? `${line.slice(0, 297)}...` : line;
}

/** Ends a phrase with a full stop unless it already ends with punctuation. */
const sentence = (text: string) => (/[.!?]$/.test(text) ? text : `${text}.`);

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * Renders reports/<type>.md (SPEC 11): the template's sections in order, each with the writer's
 * draft text and the graph nodes of the types the section needs (with labels, links and
 * evidence findings), then Sources and Open questions. Every generated line cites its node and
 * evidence ids.
 */
export function renderReport(input: RenderReportInput): RenderedReport {
  const { template, nodes, records, draft } = input;
  const byId = new Map(nodes.map((n) => [n.meta.id, n]));
  const ledger = new Map(records.map((r) => [r.id, r]));
  const corrected = correctionsOf(records);
  const latest = (id: string) => {
    const seen = new Set<string>();
    while (corrected.has(id) && !seen.has(id)) {
      seen.add(id);
      id = corrected.get(id)!;
    }
    return id;
  };
  const evidenceOf = (node: GraphNode): string[] => {
    const ids = [
      ...(node.meta.links.evidence ?? []).map(latest),
      ...records
        .filter((r) => r.kind === "evidence" && r.subject === node.meta.id && !corrected.has(r.id))
        .map((r) => r.id),
    ];
    return [...new Set(ids)].filter((id) => ledger.has(id));
  };
  const incoming = new Map<string, Array<{ type: LinkType; from: string }>>();
  for (const n of nodes) {
    for (const type of LINK_TYPES) {
      if (type === "evidence") continue;
      for (const to of n.meta.links[type] ?? []) {
        incoming.set(to, [...(incoming.get(to) ?? []), { type, from: n.meta.id }]);
      }
    }
  }
  const nameOf = (id: string) => byId.get(id)?.meta.name;
  const ofType = (type: NodeType) =>
    nodes
      .filter((n) => n.meta.type === type)
      .sort((a, b) => a.meta.name.localeCompare(b.meta.name) || a.meta.id.localeCompare(b.meta.id));

  const nodeLines = (node: GraphNode): string[] => {
    const { id, name, label } = node.meta;
    const evidence = evidenceOf(node);
    const summary = summaryOf(node.body);
    const facts: string[] = summary ? [summary] : [];
    for (const type of LINK_TYPES) {
      if (type === "evidence") continue;
      const names = (node.meta.links[type] ?? []).map(nameOf).filter((n) => n !== undefined);
      if (names.length) facts.push(sentence(`${LINK_WORDS[type].out}: ${names.join(", ")}`));
    }
    for (const type of LINK_TYPES) {
      if (type === "evidence") continue;
      const from = (incoming.get(id) ?? []).filter((l) => l.type === type);
      const names = [...new Set(from.map((l) => nameOf(l.from)!))];
      if (names.length) facts.push(sentence(`${LINK_WORDS[type].in}: ${names.join(", ")}`));
    }
    if (!evidence.length) facts.push("No evidence yet.");
    const lines = [
      `- **${name}** (${label}): ${facts.join(" ")} [${[id, ...evidence].join(", ")}]`,
    ];
    for (const eid of evidence) {
      const record = ledger.get(eid)!;
      if (record.kind !== "evidence") continue;
      const cite =
        record.source.startsWith("S-") && ledger.has(record.source) ? [record.source] : [];
      const limits = record.limitations.length
        ? ` Limits: ${sentence(record.limitations.join("; "))}`
        : "";
      lines.push(
        `  - ${record.confidence}: ${sentence(record.finding.replace(/\s+/g, " ").trim())}${limits} [${[eid, ...cite].join(", ")}]`,
      );
    }
    return lines;
  };

  const out: string[] = [`# ${template.title}: ${input.product}`, ""];
  if (template.intro) out.push(template.intro.replaceAll("{product}", input.product), "");
  out.push(`Run ${input.slug}, rendered ${input.date}. ${LABEL_LEGEND}`, "");
  if (draft?.summary) out.push("## Summary", "", draft.summary, "");

  const shown = new Set<string>();
  const unmet: string[] = [];
  for (const section of template.sections) {
    out.push(`## ${section.title}`, "");
    if (section.about) out.push(`_${section.about}_`, "");
    const text = draft?.sections.get(section.id);
    if (text) out.push(text, "");
    const types = [...new Set(section.needs.map((n) => n.type))];
    for (const type of types) {
      const list = ofType(type);
      out.push(`### ${TYPE_HEADING[type]} (${list.length})`, "");
      if (!list.length) out.push(`_No ${type} nodes in the graph yet._`, "");
      else out.push(...list.flatMap(nodeLines), "");
      for (const n of list) shown.add(n.meta.id);
    }
    for (const need of section.needs) {
      const list = ofType(need.type);
      if (list.length < need.min) {
        unmet.push(
          `"${section.title}" needs at least ${plural(need.min, `${need.type} node`)}; the graph has ${list.length}.`,
        );
      }
      const without = need.evidence ? list.filter((n) => !evidenceOf(n).length) : [];
      if (without.length) {
        unmet.push(
          `"${section.title}" needs evidence for every ${need.type} node; none yet for ` +
            `${without.map((n) => `${n.meta.name} [${n.meta.id}]`).join(", ")}.`,
        );
      }
    }
  }

  // Sources: S- records cited directly, or behind cited evidence; then other evidence sources.
  const cited = [...new Set(citationsIn(out.join("\n")))];
  const sourceIds = new Set<string>();
  const otherEvidence: EvidenceRecord[] = [];
  for (const id of cited) {
    const record = ledger.get(id);
    if (!record) continue;
    if (record.kind === "source") sourceIds.add(id);
    else if (ledger.get(record.source)?.kind === "source") sourceIds.add(record.source);
    else otherEvidence.push(record);
  }
  const sources = [...sourceIds].sort();
  out.push(`## ${SOURCES_HEADING}`, "");
  if (!sources.length && !otherEvidence.length) out.push("No sources are cited yet.");
  for (const id of sources) {
    const s = ledger.get(id)!;
    if (s.kind !== "source") continue;
    const dates = [s.published ? `published ${s.published}` : "", `read ${s.read_at.slice(0, 10)}`]
      .filter(Boolean)
      .join("; ");
    out.push(`- **${id}** ${s.title}${s.publisher ? `, ${s.publisher}` : ""}. ${s.url} (${dates})`);
  }
  if (otherEvidence.length) {
    if (sources.length) out.push("");
    out.push("Hands-on and other evidence:", "");
    for (const e of otherEvidence.sort((a, b) => a.id.localeCompare(b.id))) {
      out.push(`- **${e.id}** ${e.source} (${e.confidence}, ${e.at.slice(0, 10)})`);
    }
  }
  out.push("");

  // Open questions: question nodes, unknowns shown in the report, and needs not met yet.
  const openQuestions: string[] = [];
  for (const q of ofType("question")) {
    const about = (q.meta.links.about ?? []).map(nameOf).filter((n) => n !== undefined);
    openQuestions.push(
      `- ${q.meta.name}${about.length ? ` (about: ${about.join(", ")})` : ""} [${q.meta.id}]`,
    );
  }
  for (const id of shown) {
    const n = byId.get(id)!;
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
  };
}
