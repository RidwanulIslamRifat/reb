import type { ReportType } from "../domain/brief.js";
import { RebError } from "../domain/errors.js";
import { CATEGORIES, CategorySchema, parsePipeline, type Pipeline } from "../domain/pipeline.js";
import { parseReportSpec, type ReportSpec } from "../domain/reportSpec.js";
import { readPipelineText, readReportSpecText } from "../storage/packageFiles.js";

function parseJson(text: string, where: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new RebError(`${where} is not valid JSON.`, "Reinstall reb to restore the file.");
  }
}

/** The pipeline for a brief category (SPEC 8), with a clear error when there is none. */
export async function loadPipeline(category: string): Promise<Pipeline> {
  const known = CategorySchema.safeParse(category.trim().toLowerCase());
  if (!known.success) {
    throw new RebError(
      category.trim()
        ? `There is no pipeline for the category "${category}".`
        : "The brief has no category, so reb cannot pick a pipeline.",
      `Set the brief's category to one of: ${CATEGORIES.join(", ")} (update_brief, or edit brief.md).`,
    );
  }
  const where = `pipelines/${known.data}.json`;
  const text = await readPipelineText(known.data);
  if (text === null) {
    throw new RebError(`The file ${where} is missing from this copy of reb.`, "Reinstall reb.");
  }
  return parsePipeline(parseJson(text, where), where);
}

/** The report specs (ROADMAP decision 17) of the given report types, in that order. */
export async function loadReportSpecs(reports: readonly ReportType[]): Promise<ReportSpec[]> {
  return Promise.all(
    reports.map(async (report) => {
      const where = `reports/specs/${report}.json`;
      const text = await readReportSpecText(report);
      if (text === null) {
        throw new RebError(`The file ${where} is missing from this copy of reb.`, "Reinstall reb.");
      }
      return parseReportSpec(parseJson(text, where), where);
    }),
  );
}
