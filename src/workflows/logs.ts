import { RebError } from "../domain/errors.js";
import { EventSchema, formatRoleLogEntry, RoleLogEntrySchema } from "../domain/event.js";
import { RoleSchema } from "../domain/plan.js";
import { appendText, readJsonLines } from "../storage/jsonl.js";
import type { Context } from "./context.js";
import { logged } from "./logging.js";
import { resolveRun } from "./runs.js";

/** log_role_work: adds a plain-language entry to logs/roles/<role>.md (SPEC 7). */
export async function logRoleWork(
  ctx: Context,
  input: { run?: string; role: string; summary: string; task?: string },
) {
  const run = await resolveRun(ctx, input.run);
  return logged(
    ctx,
    "log_role_work",
    run,
    { role: input.role, task: input.task, summary: input.summary },
    async () => {
      const role = RoleSchema.safeParse(input.role);
      if (!role.success) {
        throw new RebError(
          `"${input.role}" is not a reb role.`,
          `Use one of: ${RoleSchema.options.join(", ")}.`,
        );
      }
      if (!input.summary.trim()) {
        throw new RebError(
          "The role log entry is empty.",
          "Write a short summary of the work done.",
        );
      }
      const entry = RoleLogEntrySchema.parse({
        at: ctx.now().toISOString(),
        role: role.data,
        task: input.task,
        summary: input.summary,
      });
      await appendText(run.paths.role(role.data), formatRoleLogEntry(entry));
      return { ...run, entry };
    },
  );
}

/**
 * The last `count` events of a run. Reading the log is not itself logged,
 * so looking at the log never changes it.
 */
export async function tailEvents(ctx: Context, input: { run?: string; count?: number }) {
  const run = await resolveRun(ctx, input.run);
  const count = input.count ?? 20;
  if (!Number.isInteger(count) || count < 1) {
    throw new RebError(
      `"${input.count}" is not a number of lines.`,
      "Give a whole number above 0.",
    );
  }
  const events = (await readJsonLines(run.paths.events)).map((line) => EventSchema.parse(line));
  return { ...run, events: events.slice(-count) };
}
