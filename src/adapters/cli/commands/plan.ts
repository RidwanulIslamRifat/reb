import type { Command } from "commander";
import type { Plan, Task } from "../../../domain/plan.js";
import { createContext } from "../../../workflows/context.js";
import { getPlan, nextTask, savePlanFromFile, updateTaskStatus } from "../../../workflows/plan.js";
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
  const plan = program.command("plan").description("Show and update the analysis plan");
  const ctx = () => createContext("cli", io.env);

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
          `Run ${result.slug} has no plan yet. Save one with: reb plan save <file.json> --reason "<why>"`,
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
