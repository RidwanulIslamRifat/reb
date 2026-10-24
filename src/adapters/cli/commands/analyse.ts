import type { Command } from "commander";
import { analyseCapture } from "../../../workflows/featureModel.js";
import { createContext } from "../../../workflows/context.js";
import { line, noteRun, type CliIo } from "../output.js";

export function registerAnalyse(program: Command, io: CliIo): void {
  program
    .command("analyse")
    .alias("analyze")
    .description(
      "Work out the features, data model, logic, rules and requirements from a reb capture (no browser needed)",
    )
    .argument("[session]", "capture session, for example session-01 (default: the latest)")
    .option("--dry-run", "only show what reb would add; write nothing")
    .option("--run <name>", "run name or folder (default: the most recently changed)")
    .action(async (session: string | undefined, options: { dryRun?: boolean; run?: string }) => {
      const result = await analyseCapture(createContext("cli", io.env), {
        run: options.run,
        session,
        dry_run: options.dryRun,
      });
      noteRun(io, result);
      line(
        io,
        `From ${result.session}: ${result.modules} modules, ${result.features} features, ${result.entities} ` +
          `entities, ${result.rules} business rules, ${result.roles} roles and ${result.requirements} ` +
          "non-functional requirements; " +
          `${result.tokens} design tokens and ${result.patterns} UX patterns.`,
      );
      if (!result.dry_run) {
        line(
          io,
          `Added ${result.created.length} nodes and ${result.links} links` +
            (result.kept.length
              ? `; kept ${result.kept.length} existing nodes as they were.`
              : "."),
        );
        line(io, `Feature model with logic, data reuse and checks per feature: ${result.notes}`);
        line(io, 'Next: confirm it in the product, then "reb report requirements".');
      } else {
        line(io, "Dry run: nothing was written.");
      }
    });
}
