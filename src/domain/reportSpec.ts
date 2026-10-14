import { z } from "zod";
import { ReportTypeSchema } from "./brief.js";
import { RebError } from "./errors.js";
import { FrameworkSchema } from "./frameworks.js";
import { splitFrontMatter } from "./handbook.js";
import { NodeTypeSchema } from "./links.js";
import { describeIssues } from "./plan.js";

export const SEVERITIES = ["blocking", "major", "minor"] as const;
export const SeveritySchema = z.enum(SEVERITIES);
export type Severity = z.infer<typeof SeveritySchema>;

/**
 * What a report section needs from the graph: at least `min` nodes of `type`, and with
 * `evidence`, each of them backed by evidence. `severity` is how bad it is when there are none.
 */
export const SectionNeedSchema = z.object({
  type: NodeTypeSchema,
  min: z.number().int().min(1),
  evidence: z.boolean().default(false),
  severity: SeveritySchema.default("blocking"),
});
export type SectionNeed = z.infer<typeof SectionNeedSchema>;

/**
 * The front matter of reports/templates/<type>.md (SPEC 11): the sections of one report type,
 * what each is about, and the node types each section needs. The auditor (run_audit) and
 * render_report both read it, so the report and the audit always agree.
 */
export const ReportSpecSchema = z.object({
  report: ReportTypeSchema,
  title: z.string().min(1),
  sections: z
    .array(
      z.object({
        id: z.string().regex(/^[a-z0-9-]+$/, "use lowercase letters, digits and dashes"),
        title: z.string().min(1),
        about: z.string().default(""),
        needs: z.array(SectionNeedSchema).default([]),
        /** Framework views shown in the section (v2), for example [risk_register]. */
        views: z.array(FrameworkSchema).default([]),
        /** List the needed node types one by one; false when the views already show them. */
        list: z.boolean().default(true),
      }),
    )
    .min(1),
});
export type ReportSpec = z.infer<typeof ReportSpecSchema>;

/** A report template: its spec, plus the introduction (the Markdown body; `{product}` is filled in). */
export type ReportTemplate = ReportSpec & { intro: string };

export function parseReportSpec(data: unknown, where: string): ReportSpec {
  const result = ReportSpecSchema.safeParse(data);
  if (!result.success) {
    throw new RebError(
      `The report template ${where} is not valid: ${describeIssues(result.error)}.`,
      "Fix the report template file, or reinstall reb to restore it.",
    );
  }
  const ids = result.data.sections.map((s) => s.id);
  const twice = ids.find((id, i) => ids.indexOf(id) !== i);
  if (twice) {
    throw new RebError(
      `The report template ${where} has two sections with the id "${twice}".`,
      "Give every section its own id.",
    );
  }
  return result.data;
}

/** Reads reports/templates/<type>.md: YAML front matter (the spec) and a Markdown introduction. */
export function parseReportTemplate(text: string, where: string): ReportTemplate {
  let split: { data: unknown; body: string };
  try {
    split = splitFrontMatter(text.replace(/\r\n/g, "\n"));
  } catch (error) {
    throw new RebError(
      `The report template ${where} cannot be read: ${(error as Error).message}.`,
      "Fix the report template file, or reinstall reb to restore it.",
    );
  }
  return { ...parseReportSpec(split.data, where), intro: split.body.trim() };
}
