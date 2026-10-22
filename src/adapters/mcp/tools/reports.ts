import { z } from "zod";
import { REPORT_TYPES } from "../../../domain/brief.js";
import { renderReport } from "../../../workflows/renderReport.js";
import { runArg, tool } from "./common.js";

export const reportTools = [
  tool({
    name: "render_report",
    description:
      "Write reports/<report>.md (with docx: true also a Word copy, with html: true also a print-ready web " +
      "page, both with a title page) from the knowledge graph, the evidence ledger and your draft in " +
      "notes/report-<report>.md. reb writes Report details (with an overall confidence rating) and Scope " +
      "and methodology first; then your Executive summary; then the sections of reports/templates/<report>.md, " +
      "each with your draft text, framework views (SWOT, risk register ...) and the graph's nodes with labels " +
      "and evidence; then Limitations and disclaimer, Sources and Open questions. Every claim in the draft " +
      "must cite node ids or E-/S- ids in [brackets]; if one does not, or cites an id that does not exist, " +
      "nothing is written and the problems are listed with line numbers.",
    input: {
      run: runArg,
      report: z
        .enum(REPORT_TYPES)
        .describe(
          "Which report: business, feature, market, build, due_diligence, risk, strategy, technical, rebuild or requirements.",
        ),
      docx: z.boolean().optional().describe("Also write reports/<report>.docx. Default false."),
      html: z
        .boolean()
        .optional()
        .describe("Also write reports/<report>.html, ready to print to PDF. Default false."),
    },
    call: (ctx, args) => renderReport(ctx, args),
  }),
];
