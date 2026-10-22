import type { Command } from "commander";
import { createContext } from "../../../workflows/context.js";
import { renderReport } from "../../../workflows/renderReport.js";
import { line, noteRun, type CliIo } from "../output.js";

const count = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function registerReport(program: Command, io: CliIo): void {
  program
    .command("report")
    .description(
      "Render a report from the graph, with citations, a confidence rating and limitations",
    )
    .argument(
      "<type>",
      "report type: business, feature, market, build, due_diligence, risk, strategy, technical, rebuild or requirements",
    )
    .option("--docx", "also write a Word (.docx) copy with a title page")
    .option("--html", "also write a web page (.html) you can print to PDF")
    .option("--run <name>", "run to use (default: the most recently changed)")
    .action(async (type: string, options: { docx?: boolean; html?: boolean; run?: string }) => {
      const result = await renderReport(createContext("cli", io.env), {
        run: options.run,
        report: type,
        docx: options.docx ?? false,
        html: options.html ?? false,
      });
      noteRun(io, result);
      for (const w of result.warnings) line(io, `Warning: ${w}`);
      line(
        io,
        `The ${result.report} report has ${count(result.sections.length, "section")}, ` +
          `${count(result.citations, "cited id")}, ${count(result.sources.length, "source")} and ` +
          `${count(result.open_questions.length, "open question")}.`,
      );
      line(
        io,
        `Overall confidence: ${result.confidence.rating} (${result.confidence.score} of 100).`,
      );
      line(io, `Written to ${result.file}`);
      if (result.docx_file) line(io, `Word copy: ${result.docx_file}`);
      if (result.html_file) line(io, `Web page (print to PDF): ${result.html_file}`);
    });
}
