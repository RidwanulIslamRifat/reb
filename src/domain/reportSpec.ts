import { z } from "zod";
import { ReportTypeSchema } from "./brief.js";
import { RebError } from "./errors.js";
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
 * reports/specs/<type>.json (ROADMAP decision 17): the sections of one report type and the node
 * types each section needs. The auditor uses it now; the report templates in M9 read it too.
 */
export const ReportSpecSchema = z.object({
  report: ReportTypeSchema,
  title: z.string().min(1),
  sections: z
    .array(
      z.object({
        id: z.string().min(1),
        title: z.string().min(1),
        needs: z.array(SectionNeedSchema).default([]),
      }),
    )
    .min(1),
});
export type ReportSpec = z.infer<typeof ReportSpecSchema>;

export function parseReportSpec(data: unknown, where: string): ReportSpec {
  const result = ReportSpecSchema.safeParse(data);
  if (!result.success) {
    throw new RebError(
      `The report spec ${where} is not valid: ${describeIssues(result.error)}.`,
      "Fix the report spec file, or reinstall reb to restore it.",
    );
  }
  return result.data;
}
