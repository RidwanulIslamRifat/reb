import {
  confidenceRank,
  correctionsOf,
  isLedgerId,
  SOURCE_ID,
  type Confidence,
  type EvidenceRecord,
  type LedgerRecord,
  type SourceRecord,
} from "./evidence.js";
import { describeAllowed, isAllowedLink } from "./links.js";
import { linksOf, type GraphNode } from "./node.js";

/** Validation rules (SPEC 6.3 and ROADMAP M3), in the order problems are listed. */
export const VALIDATION_RULES = {
  bad_node_file: "A node file cannot be read, or its name does not match its id.",
  broken_link: "A link, evidence subject or source points at something that does not exist.",
  wrong_link_type: "A link joins two node types that this link type does not allow.",
  feature_without_evidence: "A feature has no evidence at all.",
  number_without_dated_source: "A finding states a number but its source has no publication date.",
  label_stronger_than_evidence:
    "A node is labelled stronger (for example observed) than its strongest evidence.",
  duplicate_name: "Two nodes of the same type have the same name.",
} as const;
export type ValidationRule = keyof typeof VALIDATION_RULES;
const RULE_ORDER = Object.keys(VALIDATION_RULES) as ValidationRule[];

export interface Problem {
  rule: ValidationRule;
  /** Node id, E-/S- id or file name the problem is about. */
  subject: string;
  message: string;
  fix: string;
}

export interface GraphInput {
  /** Readable node files, with the file name they came from. */
  nodes: Array<GraphNode & { file: string }>;
  /** Node files that could not be read, with the reason. */
  badFiles: Array<{ file: string; reason: string }>;
  records: LedgerRecord[];
}

/** Follows corrections to the newest version of a ledger record id. */
function newestId(id: string, corrected: Map<string, string>): string {
  const seen = new Set<string>();
  while (corrected.has(id) && !seen.has(id)) {
    seen.add(id);
    id = corrected.get(id)!;
  }
  return id;
}

