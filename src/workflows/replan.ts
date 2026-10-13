import { MAX_REPLAN_ROUNDS } from "../domain/audit.js";
import { RebError } from "../domain/errors.js";
import { describeIssues } from "../domain/plan.js";
import { applyReplanChanges, defaultChanges, ReplanChangeSchema } from "../domain/replan.js";
import { withAuditLock } from "../storage/auditFiles.js";
import { readTextIfExists } from "../storage/jsonl.js";
import { withPlanLock } from "../storage/planFiles.js";
import { loadAudits, roundsDone, saveAudit } from "./audit.js";
import type { Context } from "./context.js";
import { logged } from "./logging.js";
import { requirePlan, storeNewVersion } from "./plan.js";
import { resolveRun } from "./runs.js";

/**
 * apply_replan (SPEC 8): changes the plan after the latest audit. Without `changes`, it adds the
 * suggested task of every blocking and major gap. Makes one new plan version and writes one line
 * per change to logs/decisions.md citing the audit item. Refuses after 3 rounds (stop rule).
 */
export async function applyReplan(
  ctx: Context,
  input: { run?: string; audit?: number; changes?: unknown[] },
) {
  const run = await resolveRun(ctx, input.run);
  const args = { audit: input.audit, changes: input.changes?.length ?? "default" };
  return logged(ctx, "apply_replan", run, args, async () => {
    return withAuditLock(run.paths, () =>
      withPlanLock(run.paths, async () => {
        const audits = await loadAudits(run.paths);
        const latest = audits.at(-1);
        if (!latest) {
          throw new RebError("This run has no audit yet.", 'Run one first: "reb audit".');
        }
        const audit =
          input.audit === undefined ? latest : audits.find((a) => a.number === input.audit);
        if (!audit) {
          throw new RebError(
            `There is no audit ${input.audit} in this run.`,
            `Use the latest audit, ${latest.number}.`,
          );
        }
        if (audit.number !== latest.number) {
          throw new RebError(
            `Audit ${audit.number} is not the latest; audit ${latest.number} is newer.`,
            `Re-plan from audit ${latest.number}.`,
          );
        }
        if (audit.replanned_in !== null) {
          throw new RebError(
            `Audit ${audit.number} was already re-planned in plan v${audit.replanned_in}.`,
            'Work the new tasks, then run a new audit ("reb audit").',
          );
        }
        const rounds = roundsDone(audits);
        if (rounds >= MAX_REPLAN_ROUNDS) {
          throw new RebError(
            `${MAX_REPLAN_ROUNDS} re-plan rounds are done, so the stop rule applies.`,
            "Stop re-planning: the audit turned the remaining gaps into question nodes. Write the reports.",
          );
        }
        let changes = defaultChanges(audit);
        if (input.changes !== undefined) {
          const parsed = ReplanChangeSchema.array().safeParse(input.changes);
          if (!parsed.success) {
            throw new RebError(
              `The re-plan changes are not valid: ${describeIssues(parsed.error)}.`,
              'Each change needs "op" (add, split, reorder or drop) and "gap" (the audit item number).',
            );
          }
          changes = parsed.data;
        }
        const previous = await requirePlan(run);
        const version = previous.plan.version + 1;
        const { tasks, decisions } = applyReplanChanges(previous.plan, audit, changes, version);
        const plan = await storeNewVersion(
          ctx,
          run,
          previous,
          { ...previous.plan, tasks },
          decisions,
        );
        const updated = { ...audit, replanned_in: plan.version };
        await saveAudit(run.paths, updated, plan.product);
        return { ...run, plan, audit: updated, round: rounds + 1, decisions };
      }),
    );
  });
}

/** Reads a JSON list of re-plan changes. */
export function parseChangesText(text: string, where: string): unknown[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new RebError(
      `${where} is not valid JSON.`,
      "Check the file for a missing comma or quote.",
    );
  }
  if (!Array.isArray(data)) {
    throw new RebError(
      `${where} must hold a list of changes.`,
      'Write a JSON list, for example [{"op": "add", "gap": 1}].',
    );
  }
  return data;
}

/** apply_replan with the changes in a JSON file (for `reb plan replan --changes <file>`). */
export async function applyReplanFromFile(
  ctx: Context,
  input: { run?: string; audit?: number; file: string },
) {
  const text = await readTextIfExists(input.file);
  if (text === null) {
    throw new RebError(`There is no file ${input.file}.`, "Check the path to the changes file.");
  }
  const changes = parseChangesText(text, input.file);
  return applyReplan(ctx, { run: input.run, audit: input.audit, changes });
}
