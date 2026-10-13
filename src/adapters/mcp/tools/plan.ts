import { z } from "zod";
import { REPORT_TYPES } from "../../../domain/brief.js";
import { ROLES, TASK_STATUSES } from "../../../domain/plan.js";
import { getPlan, nextTask, savePlan, updateTaskStatus } from "../../../workflows/plan.js";
import { runArg, tool } from "./common.js";

const taskInput = z.object({
  id: z.string().min(1).describe("Short unique id, for example t1."),
  title: z.string().min(1),
  role: z.enum(ROLES),
  depends_on: z.array(z.string()).optional().describe("Ids of tasks that must be done first."),
  inputs: z.array(z.string()).optional(),
  outputs: z.array(z.string()).optional(),
  done_when: z
    .array(z.string())
    .optional()
    .describe("Checkable statements that mean the task is done."),
  status: z.enum(TASK_STATUSES).optional().describe("Default pending."),
  added_in: z.number().int().min(1).optional(),
  reason: z.string().optional().describe("Why the task exists (for tasks added after an audit)."),
});

export const planTools = [
  tool({
    name: "get_plan",
    description:
      "Read a run's current plan (version, reports, tasks with status). Returns plan null when there is none yet.",
    input: { run: runArg },
    call: (ctx, args) => getPlan(ctx, args),
  }),
  tool({
    name: "save_plan",
    description:
      "Save a whole plan as the next version. The old version is kept in plan/history and the reason is " +
      "written to logs/decisions.md. Use it for the first plan and for every re-plan (cite the audit item in reason).",
    input: {
      run: runArg,
      plan: z
        .object({
          product: z.string().min(1),
          pipeline: z.string().optional(),
          reports: z.array(z.enum(REPORT_TYPES)).optional(),
          tasks: z.array(taskInput),
        })
        .describe("The complete plan (not only the changed tasks)."),
      reason: z.string().min(1).describe("Why the plan changes, in one line."),
    },
    call: (ctx, args) => savePlan(ctx, args),
  }),
  tool({
    name: "next_task",
    description:
      "Get the next task that can start (pending, with every dependency done), with its role_prompt and " +
      "role_tools from the handbook. Give the role_prompt to a sub-agent when your host supports them. " +
      "task is null when nothing can start.",
    input: { run: runArg },
    call: (ctx, args) => nextTask(ctx, args),
  }),
  tool({
    name: "update_task_status",
    description:
      "Change a task's status: running when you start it, done when its done_when items hold, " +
      "needs_human while waiting for the user's own session, blocked or dropped with a reason. Makes a new plan version.",
    input: {
      run: runArg,
      task: z.string().min(1).describe("Task id."),
      status: z.enum(TASK_STATUSES),
      reason: z.string().optional().describe("Why, in one line."),
    },
    call: (ctx, args) => updateTaskStatus(ctx, args),
  }),
];
