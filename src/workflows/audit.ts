import {
  AuditRecordSchema,
  findGaps,
  questionIdFor,
  renderAudit,
  stopRule,
  type AuditRecord,
  type Gap,
} from "../domain/audit.js";
import { RebError } from "../domain/errors.js";
import { renderNode } from "../domain/node.js";
import { focusNotePath } from "../domain/pipeline.js";
import { describeIssues } from "../domain/plan.js";
import { validateGraph } from "../domain/validation.js";
import {
  auditMarkdownPath,
  listAuditNumbers,
  readAuditData,
  rewriteAudit,
  withAuditLock,
  writeNewAudit,
} from "../storage/auditFiles.js";
import { readNodeText, withGraphLock, writeNodeText } from "../storage/nodeFiles.js";
import { existingRunFiles, type RunPaths } from "../storage/runFolder.js";
import type { Context } from "./context.js";
import { loadGraph } from "./graph.js";
import { logged } from "./logging.js";
import { requirePlan } from "./plan.js";
import { readBrief, resolveRun } from "./runs.js";
import { loadReportSpecs } from "./specs.js";

/** Reads logs/audits/audit-<n>.json. */
export async function loadAudit(paths: RunPaths, n: number): Promise<AuditRecord> {
  const text = await readAuditData(paths, n);
  const where = `logs/audits/audit-${n}.json`;
  if (text === null) {
    throw new RebError(`There is no audit ${n} in this run.`, 'Run an audit first: "reb audit".');
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new RebError(`${where} is not valid JSON.`, "Restore the file, or run a new audit.");
  }
  const result = AuditRecordSchema.safeParse(data);
  if (!result.success) {
    throw new RebError(
      `${where} is not valid: ${describeIssues(result.error)}.`,
      "Restore the file, or run a new audit.",
    );
  }
  return result.data;
}

/** Every audit of a run, oldest first. */
export async function loadAudits(paths: RunPaths): Promise<AuditRecord[]> {
  const numbers = await listAuditNumbers(paths);
  return Promise.all(numbers.map((n) => loadAudit(paths, n)));
}

/** Re-plan rounds done so far: audits that apply_replan turned into a new plan version. */
export const roundsDone = (audits: AuditRecord[]) =>
  audits.filter((a) => a.replanned_in !== null).length;

/** Writes an audit's .md and .json again after a change (for example after a re-plan). */
export async function saveAudit(paths: RunPaths, audit: AuditRecord, product: string) {
  await rewriteAudit(
    paths,
    audit.number,
    renderAudit(audit, product),
    JSON.stringify(audit, null, 2) + "\n",
  );
}

/** Stop rule: each remaining gap becomes an open question node (SPEC 8). Existing ones are kept. */
async function gapsToQuestions(paths: RunPaths, audit: number, gaps: Gap[]): Promise<string[]> {
  return withGraphLock(paths, async () => {
    const ids: string[] = [];
    for (const gap of gaps) {
      const id = questionIdFor(audit, gap.n);
      ids.push(id);
      if ((await readNodeText(paths, id)) !== null) continue;
      const body =
        `\n# ${gap.summary}\n\n${gap.detail}\n\n` +
        `Open after audit ${audit} (gap ${gap.n}, ${gap.severity}). ` +
        `Suggested next step for a later analysis: ${gap.suggested_task.title} (${gap.suggested_task.role}).\n`;
      await writeNodeText(
        paths,
        id,
        renderNode({
          meta: {
            id,
            type: "question",
            name: `Audit ${audit} gap ${gap.n}: ${gap.summary}`,
            label: "unknown",
            links: {},
          },
          body,
        }),
      );
    }
    return ids;
  });
}

/**
 * run_audit (SPEC 8): compares the graph and the focus-answer drafts with the brief's focus
 * questions, the requested report specs and validate_graph. Writes logs/audits/audit-<N>.md
 * (and .json) with numbered gaps, severity and a suggested task each, and applies the stop rule.
 */
export async function runAudit(ctx: Context, input: { run?: string } = {}) {
  const run = await resolveRun(ctx, input.run);
  return logged(ctx, "run_audit", run, {}, async () => {
    const { brief } = await readBrief(run);
    const { plan } = await requirePlan(run);
    const specs = await loadReportSpecs(brief.reports.length ? brief.reports : plan.reports);
    const graph = await loadGraph(run.paths);
    const files = await existingRunFiles(
      run.paths,
      brief.focus_questions.map((_, i) => focusNotePath(i + 1)),
    );
    return withAuditLock(run.paths, async () => {
      const audits = await loadAudits(run.paths);
      const number = (audits.at(-1)?.number ?? 0) + 1;
      const rounds = roundsDone(audits);
      const gaps = findGaps({
        number,
        brief,
        specs,
        nodes: graph.nodes.map((n) => n.meta),
        records: graph.records,
        problems: validateGraph(graph),
        files,
      });
      const { stop, reason } = stopRule(gaps, rounds);
      const questions = stop && gaps.length ? await gapsToQuestions(run.paths, number, gaps) : [];
      const audit: AuditRecord = {
        number,
        at: ctx.now().toISOString(),
        plan_version: plan.version,
        rounds_before: rounds,
        gaps,
        stop,
        stop_reason: reason,
        replanned_in: null,
        questions,
      };
      await writeNewAudit(
        run.paths,
        number,
        renderAudit(audit, brief.product),
        JSON.stringify(audit, null, 2) + "\n",
      );
      return { ...run, audit, file: auditMarkdownPath(run.paths, number) };
    });
  });
}
