import type { Command } from "commander";
import { countBySeverity } from "../../../domain/audit.js";
import { runAudit } from "../../../workflows/audit.js";
import { createContext } from "../../../workflows/context.js";
import { line, noteRun, type CliIo } from "../output.js";

export function registerAudit(program: Command, io: CliIo): void {
  program
    .command("audit")
    .description("Check the analysis for gaps against the brief and the requested reports")
    .option("--run <name>", "run to use (default: the most recently changed)")
    .action(async (options: { run?: string }) => {
      const result = await runAudit(createContext("cli", io.env), options);
      noteRun(io, result);
      for (const w of result.warnings) line(io, `Warning: ${w}`);
      const { audit } = result;
      const c = countBySeverity(audit.gaps);
      line(
        io,
        `Audit ${audit.number}: ${audit.gaps.length} gaps (${c.blocking} blocking, ${c.major} major, ${c.minor} minor)`,
      );
      for (const g of audit.gaps) {
        line(io, `${g.n}. [${g.severity}] ${g.summary}`);
        line(
          io,
          `   suggested: ${g.suggested_task.id} (${g.suggested_task.role}) ${g.suggested_task.title}`,
        );
      }
      if (audit.stop) {
        line(io, `Stop: ${audit.stop_reason}.`);
        if (audit.questions.length)
          line(io, `Remaining gaps became question nodes: ${audit.questions.join(", ")}`);
      } else {
        line(io, `Continue: ${audit.stop_reason}. Next: reb plan replan`);
      }
      line(io, `Written to ${result.file}`);
    });
}
