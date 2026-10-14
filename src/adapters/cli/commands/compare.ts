import type { Command } from "commander";
import { compareRuns } from "../../../workflows/compare.js";
import { createContext } from "../../../workflows/context.js";
import { line, noteRun, type CliIo } from "../output.js";

export function registerCompare(program: Command, io: CliIo): void {
  program
    .command("compare")
    .description(
      "Compare two runs: what changed for the same product, or what one competitor has that the other lacks",
    )
    .argument("<other>", "the other run's folder name (the later run, or the competitor)")
    .option("--run <name>", "run to compare from (default: the most recently changed)")
    .action(async (other: string, options: { run?: string }) => {
      const result = await compareRuns(createContext("cli", io.env), { run: options.run, other });
      noteRun(io, result);
      line(
        io,
        result.same_product
          ? `Same product: ${result.only_in_b.length} new, ${result.only_in_a.length} gone, ` +
              `${result.changes.length} changed (labels or fields).`
          : `Different products: ${result.only_in_a.length} nodes only in ${result.slug}, ` +
              `${result.only_in_b.length} only in ${result.other}, ${result.in_both} in both.`,
      );
      line(io, `Written to ${result.file}`);
    });
}
