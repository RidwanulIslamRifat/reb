import { z } from "zod";
import type { Brief } from "./brief.js";
import { nodesWithEvidence } from "./gate.js";
import { NodeTypeSchema, type NodeType } from "./links.js";
import type { NodeMeta } from "./node.js";
import { ROLE_FOR_TYPE } from "./nodeRoles.js";
import { focusHint, focusNotePath, focusTask } from "./pipeline.js";
import { RoleSchema, type Role } from "./plan.js";
import { SEVERITIES, SeveritySchema, type ReportSpec, type Severity } from "./reportSpec.js";
import type { LedgerRecord } from "./evidence.js";
import { VALIDATION_RULES, type Problem, type ValidationRule } from "./validation.js";

/** Stop rule (SPEC 8): stop when there are no blocking gaps, or after this many re-plan rounds. */
export const MAX_REPLAN_ROUNDS = 3;

export const SuggestedTaskSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  role: RoleSchema,
  inputs: z.array(z.string()).default([]),
  outputs: z.array(z.string()).default([]),
  done_when: z.array(z.string()).min(1),
});
export type SuggestedTask = z.infer<typeof SuggestedTaskSchema>;

export const GAP_KINDS = ["focus_question", "report_need", "evidence", "validation"] as const;

/** One numbered gap in an audit. */
export const GapSchema = z.object({
  n: z.number().int().min(1),
  severity: SeveritySchema,
  kind: z.enum(GAP_KINDS),
  summary: z.string().min(1),
  detail: z.string(),
  suggested_task: SuggestedTaskSchema,
});
export type Gap = z.infer<typeof GapSchema>;

/**
 * logs/audits/audit-<N>.json, the data behind audit-<N>.md. `replanned_in` is the plan version
 * apply_replan made from it (or kept, when nothing needed changing); `questions` the question nodes made when the stop rule applied.
 */
export const AuditRecordSchema = z.object({
  number: z.number().int().min(1),
  at: z.string(),
  plan_version: z.number().int().min(0),
  rounds_before: z.number().int().min(0),
  gaps: z.array(GapSchema),
  stop: z.boolean(),
  stop_reason: z.string(),
  replanned_in: z.number().int().nullable().default(null),
  /** False when the re-plan found every gap already covered and left the plan as it was. */
  replan_changed: z.boolean().nullable().default(null),
  questions: z.array(z.string()).default([]),
});
export type AuditRecord = z.infer<typeof AuditRecordSchema>;

const VALIDATION_SEVERITY: Record<ValidationRule, Severity> = {
  bad_node_file: "major",
  broken_link: "major",
  wrong_link_type: "major",
  feature_without_evidence: "major",
  label_stronger_than_evidence: "major",
  number_without_dated_source: "minor",
  duplicate_name: "minor",
};
const VALIDATION_ROLE: Partial<Record<ValidationRule, Role>> = {
  feature_without_evidence: "feature_analyst",
  number_without_dated_source: "desk_researcher",
};

const kebab = (s: string) => s.replace(/_/g, "-");
const rank = (s: Severity) => SEVERITIES.indexOf(s);
const strongest = (list: Severity[]) => list.reduce((a, b) => (rank(b) < rank(a) ? b : a));

export interface AuditInput {
  number: number;
  brief: Brief;
  /** Specs (template front matter) of the requested reports only. */
  specs: ReportSpec[];
  nodes: NodeMeta[];
  records: LedgerRecord[];
  problems: Problem[];
  /** Run-folder files that exist and are not empty (the focus answer drafts). */
  files: Set<string>;
}

type Draft = Omit<Gap, "n">;

/**
 * Compares the graph and drafts with the focus questions, the requested report specs and the
 * validation report (SPEC 8 "Audit"). Gaps come back numbered, most severe first, each with a
 * suggested task whose done_when check_gate can check.
 */
