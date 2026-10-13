import { z } from "zod";
import { ReportTypeSchema, type Brief, type ReportType } from "./brief.js";
import { RebError } from "./errors.js";
import { parseGateRule } from "./gate.js";
import type { NodeType } from "./links.js";
import { ROLE_FOR_TYPE } from "./nodeRoles.js";
import { describeIssues, RoleSchema, type Role, type Task } from "./plan.js";

/** Product categories with a pipeline in pipelines/<category>.json (SPEC 8). */
export const CATEGORIES = [
  "b2b-saas",
  "developer-tool",
  "marketplace",
  "consumer-app",
  "ai-tool",
] as const;
export const CategorySchema = z.enum(CATEGORIES);
export type Category = z.infer<typeof CategorySchema>;

/**
 * One task template. `reports` limits it to runs that request one of those reports
 * (empty = always). With `per_report`, create_plan makes one copy per requested report and
 * replaces "{report}" in id-free text fields; tasks that depend on it then depend on every copy.
 */
export const PipelineTaskSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "use a short kebab-case id"),
  title: z.string().min(1),
  role: RoleSchema,
  depends_on: z.array(z.string()).default([]),
  inputs: z.array(z.string()).default([]),
  outputs: z.array(z.string()).default([]),
  done_when: z.array(z.string().min(1)).min(1),
  reports: z.array(ReportTypeSchema).default([]),
  per_report: z.boolean().default(false),
});
export type PipelineTask = z.infer<typeof PipelineTaskSchema>;

/**
 * pipelines/<category>.json. Focus-question tasks from the brief go after the `focus.after`
 * tasks and before the `focus.before` tasks.
 */
export const PipelineSchema = z
  .object({
    id: CategorySchema,
    title: z.string().min(1),
    description: z.string().min(1),
    focus: z.object({ after: z.array(z.string()), before: z.array(z.string()) }),
    tasks: z.array(PipelineTaskSchema).min(1),
  })
  .superRefine((p, ctx) => {
    const ids = new Set<string>();
    for (const t of p.tasks) {
      if (ids.has(t.id)) ctx.addIssue({ code: "custom", message: `Duplicate task id "${t.id}"` });
      ids.add(t.id);
    }
    for (const t of p.tasks) {
      for (const d of t.depends_on) {
        if (!ids.has(d))
          ctx.addIssue({ code: "custom", message: `Task "${t.id}" depends on unknown "${d}"` });
      }
    }
    for (const id of [...p.focus.after, ...p.focus.before]) {
      if (!ids.has(id)) ctx.addIssue({ code: "custom", message: `focus names unknown "${id}"` });
    }
    for (const t of p.tasks) {
      const types = producedTypes(t.done_when);
      if (types.length && !types.some((type) => ROLE_FOR_TYPE[type] === t.role)) {
        const expected = [...new Set(types.map((type) => ROLE_FOR_TYPE[type]))].join(" or ");
        ctx.addIssue({
          code: "custom",
          message: `Task "${t.id}" makes ${types.join(", ")} nodes, so its role should be ${expected} (the shared role table), not ${t.role}`,
        });
      }
    }
    const cycle = findCycle(p.tasks);
    if (cycle) ctx.addIssue({ code: "custom", message: `Dependency cycle: ${cycle.join(" -> ")}` });
  });
export type Pipeline = z.infer<typeof PipelineSchema>;

export function parsePipeline(data: unknown, where: string): Pipeline {
  const result = PipelineSchema.safeParse(data);
  if (!result.success) {
    throw new RebError(
      `The pipeline ${where} is not valid: ${describeIssues(result.error)}.`,
      "Fix the pipeline file, or reinstall reb to restore it.",
    );
  }
  return result.data;
}

/**
 * Node types a task makes, read from its done_when rules ("at least N <type> nodes",
 * "every <type> node has evidence"). Used to check roles and to see what a task covers.
 */
export function producedTypes(doneWhen: string[]): NodeType[] {
  const types = doneWhen.flatMap((d) => {
    const rule = parseGateRule(d);
    return rule?.kind === "node_count" || rule?.kind === "nodes_have_evidence" ? [rule.type] : [];
  });
  return [...new Set(types)];
}

/** The first dependency cycle found, as a list of ids that starts and ends with the same id. */
export function findCycle(tasks: Array<{ id: string; depends_on: string[] }>): string[] | null {
  const deps = new Map(tasks.map((t) => [t.id, t.depends_on]));
  const state = new Map<string, "visiting" | "done">();
  const stack: string[] = [];
  const visit = (id: string): string[] | null => {
    if (state.get(id) === "done") return null;
    if (state.get(id) === "visiting") return [...stack.slice(stack.indexOf(id)), id];
    state.set(id, "visiting");
    stack.push(id);
    for (const d of deps.get(id) ?? []) {
      const found = visit(d);
      if (found) return found;
    }
    stack.pop();
    state.set(id, "done");
    return null;
  };
  for (const t of tasks) {
    const found = visit(t.id);
    if (found) return found;
  }
  return null;
}

