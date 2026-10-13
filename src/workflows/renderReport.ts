import { REPORT_TYPES, ReportTypeSchema, type ReportType } from "../domain/brief.js";
import { RebError } from "../domain/errors.js";
import {
  citationProblems,
  parseReportDraft,
  renderReport as renderReportMarkdown,
  reportDraftPath,
} from "../domain/report.js";
import { localDate } from "../domain/run.js";
import { readRunFileText, writeReportFiles } from "../storage/reportFiles.js";
import type { Context } from "./context.js";
import { loadGraph } from "./graph.js";
import { logged } from "./logging.js";
import { readBrief, resolveRun } from "./runs.js";
import { loadReportTemplates } from "./specs.js";

/**
 * render_report (SPEC 9, 11): turns the graph, the evidence ledger and the report_writer's draft
 * (notes/report-<type>.md, optional) into reports/<type>.md, and with `docx` also a Word file.
 * Fails with a list when the draft has a claim without a citation, cites an id that does not
 * exist, or uses a heading that is not a section of the report.
 */
export async function renderReport(
  ctx: Context,
  input: { run?: string; report: string; docx?: boolean },
) {
  const run = await resolveRun(ctx, input.run);
  return logged(
    ctx,
    "render_report",
    run,
    { report: input.report, docx: input.docx ?? false },
    async () => {
      const parsed = ReportTypeSchema.safeParse(input.report.trim().toLowerCase());
      if (!parsed.success) {
        throw new RebError(
          `"${input.report}" is not a report type.`,
          `Use one of: ${REPORT_TYPES.join(", ")}.`,
        );
      }
      const report: ReportType = parsed.data;
      const { brief } = await readBrief(run);
      const [template] = await loadReportTemplates([report]);
      const graph = await loadGraph(run.paths);
      const draftFile = reportDraftPath(report);
      const draftText = await readRunFileText(run.paths, draftFile);
      const draft = draftText === null ? null : parseReportDraft(draftText, template!);
      if (draft && draftText !== null) {
        const problems = [
          ...draft.problems,
          ...citationProblems(draftText, {
            nodes: new Set(graph.nodes.map((n) => n.meta.id)),
            ledger: new Set(graph.records.map((r) => r.id)),
          }),
        ];
        if (problems.length) {
          throw new RebError(
            `The ${report} report was not written: ${draftFile} has ${problems.length} ` +
              `problem${problems.length === 1 ? "" : "s"}:\n` +
              problems.map((p) => `  - ${p}`).join("\n"),
            "Add a citation in [brackets] to every claim, for example [feature-sso, E-004], using " +
              "node ids from the graph and E-/S- ids from the ledger; then render again.",
          );
        }
      }
      const rendered = renderReportMarkdown({
        template: template!,
        product: brief.product,
        slug: run.slug,
        date: localDate(ctx.now()),
        nodes: graph.nodes,
        records: graph.records,
        draft,
      });
      const files = await writeReportFiles(
        run.paths,
        report,
        rendered.markdown,
        input.docx ?? false,
      );
      const warnings: string[] = [];
      if (brief.reports.length && !brief.reports.includes(report)) {
        warnings.push(
          `The brief does not ask for a ${report} report (it asks for: ${brief.reports.join(", ")}).`,
        );
      }
      if (draft === null) {
        warnings.push(
          `There is no ${draftFile}, so the report holds only what the graph says. ` +
            "The report_writer adds summaries and explanations there.",
        );
      }
      if (graph.badFiles.length) {
        warnings.push(
          `${graph.badFiles.length} node file(s) could not be read and are left out: ` +
            graph.badFiles.map((b) => b.file).join(", "),
        );
      }
      return {
        ...run,
        report,
        file: files.markdown,
        docx_file: files.docx,
        draft: draft === null ? null : draftFile,
        sections: template!.sections.map((s) => s.title),
        citations: rendered.citations.length,
        sources: rendered.sources,
        open_questions: rendered.openQuestions.map((q) => q.replace(/^- /, "")),
        unmet_needs: rendered.unmet,
        warnings,
      };
    },
  );
}