export function findGaps(input: AuditInput): Gap[] {
  const prefix = `a${input.number}`;
  const count = (type: NodeType) => input.nodes.filter((n) => n.type === type).length;
  const drafts: Draft[] = [];

  // Focus questions: each needs an answer draft, backed by the node types it asks about.
  input.brief.focus_questions.forEach((question, i) => {
    const n = i + 1;
    const note = focusNotePath(n);
    const empty = focusHint(question).types.filter((t) => count(t) === 0);
    if (input.files.has(note) && empty.length === 0) return;
    const task = { id: `${prefix}-focus-${n}`, ...focusTask(question, n) };
    drafts.push(
      input.files.has(note)
        ? {
            severity: "major",
            kind: "focus_question",
            summary: `Focus question ${n} is answered without any ${empty.join(" or ")} nodes`,
            detail: `"${question}" has a draft in ${note}, but the graph holds no ${empty.join(" or ")} node to back it.`,
            suggested_task: task,
          }
        : {
            severity: "blocking",
            kind: "focus_question",
            summary: `Focus question ${n} has no answer yet`,
            detail: `"${question}" needs an answer draft in ${note} that cites nodes and evidence.`,
            suggested_task: task,
          },
    );
  });

  // Report needs: one gap per node type, using the largest minimum any requested section asks for.
  const needs = new Map<
    NodeType,
    { min: number; evidence: boolean; severities: Severity[]; sections: string[] }
  >();
  for (const spec of input.specs) {
    for (const section of spec.sections) {
      for (const need of section.needs) {
        const entry = needs.get(need.type) ?? {
          min: 0,
          evidence: false,
          severities: [],
          sections: [],
        };
        entry.min = Math.max(entry.min, need.min);
        entry.evidence ||= need.evidence;
        entry.severities.push(need.severity);
        entry.sections.push(`${spec.report}: ${section.title}`);
        needs.set(need.type, entry);
      }
    }
  }
  const backed = nodesWithEvidence(input.nodes, input.records);
  for (const type of NodeTypeSchema.options) {
    const need = needs.get(type);
    if (!need) continue;
    const have = count(type);
    const sections = need.sections.join("; ");
    const doneWhen = [
      `at least ${need.min} ${type} node${need.min === 1 ? "" : "s"}`,
      ...(need.evidence ? [`every ${type} node has evidence`] : []),
    ];
    if (have < need.min) {
      const base = strongest(need.severities);
      drafts.push({
        severity: have === 0 ? base : base === "minor" ? "minor" : "major",
        kind: "report_need",
        summary:
          have === 0
            ? `No ${type} nodes, but the reports need at least ${need.min}`
            : `Only ${have} of ${need.min} ${type} nodes the reports need`,
        detail: `Needed by ${sections}.`,
        suggested_task: {
          id: `${prefix}-${kebab(type)}`,
          title: `Find ${type} nodes for ${sections}`,
          role: ROLE_FOR_TYPE[type],
          inputs: ["brief.md", "kb/nodes/"],
          outputs: ["kb/nodes/"],
          done_when: doneWhen,
        },
      });
      continue;
    }
    // Features without evidence are already a validation gap below.
    if (need.evidence && type !== "feature") {
      const missing = input.nodes.filter((n) => n.type === type && !backed.has(n.id));
      if (missing.length === 0) continue;
      drafts.push({
        severity: "major",
        kind: "evidence",
        summary: `${missing.length} ${type} node${missing.length === 1 ? " has" : "s have"} no evidence`,
        detail: `${missing.map((n) => n.id).join(", ")}; needed with evidence by ${sections}.`,
        suggested_task: {
          id: `${prefix}-evidence-${kebab(type)}`,
          title: `Back every ${type} node with evidence`,
          role: ROLE_FOR_TYPE[type],
          inputs: missing.map((n) => `kb/nodes/${n.id}.md`),
          outputs: ["evidence/ledger.jsonl"],
          done_when: [`every ${type} node has evidence`],
        },
      });
    }
  }

  // Graph validation: one gap per rule that has problems.
  for (const rule of Object.keys(VALIDATION_RULES) as ValidationRule[]) {
    const found = input.problems.filter((p) => p.rule === rule);
    if (found.length === 0) continue;
    drafts.push({
      severity: VALIDATION_SEVERITY[rule],
      kind: "validation",
      summary: `validate_graph: ${found.length} ${kebab(rule).replace(/-/g, " ")} problem${found.length === 1 ? "" : "s"}`,
      detail: found
        .slice(0, 5)
        .map((p) => p.message)
        .join(" ")
        .concat(found.length > 5 ? ` (and ${found.length - 5} more)` : ""),
      suggested_task: {
        id: `${prefix}-fix-${kebab(rule)}`,
        title: `Fix the ${kebab(rule).replace(/-/g, " ")} problems from validate_graph`,
        role: VALIDATION_ROLE[rule] ?? "kb_curator",
        inputs: ["kb/nodes/", "evidence/ledger.jsonl"],
        outputs: ["kb/nodes/"],
        done_when: [`validate_graph has no ${rule} problems`],
      },
    });
  }

  return drafts
    .map((d, i) => ({ d, i }))
    .sort((a, b) => rank(a.d.severity) - rank(b.d.severity) || a.i - b.i)
    .map(({ d }, i) => ({ n: i + 1, ...d }));
}

