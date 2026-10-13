import type { Command } from "commander";
import { createContext } from "../../../workflows/context.js";
import { listRuns } from "../../../workflows/runs.js";
import { line, type CliIo } from "../output.js";

export function registerList(program: Command, io: CliIo): void {
  program
    .command("list")
    .description("List runs, most recently changed first")
    .action(async () => {
      const ctx = createContext("cli", io.env);
      const runs = await listRuns(ctx);
      if (runs.length === 0) {
        line(io, `No runs yet in ${ctx.root}. Create one with: reb new <domain>`);
        return;
      }
      for (const run of runs) {
        const plan =
          run.planVersion === null ? "no plan" : `plan v${run.planVersion}, ${run.tasks} tasks`;
        line(
          io,
          `${run.slug}  ${run.product}  (${plan})  changed ${run.changedAt.toLocaleString()}`,
        );
      }
    });
}
