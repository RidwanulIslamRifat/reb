import { correctionsOf, type EvidenceRecord, type LedgerRecord } from "./evidence.js";
import { LINK_TYPES, NODE_TYPES, type LinkType, type NodeType } from "./links.js";
import type { NodeMeta } from "./node.js";
import { VALIDATION_RULES, type Problem, type ValidationRule } from "./validation.js";

/**
 * done_when rules that code can check (SPEC 8 "Gate"). Any other done_when text is returned
 * to the agent as a checklist item. The wording below is what pipelines and audits write.
 *
 *   at least <N> <node_type> node(s)
 *   every <node_type> node has evidence
 *   every <node_type> node has a <link_type> link
 *   at least <N> evidence records | at least <N> sources
 *   validate_graph is clean
 *   validate_graph has no <rule> problems
 *   file <path in the run folder> exists
 *   the latest audit is acted on
 */
export type GateRule =
  | { kind: "node_count"; type: NodeType; min: number }
  | { kind: "nodes_have_evidence"; type: NodeType }
  | { kind: "nodes_have_link"; type: NodeType; link: LinkType }
  | { kind: "ledger_count"; what: "evidence" | "source"; min: number }
  | { kind: "graph_clean"; rule?: ValidationRule }
  | { kind: "file_exists"; path: string }
  | { kind: "audit_acted_on" };

const TYPE = `(${NODE_TYPES.join("|")})`;
const LINK = `(${LINK_TYPES.join("|")})`;
const RULE = `(${Object.keys(VALIDATION_RULES).join("|")})`;

/** A relative path inside the run folder: no leading slash, no "..", no backslashes. */
export function isSafeRunPath(path: string): boolean {
  return (
    path.length > 0 &&
    !path.startsWith("/") &&
    !path.includes("\\") &&
    !/^[a-z]:/i.test(path) &&
    path.split("/").every((part) => part !== "" && part !== "." && part !== "..")
  );
}

/** Reads one done_when item. Returns null when it is not a rule code can check. */
export function parseGateRule(text: string): GateRule | null {
  const t = text.trim().replace(/\.$/, "").replace(/\s+/g, " ");
  let m: RegExpExecArray | null;
  if ((m = new RegExp(`^at least (\\d+) ${TYPE} nodes?$`, "i").exec(t))) {
    return { kind: "node_count", type: m[2]!.toLowerCase() as NodeType, min: Number(m[1]) };
  }
  if ((m = new RegExp(`^every ${TYPE} node has evidence$`, "i").exec(t))) {
    return { kind: "nodes_have_evidence", type: m[1]!.toLowerCase() as NodeType };
  }
  if ((m = new RegExp(`^every ${TYPE} node has an? ${LINK} link$`, "i").exec(t))) {
    return {
      kind: "nodes_have_link",
      type: m[1]!.toLowerCase() as NodeType,
      link: m[2]!.toLowerCase() as LinkType,
    };
  }
  if ((m = /^at least (\d+) (evidence records?|sources?)$/i.exec(t))) {
    const what = m[2]!.toLowerCase().startsWith("evidence") ? "evidence" : "source";
    return { kind: "ledger_count", what, min: Number(m[1]) };
  }
  if (/^validate_graph is clean$/i.test(t)) return { kind: "graph_clean" };
  if ((m = new RegExp(`^validate_graph has no ${RULE} problems$`, "i").exec(t))) {
    return { kind: "graph_clean", rule: m[1]!.toLowerCase() as ValidationRule };
  }
  if ((m = /^file (\S+) exists$/i.exec(t)) && isSafeRunPath(m[1]!)) {
    return { kind: "file_exists", path: m[1]! };
  }
  if (/^the latest audit is acted on$/i.test(t)) return { kind: "audit_acted_on" };
  return null;
}

/** What a gate needs to know about the run; the workflow collects it. */
export interface GateFacts {
  nodes: NodeMeta[];
  records: LedgerRecord[];
  problems: Problem[];
  /** Files in the run folder that exist and are not empty, from the rules that ask. */
  files: Set<string>;
  /** True when the newest audit was re-planned or hit the stop rule; null when there is no audit. */
  latestAuditActedOn: boolean | null;
}

