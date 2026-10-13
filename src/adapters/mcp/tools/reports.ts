import { z } from "zod";
import { REPORT_TYPES } from "../../../domain/brief.js";
import { renderReport } from "../../../workflows/renderReport.js";
import { runArg, tool } from "./common.js";

export const reportTools = [
  tool({
    name: "render_report",
    description:
      "Write reports/<report>.md (and with docx: true a Word copy) from the knowledge graph, the evidence " +
      "ledger and your draft in notes/report-<report>.md. Sections follow reports/templates/<report>.md; each " +
      "lists the graph's nodes with labels, links and evidence, after your draft text for that section. " +
      "Every claim in the draft must cite node ids or E-/S- ids in [brackets]; if one does not, or cites an " +
      "id that does not exist, nothing is written and the problems are listed with line numbers. " +
      "The report ends with Sources and Open questions.",
    input: {
      run: runArg,
      report: z.enum(REPORT_TYPES).describe("Which report: business, feature, market or build."),
      docx: z.boolean().optional().describe("Also write reports/<report>.docx. Default false."),
    },
    call: (ctx, args) => renderReport(ctx, args),
  }),
];
