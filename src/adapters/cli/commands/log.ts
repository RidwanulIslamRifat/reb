import type { Command } from "commander";
import { createContext } from "../../../workflows/context.js";
import { logRoleWork, tailEvents } from "../../../workflows/logs.js";
import { line, noteRun, type CliIo } from "../output.js";

export function registerLog(program: Command, io: CliIo): void {
  const log = program.command("log").description("Read and write a run's logs");
  const ctx = () => createContext("cli", io.env);

  log
    .command("tail")
    .description("Show the last events from logs/events.jsonl")
    .option("-n, --lines <count>", "how many events to show", "20")
    .option("--run <name>", "run to use (default: the most recently changed)")
    .action(async (options: { lines: string; run?: string }) => {
      const result = await tailEvents(ctx(), { run: options.run, count: Number(options.lines) });
      noteRun(io, result);
      if (result.events.length === 0) line(io, "No events yet.");
      for (const e of result.events) {
        const outcome = e.ok ? "ok" : `failed: ${e.error ?? ""}`;
        line(io, `${e.at}  ${e.via}  ${e.tool}  ${outcome}`);
      }
    });

  log
    .command("role")
    .description("Add an entry to a role's work log (logs/roles/<role>.md)")
    .argument("<role>", "role name, for example desk_researcher")
    .argument("<summary...>", "what was done, in plain language")
    .option("--task <id>", "task the work belongs to")
    .option("--run <name>", "run to use (default: the most recently changed)")
    .action(async (role: string, summary: string[], options: { task?: string; run?: string }) => {
      const result = await logRoleWork(ctx(), { ...options, role, summary: summary.join(" ") });
      noteRun(io, result);
      line(io, `Logged work for ${role} in ${result.paths.role(role)}.`);
    });
}