export function countBySeverity(gaps: Gap[]): Record<Severity, number> {
  return {
    blocking: gaps.filter((g) => g.severity === "blocking").length,
    major: gaps.filter((g) => g.severity === "major").length,
    minor: gaps.filter((g) => g.severity === "minor").length,
  };
}

/** Stop rule (SPEC 8): no blocking gaps, or 3 re-plan rounds already done. */
export function stopRule(gaps: Gap[], roundsDone: number): { stop: boolean; reason: string } {
  const blocking = countBySeverity(gaps).blocking;
  if (blocking === 0) return { stop: true, reason: "no blocking gaps" };
  if (roundsDone >= MAX_REPLAN_ROUNDS) {
    return { stop: true, reason: `${MAX_REPLAN_ROUNDS} re-plan rounds are done` };
  }
  return {
    stop: false,
    reason: `${blocking} blocking gap${blocking === 1 ? "" : "s"}; re-plan round ${roundsDone + 1} of ${MAX_REPLAN_ROUNDS}`,
  };
}

/** Id of the question node a remaining gap becomes when the stop rule applies. */
export const questionIdFor = (audit: number, gap: number) => `question-audit-${audit}-gap-${gap}`;

/** logs/audits/audit-<N>.md: what a person reads. */
export function renderAudit(audit: AuditRecord, product: string): string {
  const counts = countBySeverity(audit.gaps);
  const lines = [
    `# Audit ${audit.number} for ${product}`,
    "",
    `- When: ${audit.at}`,
    `- Plan version audited: v${audit.plan_version}`,
    `- Re-plan rounds before this audit: ${audit.rounds_before} of ${MAX_REPLAN_ROUNDS}`,
    `- Gaps: ${audit.gaps.length} (${counts.blocking} blocking, ${counts.major} major, ${counts.minor} minor)`,
    "",
    "## Gaps",
    "",
  ];
  if (audit.gaps.length === 0) lines.push("No gaps found.", "");
  for (const g of audit.gaps) {
    const t = g.suggested_task;
    lines.push(
      `${g.n}. **[${g.severity}]** ${g.summary}.`,
      `   ${g.detail}`,
      `   Suggested task ${t.id} (${t.role}): ${t.title}. Done when: ${t.done_when.join("; ")}.`,
      "",
    );
  }
  lines.push("## Stop rule", "");
  if (audit.stop) {
    lines.push(`Stop: ${audit.stop_reason}.`);
    if (audit.questions.length) {
      lines.push(`Remaining gaps became question nodes: ${audit.questions.join(", ")}.`);
    }
  } else {
    lines.push(
      `Continue: ${audit.stop_reason}. Next: apply_replan with audit ${audit.number} (reb plan replan).`,
    );
  }
  return lines.join("\n") + "\n";
}