/** Words in a focus question that point at the node types and role that answer it. */
const FOCUS_HINTS: Array<{ words: RegExp; types: NodeType[] }> = [
  {
    words: /\b(price|prices|pricing|plan|plans|tier|tiers|cost|costs|pay|paid)\b/i,
    types: ["pricing_tier"],
  },
  {
    words: /\b(competitor|competitors|compete|competes|alternative|alternatives|rival|rivals)\b/i,
    types: ["competitor"],
  },
  {
    words: /\b(market|markets|segment|segments|industry|industries)\b/i,
    types: ["market_segment"],
  },
  {
    words: /\b(buyer|buyers|customer|customers|user|users|persona|personas|who)\b/i,
    types: ["persona"],
  },
  {
    words: /\b(integration|integrations|integrate|integrates|api|apis|connect|connects)\b/i,
    types: ["integration"],
  },
  {
    words: /\b(build|built|stack|architecture|data|database|tech|technology)\b/i,
    types: ["data_object"],
  },
  {
    words: /\b(feature|features|workflow|workflows|journey|journeys|onboarding)\b/i,
    types: ["feature"],
  },
];

/** Node types and the role that best answer a focus question (business_analyst by default). */
export function focusHint(question: string): { types: NodeType[]; role: Role } {
  const hits = FOCUS_HINTS.filter((h) => h.words.test(question));
  return {
    types: [...new Set(hits.flatMap((h) => h.types))],
    role: hits[0] ? ROLE_FOR_TYPE[hits[0].types[0]!] : "business_analyst",
  };
}

/** Where the answer draft for focus question `n` (1-based) lives in the run folder. */
export const focusNotePath = (n: number) => `notes/focus-${n}.md`;

/** The task that answers focus question `n`, used by create_plan and by the audit. */
export function focusTask(question: string, n: number) {
  const hint = focusHint(question);
  return {
    title: `Answer focus question ${n}: ${question}`,
    role: hint.role,
    inputs: ["brief.md", "kb/nodes/"],
    outputs: [focusNotePath(n)],
    done_when: [
      ...hint.types.map((t) => `at least 1 ${t} node`),
      `file ${focusNotePath(n)} exists`,
      "the answer cites node ids or E-/S- ids for every claim",
    ],
  };
}

/** Task fields create_plan produces; save adds status and added_in. */
export type PlannedTask = Omit<Task, "status" | "added_in">;

const fill = (text: string, report: ReportType) => text.replaceAll("{report}", report);

/**
 * Adapts a pipeline to a brief (SPEC 8): keeps the tasks for the requested reports, makes one
 * report task per report, and adds one task per focus question. When a task is left out, tasks
 * that depended on it depend on its own dependencies instead, so the order stays the same.
 */
export function adaptPipeline(pipeline: Pipeline, brief: Brief): PlannedTask[] {
  const reports = brief.reports;
  const wanted = (t: PipelineTask) =>
    t.reports.length === 0 || t.reports.some((r) => reports.includes(r));
  const byId = new Map(pipeline.tasks.map((t) => [t.id, t]));

  // Ids each pipeline task stands for in the plan: itself, its per-report copies, or (when left
  // out) whatever it depended on.
  const expanded = new Map<string, string[]>();
  const resolve = (id: string): string[] => {
    const known = expanded.get(id);
    if (known) return known;
    const t = byId.get(id)!;
    let ids: string[];
    if (!wanted(t)) ids = [...new Set(t.depends_on.flatMap(resolve))];
    else if (t.per_report) ids = reports.map((r) => `${t.id}-${r}`);
    else ids = [t.id];
    expanded.set(id, ids);
    return ids;
  };

  const focus = brief.focus_questions.map((q, i) => ({
    id: `focus-${i + 1}`,
    ...focusTask(q, i + 1),
    depends_on: [...new Set(pipeline.focus.after.flatMap(resolve))],
    reason: `focus question ${i + 1} from the brief`,
  }));
  const before = new Set(pipeline.focus.before);

  const tasks: PlannedTask[] = [];
  for (const t of pipeline.tasks) {
    if (!wanted(t)) continue;
    const depends = [
      ...new Set([
        ...t.depends_on.flatMap(resolve),
        ...(before.has(t.id) ? focus.map((f) => f.id) : []),
      ]),
    ];
    const reason = `from pipeline ${pipeline.id}`;
    const copies: Array<ReportType | null> = t.per_report ? reports : [null];
    for (const r of copies) {
      tasks.push({
        id: r ? `${t.id}-${r}` : t.id,
        title: r ? fill(t.title, r) : t.title,
        role: t.role,
        depends_on: depends,
        inputs: r ? t.inputs.map((x) => fill(x, r)) : t.inputs,
        outputs: r ? t.outputs.map((x) => fill(x, r)) : t.outputs,
        done_when: r ? t.done_when.map((x) => fill(x, r)) : t.done_when,
        reason,
      });
    }
  }
  // Focus tasks go just before the first task that waits on them.
  const at = tasks.findIndex((t) => focus.some((f) => t.depends_on.includes(f.id)));
  tasks.splice(at === -1 ? tasks.length : at, 0, ...focus);
  return tasks;
}
