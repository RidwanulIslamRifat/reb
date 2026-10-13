import { briefWarnings } from "../domain/brief.js";
import { RebError } from "../domain/errors.js";
import { adaptPipeline } from "../domain/pipeline.js";
import { withPlanLock } from "../storage/planFiles.js";
import type { Context } from "./context.js";
import { logged } from "./logging.js";
import { readCurrentPlan, storeNewVersion } from "./plan.js";
import { readBrief, resolveRun } from "./runs.js";
import { loadPipeline } from "./specs.js";

/**
 * create_plan (SPEC 8): picks the pipeline for the brief's category, keeps the tasks the
 * requested reports need, adds one task per focus question, and saves it as the first plan.
 * A run that already has a plan is changed with apply_replan (or save_plan) instead.
 */
export async function createPlan(ctx: Context, input: { run?: string } = {}) {
  const run = await resolveRun(ctx, input.run);
  return logged(ctx, "create_plan", run, {}, async () => {
    const { brief, notes } = await readBrief(run);
    const pipeline = await loadPipeline(brief.category);
    if (brief.reports.length === 0) {
      throw new RebError(
        "The brief asks for no reports, so there is nothing to plan for.",
        'Set the brief\'s reports, for example ["business", "feature"] (update_brief, or edit brief.md).',
      );
    }
    const tasks = adaptPipeline(pipeline, brief);
    return withPlanLock(run.paths, async () => {
      const previous = await readCurrentPlan(run);
      if (previous) {
        throw new RebError(
          `Run "${run.slug}" already has plan v${previous.plan.version}.`,
          "Change it with apply_replan after an audit (reb plan replan), or save a whole plan with save_plan.",
        );
      }
      const plan = await storeNewVersion(
        ctx,
        run,
        null,
        {
          product: brief.product,
          pipeline: pipeline.id,
          reports: brief.reports,
          tasks: tasks.map((t) => ({ ...t, status: "pending", added_in: 1 })),
        },
        [
          {
            change: `plan created from pipeline ${pipeline.id} with ${tasks.length} tasks`,
            reason:
              `brief category ${pipeline.id}, reports ${brief.reports.join(", ")}` +
              (brief.focus_questions.length
                ? `, ${brief.focus_questions.length} focus question(s)`
                : ""),
          },
        ],
      );
      return { ...run, plan, warnings: briefWarnings(brief, notes) };
    });
  });
}
