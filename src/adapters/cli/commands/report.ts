import type { Command } from "commander";
import { createContext } from "../../../workflows/context.js";
import { renderReport } from "../../../workflows/renderReport.js";
import { line, noteRun, type CliIo } from "../output.js";

const count = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function registerReport(program: Command, io: CliIo): void {
  program
    .command("report")
    .description(
      "Render a report (business, feature, market or build) from the graph, with citations",
    )
    .argument("<type>", "report type: business, feature, market or build")
    .option("--docx", "also write a Word (.docx) copy")
    .option("--run <name>", "run to use (default: the most recently changed)")
    .action(async (type: string, options: { docx?: boolean; run?: string }) => {
      const result = await renderReport(createContext("cli", io.env), {
        run: options.run,
        report: type,
        docx: options.docx ?? false,
      });
      noteRun(io, result);
      for (const w of result.warnings) line(io, `Warning: ${w}`);
      line(
        io,
        `The ${result.report} report has ${count(result.sections.length, "section")}, ` +
          `${count(result.citations, "cited id")}, ${count(result.sources.length, "source")} and ` +
          `${count(result.open_questions.length, "open question")}.`,
      );
      line(io, `Written to ${result.file}`);
      if (result.docx_file) line(io, `Word copy: ${result.docx_file}`);
    });
}
