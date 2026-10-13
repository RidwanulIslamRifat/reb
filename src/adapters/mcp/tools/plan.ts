import { z } from "zod";
import { REPORT_TYPES } from "../../../domain/brief.js";
import { ROLES, TASK_STATUSES } from "../../../domain/plan.js";
import { ReplanChangeSchema } from "../../../domain/replan.js";
import { runAudit } from "../../../workflows/audit.js";
import { createPlan } from "../../../workflows/createPlan.js";
import { checkGate } from "../../../workflows/gate.js";
import { getPlan, nextTask, savePlan, updateTaskStatus } from "../../../workflows/plan.js";
import { applyReplan } from "../../../workflows/replan.js";
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
    name: "create_plan",
    description:
      "Write a run's first plan from its brief: picks the pipeline for brief.category (b2b-saas, developer-tool, " +
      "marketplace, consumer-app, ai-tool), keeps the tasks the requested reports need and adds one task per focus " +
      "question. Fails when the run already has a plan (use apply_replan after an audit).",
    input: { run: runArg },
    call: (ctx, args) => createPlan(ctx, args),
  }),
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
      "After the task, call check_gate. task is null when nothing can start.",
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
  tool({
    name: "check_gate",
    description:
      "After doing a task, check its done_when rules. Rules code can check (node counts, required links, evidence " +
      "present, files, a clean graph) come back in checks as pass or fail; the rest come back as a checklist for you " +
      "to confirm. Set the task done only when passed is true and every checklist item holds. Changes nothing.",
    input: { run: runArg, task: z.string().min(1).describe("Task id.") },
    call: (ctx, args) => checkGate(ctx, args),
  }),
  tool({
    name: "run_audit",
    description:
      "Audit the run: compares the graph and the focus-answer drafts with the brief's focus questions, the requested " +
      "report templates (the node types each section needs) and validate_graph. Writes logs/audits/audit-<N>.md with numbered gaps, severity (blocking, major, " +
      "minor) and a suggested task each. stop is true when there are no blocking gaps or 3 re-plan rounds are done; " +
      "then the remaining gaps become question nodes. Otherwise call apply_replan next.",
    input: { run: runArg },
    call: (ctx, args) => runAudit(ctx, args),
  }),
  tool({
    name: "apply_replan",
    description:
      "Change the plan after the latest audit. Without changes, adds the suggested task of every blocking and major " +
      "gap that no pending or running task already covers (covered gaps are logged, not duplicated; minor gaps are " +
      "never turned into tasks). Or pass changes: add (a gap's suggested task, fields in task override it), split (a task into smaller " +
      "ones), reorder (new depends_on) or drop; each cites the gap number. Makes a new plan version, adds a re-audit " +
      "task, and writes one line per change to logs/decisions.md citing the audit item. Refused after 3 rounds.",
    input: {
      run: runArg,
      audit: z.number().int().min(1).optional().describe("Audit number; default the latest."),
      changes: z
        .array(ReplanChangeSchema)
        .optional()
        .describe("Leave out to add the suggested task of every blocking and major gap."),
    },
    call: (ctx, args) => applyReplan(ctx, args),
  }),
];
