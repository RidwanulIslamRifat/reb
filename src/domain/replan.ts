import { z } from "zod";
import { MAX_REPLAN_ROUNDS, type AuditRecord, type Gap } from "./audit.js";
import { RebError } from "./errors.js";
import { parseGateRule } from "./gate.js";
import { findCycle, producedTypes } from "./pipeline.js";
import { RoleSchema, type Plan, type Task } from "./plan.js";

const TaskPartSchema = z.object({
  id: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
  role: RoleSchema.optional(),
  depends_on: z.array(z.string()).optional(),
  inputs: z.array(z.string()).optional(),
  outputs: z.array(z.string()).optional(),
  done_when: z.array(z.string().min(1)).optional(),
});

/**
 * One re-plan change (SPEC 8). Every change cites the audit gap (`gap`, its number) it answers.
 * - add: adds the gap's suggested task; fields in `task` replace the suggested ones. When a pending
 *   or running task already covers the gap (it makes the same node type, writes the same file, or
 *   cleans the same validation problems), nothing is added unless `force` is set.
 * - split: replaces a task with smaller ones; tasks that waited on it wait on all of them.
 * - reorder: gives a task new dependencies.
 * - drop: marks a task dropped; tasks that waited on it wait on its dependencies instead.
 */
export const ReplanChangeSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("add"),
    gap: z.number().int().min(1),
    task: TaskPartSchema.optional(),
    force: z
      .boolean()
      .optional()
      .describe("Add the task even when a pending or running task already covers the gap."),
  }),
  z.object({
    op: z.literal("split"),
    gap: z.number().int().min(1),
    task: z.string().min(1),
    into: z
      .array(TaskPartSchema.required({ id: true, title: true }))
      .min(2, "split into at least 2 tasks"),
  }),
  z.object({
    op: z.literal("reorder"),
    gap: z.number().int().min(1),
    task: z.string().min(1),
    depends_on: z.array(z.string()),
  }),
  z.object({ op: z.literal("drop"), gap: z.number().int().min(1), task: z.string().min(1) }),
]);
export type ReplanChange = z.infer<typeof ReplanChangeSchema>;

/** The default re-plan: add the suggested task of every blocking and major gap. */
export function defaultChanges(audit: AuditRecord): ReplanChange[] {
  return audit.gaps
    .filter((g) => g.severity !== "minor")
    .map((g) => ({ op: "add" as const, gap: g.n }));
}

/** Id of the re-audit task a re-plan round adds. */
export const reauditIdFor = (round: number) => `audit-r${round}`;

/**
 * The pending or running task that already covers a gap, or null: a task that makes the gap's node
 * type, writes its focus-answer file, or cleans its validation problems.
 */
export function coveringTask(gap: Gap, tasks: Task[]): Task | null {
  const open = tasks.filter((t) => t.status === "pending" || t.status === "running");
  const wanted = gap.suggested_task.done_when.map(parseGateRule);
  const covers = (t: Task): boolean => {
    const rules = t.done_when.map(parseGateRule);
    switch (gap.kind) {
      case "report_need":
      case "evidence": {
        const types = producedTypes(gap.suggested_task.done_when);
        return producedTypes(t.done_when).some((type) => types.includes(type));
      }
      case "focus_question": {
        const files = wanted.flatMap((r) => (r?.kind === "file_exists" ? [r.path] : []));
        return files.some(
          (f) =>
            t.outputs.includes(f) || rules.some((r) => r?.kind === "file_exists" && r.path === f),
        );
      }
      case "validation": {
        const rule = wanted.find((r) => r?.kind === "graph_clean");
        return rules.some(
          (r) =>
            r?.kind === "graph_clean" &&
            (!r.rule || (rule?.kind === "graph_clean" && r.rule === rule.rule)),
        );
      }
    }
  };
  return open.find(covers) ?? null;
}

