import type { Command } from "commander";
import type { Plan, Task } from "../../../domain/plan.js";
import { createContext } from "../../../workflows/context.js";
import { createPlan } from "../../../workflows/createPlan.js";
import { checkGate } from "../../../workflows/gate.js";
import { getPlan, nextTask, savePlanFromFile, updateTaskStatus } from "../../../workflows/plan.js";
import { applyReplan, applyReplanFromFile } from "../../../workflows/replan.js";
import { line, noteRun, type CliIo } from "../output.js";

type RunOption = { run?: string };

function describeTask(task: Task): string {
  const deps = task.depends_on.length ? `  after: ${task.depends_on.join(", ")}` : "";
  return `[${task.status}] ${task.id}  ${task.title}  (${task.role})${deps}`;
}

function printPlan(io: CliIo, plan: Plan): void {
  line(
    io,
    `Plan v${plan.version} for ${plan.product}${plan.pipeline ? ` (pipeline ${plan.pipeline})` : ""}`,
  );
  if (plan.tasks.length === 0) line(io, "No tasks.");
  plan.tasks.forEach((task, i) => line(io, `${i + 1}. ${describeTask(task)}`));
}

export function registerPlan(program: Command, io: CliIo): void {
  const plan = program.command("plan").description("Make, show and update the analysis plan");
  registerPlanGate(plan, io);
  const ctx = () => createContext("cli", io.env);

  plan
    .command("create")
    .description("Make the first plan from the brief's category, reports and focus questions")
    .option("--run <name>", "run to use (default: the most recently changed)")
    .action(async (options: RunOption) => {
      const result = await createPlan(ctx(), options);
      noteRun(io, result);
      line(io, `Created plan v${result.plan.version} from pipeline ${result.plan.pipeline}.`);
      printPlan(io, result.plan);
      line(io, 'Next: "reb plan next" shows the first task to do.');
    });

  plan
    .command("show")
    .description("Show the current plan")
    .option("--run <name>", "run to use (default: the most recently changed)")
    .action(async (options: RunOption) => {
      const result = await getPlan(ctx(), options);
      noteRun(io, result);
      if (result.plan) printPlan(io, result.plan);
      else
        line(
          io,
          `Run ${result.slug} has no plan yet. Make one from the brief with: reb plan create`,
        );
    });

  plan
    .command("next")
    .description("Show the next task that can start")
    .option("--run <name>", "run to use (default: the most recently changed)")
    .action(async (options: RunOption) => {
      const result = await nextTask(ctx(), options);
      noteRun(io, result);
      line(
        io,
        result.task
          ? describeTask(result.task)
          : "No task can start now: every pending task waits on another, or all are finished.",
      );
    });

  plan
    .command("set-status")
    .description("Change a task's status (makes a new plan version)")
    .argument("<task>", "task id")
    .argument("<status>", "pending, running, needs_human, done, blocked or dropped")
    .option("--reason <text>", "why the status changes")
    .option("--run <name>", "run to use (default: the most recently changed)")
    .action(async (task: string, status: string, options: RunOption & { reason?: string }) => {
      const result = await updateTaskStatus(ctx(), { ...options, task, status });
      noteRun(io, result);
      line(
        io,
        result.changed
          ? `Task ${task} is now ${status}. Plan is now v${result.plan.version}.`
          : `Task ${task} is already ${status}. Nothing changed.`,
      );
    });

  plan
    .command("save")
    .description("Save a plan from a JSON file as the next version")
    .argument("<file>", "JSON file with product, pipeline, reports and tasks")
    .requiredOption("--reason <text>", "why the plan changes")
    .option("--run <name>", "run to use (default: the most recently changed)")
    .action(async (file: string, options: RunOption & { reason: string }) => {
      const result = await savePlanFromFile(ctx(), { ...options, file });
      noteRun(io, result);
      line(io, `Saved plan v${result.plan.version} with ${result.plan.tasks.length} tasks.`);
    });
}

export function registerPlanGate(plan: Command, io: CliIo): void {
  const ctx = () => createContext("cli", io.env);

  plan
    .command("gate")
    .description("Check a task's done_when rules")
    .argument("<task>", "task id")
    .option("--run <name>", "run to use (default: the most recently changed)")
    .action(async (task: string, options: RunOption) => {
      const result = await checkGate(ctx(), { ...options, task });
      noteRun(io, result);
      line(io, `Gate for ${task}: ${result.task.title}`);
      for (const c of result.checks) line(io, `  [${c.status}] ${c.rule}: ${c.detail}`);
      for (const item of result.checklist) line(io, `  [check yourself] ${item}`);
      line(
        io,
        result.passed
          ? result.checklist.length
            ? "Every rule reb can check passes. Confirm the items marked [check yourself], then set the task done."
            : `Every rule passes. Set the task done: reb plan set-status ${task} done`
          : "Not done yet: fix the rules marked [fail] first.",
      );
    });

  plan
    .command("replan")
    .description(
      "Change the plan after the latest audit (default: add a task for each blocking and major gap)",
    )
    .option("--audit <n>", "audit number (default: the latest)")
    .option("--changes <file>", "JSON file with a list of changes (add, split, reorder, drop)")
    .option("--run <name>", "run to use (default: the most recently changed)")
    .action(async (options: RunOption & { audit?: string; changes?: string }) => {
      const audit = options.audit === undefined ? undefined : Number(options.audit);
      const input = { run: options.run, audit };
      const result = options.changes
        ? await applyReplanFromFile(ctx(), { ...input, file: options.changes })
        : await applyReplan(ctx(), input);
      noteRun(io, result);
      line(
        io,
        `Re-plan round ${result.round} from audit ${result.audit.number}: plan is now v${result.plan.version}.`,
      );
      for (const d of result.decisions) line(io, `- ${d.change} (${d.reason})`);
      line(io, "Each change is written to logs/decisions.md.");
    });
}
