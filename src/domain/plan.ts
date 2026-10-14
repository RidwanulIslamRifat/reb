import { z } from "zod";
import { RebError } from "./errors.js";
import { ReportTypeSchema } from "./brief.js";

/** Roles from SPEC 7 (the last three are v2). */
export const ROLES = [
  "planner",
  "auditor",
  "desk_researcher",
  "market_researcher",
  "walkthrough_coach",
  "tech_observer",
  "feature_analyst",
  "business_analyst",
  "architect",
  "kb_curator",
  "report_writer",
  "financial_analyst",
  "strategy_analyst",
  "risk_analyst",
] as const;
export const RoleSchema = z.enum(ROLES);
export type Role = z.infer<typeof RoleSchema>;

export const TASK_STATUSES = [
  "pending",
  "running",
  "needs_human",
  "done",
  "blocked",
  "dropped",
] as const;
export const TaskStatusSchema = z.enum(TASK_STATUSES);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

/** Task (SPEC 6.1). `added_in` is the plan version that added it. */
export const TaskSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  role: RoleSchema,
  depends_on: z.array(z.string()).default([]),
  inputs: z.array(z.string()).default([]),
  outputs: z.array(z.string()).default([]),
  done_when: z.array(z.string()).default([]),
  status: TaskStatusSchema.default("pending"),
  added_in: z.number().int().min(1),
  reason: z.string().default(""),
});
export type Task = z.infer<typeof TaskSchema>;

const planFields = {
  product: z.string().min(1),
  pipeline: z.string().default(""),
  reports: z.array(ReportTypeSchema).default([]),
  tasks: z.array(TaskSchema).default([]),
};

/** Task ids are unique and every depends_on points at a task in the same plan. */
function checkTasks(plan: { tasks: Task[] }, ctx: z.RefinementCtx): void {
  const ids = new Set<string>();
  for (const task of plan.tasks) {
    if (ids.has(task.id))
      ctx.addIssue({ code: "custom", message: `Duplicate task id "${task.id}"` });
    ids.add(task.id);
  }
  for (const task of plan.tasks) {
    for (const dep of task.depends_on) {
      if (!ids.has(dep)) {
        ctx.addIssue({ code: "custom", message: `Task "${task.id}" depends on unknown "${dep}"` });
      }
    }
  }
}

/** plan.json (SPEC 6.1). */
export const PlanSchema = z
  .object({ version: z.number().int().min(1), ...planFields })
  .superRefine(checkTasks);
export type Plan = z.infer<typeof PlanSchema>;

/** A plan as a caller hands it to save_plan: reb sets the version itself. */
export const PlanDraftSchema = z
  .object({ ...planFields, tasks: z.array(TaskSchema.partial({ added_in: true })).default([]) })
  .superRefine((plan, ctx) => checkTasks(plan as { tasks: Task[] }, ctx));
export type PlanDraft = z.input<typeof PlanDraftSchema>;

/** Turns zod issues into one readable sentence for RebError. */
export function describeIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => (issue.path.length ? `${issue.path.join(".")}: ` : "") + issue.message)
    .join("; ");
}

export function parsePlan(data: unknown, where: string): Plan {
  const result = PlanSchema.safeParse(data);
  if (!result.success) {
    throw new RebError(
      `The plan in ${where} is not valid: ${describeIssues(result.error)}.`,
      "Fix the listed fields, or restore an earlier version from plan/history.",
    );
  }
  return result.data;
}

/** First pending task whose dependencies are all done (ROADMAP M2), or null. */
export function nextRunnableTask(plan: Plan): Task | null {
  const done = new Set(plan.tasks.filter((t) => t.status === "done").map((t) => t.id));
  return (
    plan.tasks.find((t) => t.status === "pending" && t.depends_on.every((d) => done.has(d))) ?? null
  );
}

export function findTask(plan: Plan, taskId: string): Task {
  const task = plan.tasks.find((t) => t.id === taskId);
  if (!task) {
    const known = plan.tasks.map((t) => t.id).join(", ") || "none";
    throw new RebError(
      `There is no task "${taskId}" in plan version ${plan.version}.`,
      `Use one of these task ids: ${known}.`,
    );
  }
  return task;
}