export interface ReplanResult {
  tasks: Task[];
  /** One line per change for logs/decisions.md. */
  decisions: Array<{ change: string; reason: string }>;
  /** False when every gap was already covered and the plan stays as it is. */
  changed: boolean;
  /** Gaps an existing task already covers, with that task's id. */
  covered: Array<{ gap: number; task: string }>;
  /** Minor gaps no change cites: they stay in the audit and are not turned into tasks. */
  minorNotAdded: number[];
}

/**
 * Applies re-plan changes to a plan, as the plan for `version` (SPEC 8 "Re-plan").
 * Tasks that are done are never changed. When tasks are added, a re-audit task is added after
 * them and pending report tasks wait for it, so the loop audits again before writing reports.
 */
export function applyReplanChanges(
  plan: Plan,
  audit: AuditRecord,
  changes: ReplanChange[],
  version: number,
): ReplanResult {
  if (changes.length === 0) {
    throw new RebError(
      `Audit ${audit.number} gives nothing to re-plan.`,
      "Pass changes that cite gap numbers, or move on: the audit has no blocking or major gaps.",
    );
  }
  const round = audit.rounds_before + 1;
  let tasks: Task[] = plan.tasks.map((t) => ({ ...t, depends_on: [...t.depends_on] }));
  const decisions: ReplanResult["decisions"] = [];
  const added: string[] = [];
  const covered: ReplanResult["covered"] = [];
  let changed = false;

  const gapOf = (n: number): Gap => {
    const gap = audit.gaps.find((g) => g.n === n);
    if (!gap) {
      throw new RebError(
        `Audit ${audit.number} has no gap ${n}.`,
        `Use a gap number from 1 to ${audit.gaps.length} (see logs/audits/audit-${audit.number}.md).`,
      );
    }
    return gap;
  };
  const cite = (gap: Gap) =>
    `audit ${audit.number} item ${gap.n} [${gap.severity}]: ${gap.summary}`;
  const find = (id: string) => {
    const task = tasks.find((t) => t.id === id);
    if (!task) {
      throw new RebError(
        `There is no task "${id}" in plan version ${plan.version}.`,
        `Use one of: ${tasks.map((t) => t.id).join(", ")}.`,
      );
    }
    return task;
  };
  const changeable = (id: string) => {
    const task = find(id);
    if (task.status === "done" || task.status === "dropped") {
      throw new RebError(
        `Task ${id} is ${task.status}, so a re-plan cannot change it.`,
        "Add a new task instead.",
      );
    }
    return task;
  };
  const freshId = (id: string) => {
    if (tasks.some((t) => t.id === id)) {
      throw new RebError(
        `The plan already has a task "${id}".`,
        "Give the new task another id with task.id.",
      );
    }
    return id;
  };
  const newTask = (
    part: z.infer<typeof TaskPartSchema>,
    fallback: Partial<Task>,
    gap: Gap,
  ): Task => ({
    id: freshId(part.id ?? fallback.id!),
    title: part.title ?? fallback.title!,
    role: part.role ?? fallback.role!,
    depends_on: part.depends_on ?? fallback.depends_on ?? [],
    inputs: part.inputs ?? fallback.inputs ?? [],
    outputs: part.outputs ?? fallback.outputs ?? [],
    done_when: part.done_when ?? fallback.done_when ?? [],
    status: "pending",
    added_in: version,
    reason: cite(gap),
  });

  for (const change of changes) {
    const gap = gapOf(change.gap);
    switch (change.op) {
      case "add": {
        const existing = change.force ? null : coveringTask(gap, tasks);
        if (existing) {
          covered.push({ gap: gap.n, task: existing.id });
          decisions.push({
            change: `no new task: gap ${gap.n} is covered by existing task ${existing.id} "${existing.title}" (${existing.status})`,
            reason: cite(gap),
          });
          break;
        }
        changed = true;
        const task = newTask(change.task ?? {}, gap.suggested_task, gap);
        tasks.push(task);
        added.push(task.id);
        decisions.push({
          change: `added task ${task.id} "${task.title}" (${task.role})`,
          reason: cite(gap),
        });
        break;
      }
      case "split": {
        const old = changeable(change.task);
        changed = true;
        const parts = change.into.map((part) =>
          newTask(part, { role: old.role, depends_on: old.depends_on, inputs: old.inputs }, gap),
        );
        tasks = tasks.map((t) =>
          t.id === old.id
            ? { ...t, status: "dropped" as const }
            : t.depends_on.includes(old.id)
              ? {
                  ...t,
                  depends_on: [
                    ...new Set(
                      t.depends_on.flatMap((d) => (d === old.id ? parts.map((p) => p.id) : [d])),
                    ),
                  ],
                }
              : t,
        );
        tasks.splice(tasks.findIndex((t) => t.id === old.id) + 1, 0, ...parts);
        added.push(...parts.map((p) => p.id));
        decisions.push({
          change: `split task ${old.id} into ${parts.map((p) => p.id).join(", ")}`,
          reason: cite(gap),
        });
        break;
      }
      case "reorder": {
        const task = changeable(change.task);
        changed = true;
        for (const d of change.depends_on) find(d);
        task.depends_on = [...new Set(change.depends_on)];
        decisions.push({
          change: `task ${task.id} now waits for ${task.depends_on.join(", ") || "nothing"}`,
          reason: cite(gap),
        });
        break;
      }
      case "drop": {
        const old = changeable(change.task);
        changed = true;
        tasks = tasks.map((t) =>
          t.id === old.id
            ? { ...t, status: "dropped" as const }
            : t.depends_on.includes(old.id)
              ? {
                  ...t,
                  depends_on: [
                    ...new Set(t.depends_on.flatMap((d) => (d === old.id ? old.depends_on : [d]))),
                  ],
                }
              : t,
        );
        decisions.push({ change: `dropped task ${old.id}`, reason: cite(gap) });
        break;
      }
    }
  }

  // Re-audit after the new tasks (and the existing tasks that cover gaps), unless an auditor task
  // is still to come anyway. A running auditor task is the audit being acted on now.
  const covering = [...new Set(covered.map((c) => c.task))];
  const auditPending = tasks.some((t) => t.role === "auditor" && t.status === "pending");
  if (added.length || (covering.length && !auditPending)) {
    changed = true;
    const id = freshId(reauditIdFor(round));
    for (const t of tasks) {
      if (t.role === "report_writer" && t.status === "pending") t.depends_on.push(id);
    }
    tasks.push({
      id,
      title: `Audit again after re-plan round ${round}`,
      role: "auditor",
      depends_on: [...new Set([...added, ...covering])],
      inputs: [`logs/audits/audit-${audit.number}.md`],
      outputs: [`logs/audits/audit-${audit.number + 1}.md`],
      done_when: ["the latest audit is acted on"],
      status: "pending",
      added_in: version,
      reason: `re-plan round ${round} of ${MAX_REPLAN_ROUNDS} after audit ${audit.number}`,
    });
    decisions.push({
      change: `added task ${id} "Audit again after re-plan round ${round}" (auditor); pending report tasks wait for it`,
      reason: `re-plan round ${round} of ${MAX_REPLAN_ROUNDS} after audit ${audit.number}: check the new tasks closed the gaps`,
    });
  }

  const cycle = findCycle(tasks);
  if (cycle) {
    throw new RebError(
      `These changes would make tasks wait on each other in a circle: ${cycle.join(" -> ")}.`,
      "Change the depends_on lists so no task waits on itself.",
    );
  }
  const cited = new Set(changes.map((c) => c.gap));
  const minorNotAdded = audit.gaps
    .filter((g) => g.severity === "minor" && !cited.has(g.n))
    .map((g) => g.n);
  return { tasks, decisions, changed, covered, minorNotAdded };
}