export interface GateCheck {
  rule: string;
  status: "pass" | "fail";
  detail: string;
}

/** Node ids that have current (not corrected) evidence, from links or evidence subjects. */
export function nodesWithEvidence(nodes: NodeMeta[], records: LedgerRecord[]): Set<string> {
  const corrected = correctionsOf(records);
  const subjects = new Set(
    records
      .filter((r): r is EvidenceRecord => r.kind === "evidence" && !corrected.has(r.id))
      .map((r) => r.subject),
  );
  return new Set(
    nodes.filter((n) => (n.links.evidence ?? []).length > 0 || subjects.has(n.id)).map((n) => n.id),
  );
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Checks one code-checkable rule against the facts. */
export function evaluateGateRule(text: string, rule: GateRule, facts: GateFacts): GateCheck {
  const result = (ok: boolean, detail: string): GateCheck => ({
    rule: text,
    status: ok ? "pass" : "fail",
    detail,
  });
  const ofType = (type: NodeType) => facts.nodes.filter((n) => n.type === type);
  switch (rule.kind) {
    case "node_count": {
      const n = ofType(rule.type).length;
      return result(n >= rule.min, `found ${plural(n, `${rule.type} node`)}, need ${rule.min}`);
    }
    case "nodes_have_evidence": {
      const nodes = ofType(rule.type);
      const backed = nodesWithEvidence(nodes, facts.records);
      const missing = nodes.filter((n) => !backed.has(n.id)).map((n) => n.id);
      if (nodes.length === 0) return result(false, `there are no ${rule.type} nodes yet`);
      return result(
        missing.length === 0,
        missing.length ? `no evidence: ${missing.join(", ")}` : `all ${nodes.length} have evidence`,
      );
    }
    case "nodes_have_link": {
      const nodes = ofType(rule.type);
      const missing = nodes.filter((n) => !(n.links[rule.link] ?? []).length).map((n) => n.id);
      if (nodes.length === 0) return result(false, `there are no ${rule.type} nodes yet`);
      return result(
        missing.length === 0,
        missing.length
          ? `no ${rule.link} link: ${missing.join(", ")}`
          : `all ${nodes.length} have one`,
      );
    }
    case "ledger_count": {
      const n = facts.records.filter((r) => r.kind === rule.what).length;
      const word = rule.what === "evidence" ? "evidence record" : "source";
      return result(n >= rule.min, `found ${plural(n, word)}, need ${rule.min}`);
    }
    case "graph_clean": {
      const found = facts.problems.filter((p) => !rule.rule || p.rule === rule.rule);
      return result(
        found.length === 0,
        found.length
          ? `${plural(found.length, "problem")}, for example: ${found[0]!.message}`
          : "no problems",
      );
    }
    case "file_exists": {
      const ok = facts.files.has(rule.path);
      return result(ok, ok ? `${rule.path} exists` : `${rule.path} is missing or empty`);
    }
    case "audit_acted_on": {
      if (facts.latestAuditActedOn === null) return result(false, "run_audit has not run yet");
      return result(
        facts.latestAuditActedOn,
        facts.latestAuditActedOn
          ? "the latest audit was re-planned or reached the stop rule"
          : "the latest audit has blocking gaps that are not re-planned yet",
      );
    }
  }
}

/** Splits done_when into code checks and a checklist of statements a person or agent confirms. */
export function evaluateGate(doneWhen: string[], facts: GateFacts) {
  const checks: GateCheck[] = [];
  const checklist: string[] = [];
  for (const text of doneWhen) {
    const rule = parseGateRule(text);
    if (rule) checks.push(evaluateGateRule(text, rule, facts));
    else checklist.push(text);
  }
  return { passed: checks.every((c) => c.status === "pass"), checks, checklist };
}

/** Run-folder files that done_when rules ask about, so the workflow knows what to look at. */
export function filesNeeded(doneWhen: string[]): string[] {
  return doneWhen.map(parseGateRule).flatMap((r) => (r?.kind === "file_exists" ? [r.path] : []));
}
