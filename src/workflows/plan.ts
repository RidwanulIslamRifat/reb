import { RebError } from "../domain/errors.js";
import {
  describeIssues,
  findTask,
  nextRunnableTask,
  parsePlan,
  PlanDraftSchema,
  TaskStatusSchema,
  type Plan,
  type TaskStatus,
} from "../domain/plan.js";
import { readTextIfExists } from "../storage/jsonl.js";
import { readPlanText, withPlanLock, writePlanVersion } from "../storage/planFiles.js";
import type { Context } from "./context.js";
import { appendDecision, logged, type RunRef } from "./logging.js";
import { resolveRun, type ResolvedRun } from "./runs.js";

async function readCurrentPlan(run: RunRef): Promise<{ plan: Plan; text: string } | null> {
  const text = await readPlanText(run.paths);
  if (text === null) return null;
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new RebError(
      `${run.paths.plan} is not valid JSON.`,
      "Restore the last good version from plan/history, or fix the file by hand.",
    );
  }
  return { plan: parsePlan(data, run.paths.plan), text };
}

async function requirePlan(run: RunRef) {
  const current = await readCurrentPlan(run);
  if (!current) {
    throw new RebError(
      `Run "${run.slug}" has no plan yet.`,
      'Save one with "reb plan save <file.json> --reason <why>".',
    );
  }
  return current;
}

/**
 * Writes `next` as the new current plan, one version above the old one.
 * The old plan.json is copied unchanged to plan/history first; nothing is edited in place (SPEC 6.1).
 */
async function storeNewVersion(
  ctx: Context,
  run: RunRef,
  previous: { plan: Plan; text: string } | null,
  next: Omit<Plan, "version">,
  change: string,
  reason: string,
): Promise<Plan> {
  const version = (previous?.plan.version ?? 0) + 1;
  const plan = parsePlan({ ...next, version }, "the new plan");
  await writePlanVersion(
    run.paths,
    previous && { version: previous.plan.version, text: previous.text },
    JSON.stringify(plan, null, 2) + "\n",
  );
  await appendDecision(ctx, run.paths, version, change, reason);
  return plan;
}

function requireReason(reason: string | undefined): string {
  if (!reason?.trim()) {
    throw new RebError(
      "A plan change needs a reason.",
      'Say why the plan changes, for example --reason "first plan".',
    );
  }
  return reason.trim();
}

/** get_plan: the current plan, or null when there is none yet. */
export async function getPlan(ctx: Context, input: { run?: string } = {}) {
  const run = await resolveRun(ctx, input.run);
  return logged(ctx, "get_plan", run, {}, async () => ({
    ...run,
    plan: (await readCurrentPlan(run))?.plan ?? null,
  }));
}

/**
 * save_plan: stores a whole new plan as the next version. Tasks without `added_in`
 * get the new version number. M6's create_plan and apply_replan build on this.
 */
export async function savePlan(
  ctx: Context,
  input: { run?: string; plan: unknown; reason: string },
) {
  const run = await resolveRun(ctx, input.run);
  const tasks = (input.plan as { tasks?: unknown[] } | null)?.tasks;
  return logged(
    ctx,
    "save_plan",
    run,
    { reason: input.reason, tasks: Array.isArray(tasks) ? tasks.length : 0 },
    async () => {
      const reason = requireReason(input.reason);
      const draft = PlanDraftSchema.safeParse(input.plan);
      if (!draft.success) {
        throw new RebError(
          `The plan is not valid: ${describeIssues(draft.error)}.`,
          "Fix the listed fields. Each task needs id, title and role.",
        );
      }
      return withPlanLock(run.paths, async () => {
        const previous = await readCurrentPlan(run);
        const version = (previous?.plan.version ?? 0) + 1;
        const next = {
          ...draft.data,
          tasks: draft.data.tasks.map((t) => ({ ...t, added_in: t.added_in ?? version })),
        };
        const plan = await storeNewVersion(
          ctx,
          run,
          previous,
          next,
          `plan saved with ${next.tasks.length} tasks`,
          reason,
        );
        return { ...run, plan };
      });
    },
  );
}

/** next_task: the first pending task whose dependencies are all done, or null. */
export async function nextTask(ctx: Context, input: { run?: string } = {}) {
  const run = await resolveRun(ctx, input.run);
  return logged(ctx, "next_task", run, {}, async () => {
    const { plan } = await requirePlan(run);
    return { ...run, plan, task: nextRunnableTask(plan) };
  });
}

/** update_task_status: a status change is a plan change, so it makes a new plan version. */
export async function updateTaskStatus(
  ctx: Context,
  input: { run?: string; task: string; status: string; reason?: string },
) {
  const run = await resolveRun(ctx, input.run);
  const args = { task: input.task, status: input.status, reason: input.reason };
  return logged(ctx, "update_task_status", run, args, async () => {
    const status = TaskStatusSchema.safeParse(input.status);
    if (!status.success) {
      throw new RebError(
        `"${input.status}" is not a task status.`,
        `Use one of: ${TaskStatusSchema.options.join(", ")}.`,
      );
    }
    return withPlanLock(run.paths, () => changeStatus(ctx, run, input, status.data));
  });
}

/** The part of update_task_status that reads and writes the plan; runs under the plan lock. */
async function changeStatus(
  ctx: Context,
  run: ResolvedRun,
  input: { task: string; reason?: string },
  status: TaskStatus,
) {
  const previous = await requirePlan(run);
  const task = findTask(previous.plan, input.task);
  if (task.status === status) {
    return { ...run, plan: previous.plan, task, changed: false };
  }
  const reason = input.reason?.trim() || `status set from the ${ctx.via}`;
  const next = {
    ...previous.plan,
    tasks: previous.plan.tasks.map((t) => (t.id === task.id ? { ...t, status } : t)),
  };
  const plan = await storeNewVersion(
    ctx,
    run,
    previous,
    next,
    `task ${task.id}: ${task.status} -> ${status}`,
    reason,
  );
  return { ...run, plan, task: findTask(plan, task.id), changed: true };
}

/** Reads a plan from a JSON file the analyst wrote, then saves it like save_plan. */
export async function savePlanFromFile(
  ctx: Context,
  input: { run?: string; file: string; reason: string },
) {
  const text = await readTextIfExists(input.file);
  if (text === null) {
    throw new RebError(`There is no file ${input.file}.`, "Check the path to the plan file.");
  }
  let plan: unknown;
  try {
    plan = JSON.parse(text);
  } catch {
    throw new RebError(
      `${input.file} is not valid JSON.`,
      "Check the file for a missing comma or quote.",
    );
  }
  return savePlan(ctx, { run: input.run, plan, reason: input.reason });
}