/** Checks a whole graph and its ledger. Returns every problem found; an empty list means clean. */
export function validateGraph(input: GraphInput): Problem[] {
  const problems: Problem[] = [];
  const add = (p: Problem) => problems.push(p);
  const nodes = new Map(input.nodes.map((n) => [n.meta.id, n]));
  const records = new Map(input.records.map((r) => [r.id, r]));
  const corrected = correctionsOf(input.records);
  const current = input.records.filter((r) => !corrected.has(r.id));
  const currentEvidence = current.filter((r): r is EvidenceRecord => r.kind === "evidence");

  // bad_node_file
  for (const bad of input.badFiles) {
    add({
      rule: "bad_node_file",
      subject: bad.file,
      message: `${bad.file} cannot be read: ${bad.reason}.`,
      fix: "Open the file and fix its front matter between the --- lines.",
    });
  }
  for (const node of input.nodes) {
    if (node.file !== `${node.meta.id}.md`) {
      add({
        rule: "bad_node_file",
        subject: node.file,
        message: `${node.file} holds node "${node.meta.id}", so the file name and the id differ.`,
        fix: `Rename the file to ${node.meta.id}.md, or change its id.`,
      });
    }
  }

  // broken_link and wrong_link_type, from node front matter
  for (const node of input.nodes) {
    const from = node.meta;
    for (const link of linksOf(from)) {
      const targetNode = nodes.get(link.to);
      const targetRecord = records.get(link.to);
      if (!targetNode && !targetRecord) {
        add({
          rule: "broken_link",
          subject: from.id,
          message: `${from.id} links (${link.type}) to "${link.to}", which does not exist.`,
          fix: isLedgerId(link.to)
            ? `Record ${link.to} in the evidence ledger, or remove the link.`
            : `Create node ${link.to} with "reb kb add", or remove the link.`,
        });
        continue;
      }
      const toType = targetRecord && isLedgerId(link.to) ? "ledger" : targetNode!.meta.type;
      if (!isAllowedLink(link.type, from.type, toType)) {
        const shown = toType === "ledger" ? "an evidence id" : toType;
        add({
          rule: "wrong_link_type",
          subject: from.id,
          message: `${from.id} (${from.type}) ${link.type} ${link.to} (${shown}) is not an allowed pair.`,
          fix: `"${link.type}" only allows ${describeAllowed(link.type)}. Use another link type or remove it.`,
        });
      }
    }
  }

  // broken_link, from the ledger
  for (const record of currentEvidence) {
    if (!nodes.has(record.subject)) {
      add({
        rule: "broken_link",
        subject: record.id,
        message: `${record.id} is about "${record.subject}", which is not a node.`,
        fix: `Create node ${record.subject} with "reb kb add", or record a correction with the right subject.`,
      });
    }
    if (SOURCE_ID.test(record.source) && !records.has(record.source)) {
      add({
        rule: "broken_link",
        subject: record.id,
        message: `${record.id} cites source ${record.source}, which is not in the ledger.`,
        fix: `Record the source with "reb evidence source", or correct ${record.id}.`,
      });
    }
  }

  // feature_without_evidence
  const subjects = new Set(currentEvidence.map((r) => r.subject));
  for (const node of input.nodes) {
    if (node.meta.type !== "feature") continue;
    if ((node.meta.links.evidence ?? []).length === 0 && !subjects.has(node.meta.id)) {
      add({
        rule: "feature_without_evidence",
        subject: node.meta.id,
        message: `${node.meta.id} has no evidence.`,
        fix: `Record evidence about it with "reb evidence add --subject ${node.meta.id} ...", or link an E-/S- id.`,
      });
    }
  }

  // number_without_dated_source: observed findings are dated by their own `at`.
  const sources = current.filter((r): r is SourceRecord => r.kind === "source");
  for (const record of currentEvidence) {
    if (record.confidence === "observed" || !/\d/.test(record.finding)) continue;
    const source = SOURCE_ID.test(record.source)
      ? records.get(newestId(record.source, corrected))
      : sources.findLast((s) => s.url === record.source);
    if (source?.kind === "source" && source.published) continue;
    add({
      rule: "number_without_dated_source",
      subject: record.id,
      message: `${record.id} states a number ("${record.finding}") but its source ${record.source} has no publication date.`,
      fix: "Record the source with --published <date>, or cite a dated source in a correction.",
    });
  }

  // label_stronger_than_evidence (only nodes that have evidence; features without any are listed above)
  for (const node of input.nodes) {
    const { meta } = node;
    if (meta.label !== "observed" && meta.label !== "documented") continue;
    const labels: Confidence[] = [];
    for (const id of meta.links.evidence ?? []) {
      const record = records.get(newestId(id, corrected));
      if (record) labels.push(record.kind === "source" ? "documented" : record.confidence);
    }
    for (const r of currentEvidence) if (r.subject === meta.id) labels.push(r.confidence);
    if (labels.length === 0) continue;
    const strongest = labels.reduce((a, b) => (confidenceRank(b) > confidenceRank(a) ? b : a));
    if (confidenceRank(meta.label) > confidenceRank(strongest)) {
      add({
        rule: "label_stronger_than_evidence",
        subject: meta.id,
        message: `${meta.id} is labelled ${meta.label} but its strongest evidence is ${strongest}.`,
        fix: `Change its label to ${strongest}, or record stronger evidence.`,
      });
    }
  }

  // duplicate_name
  const byName = new Map<string, string[]>();
  for (const node of input.nodes) {
    const key = `${node.meta.type}:${node.meta.name.trim().toLowerCase().replace(/\s+/g, " ")}`;
    byName.set(key, [...(byName.get(key) ?? []), node.meta.id]);
  }
  for (const [key, ids] of byName) {
    if (ids.length < 2) continue;
    const [type, name] = [key.slice(0, key.indexOf(":")), key.slice(key.indexOf(":") + 1)];
    ids.sort();
    add({
      rule: "duplicate_name",
      subject: ids[0]!,
      message: `${ids.join(" and ")} are both ${type} nodes named "${name}".`,
      fix: "One fact lives in one node: merge them into one and link to it, or rename one.",
    });
  }

  return problems.sort(
    (a, b) =>
      RULE_ORDER.indexOf(a.rule) - RULE_ORDER.indexOf(b.rule) || a.subject.localeCompare(b.subject),
  );
}
