import {
  BriefSchema,
  BriefUpdateSchema,
  parseBrief,
  renderBrief,
  type Brief,
} from "../domain/brief.js";
import { RebError } from "../domain/errors.js";
import { describeIssues, parsePlan } from "../domain/plan.js";
import { normalizeDomain, runSlug } from "../domain/run.js";
import { readBriefText, writeBriefText } from "../storage/briefFile.js";
import { readPlanText } from "../storage/planFiles.js";
import { createRunFolder, listRunFolders, openRunFolder } from "../storage/runFolder.js";
import type { Context } from "./context.js";
import { logged, type RunRef } from "./logging.js";

export interface ResolvedRun extends RunRef {
  /** True when no run was named and reb picked the most recently changed one (ROADMAP decision 3). */
  defaulted: boolean;
}

/** Finds the run a call works on: the one named, or else the most recently changed one. */
export async function resolveRun(ctx: Context, slug?: string): Promise<ResolvedRun> {
  if (slug) return { ...(await openRunFolder(ctx.root, slug)), defaulted: false };
  const [latest] = await listRunFolders(ctx.root);
  if (!latest) {
    throw new RebError(
      `There are no runs in ${ctx.root} yet.`,
      'Create one with "reb new <domain>", for example: reb new example.com',
    );
  }
  return { slug: latest.slug, paths: latest.paths, defaulted: true };
}

function checkBrief(data: unknown): Brief {
  const result = BriefSchema.safeParse(data);
  if (!result.success) {
    throw new RebError(
      `The brief is not valid: ${describeIssues(result.error)}.`,
      'Check the values. "reports" can only hold business, feature, market and build.',
    );
  }
  return result.data;
}

/** create_run: makes the run folder (SPEC 5) and its brief.md. */
export async function createRun(
  ctx: Context,
  input: {
    domain: string;
    category?: string;
    reports?: string[];
    focus_questions?: string[];
    plan_tier?: string;
    deadline?: string;
  },
) {
  const { domain: typed, ...rest } = input;
  const domain = normalizeDomain(typed);
  const brief = checkBrief({ product: domain, url: `https://${domain}`, ...rest });
  const { slug, paths } = await createRunFolder(ctx.root, runSlug(domain, ctx.now()));
  return logged(ctx, "create_run", { slug, paths }, { ...input }, async () => {
    await writeBriefText(paths, renderBrief(brief));
    return { slug, paths, brief };
  });
}

export async function readBrief(run: RunRef) {
  const text = await readBriefText(run.paths);
  try {
    if (text === null) throw new Error("the file is missing");
    return parseBrief(text);
  } catch (error) {
    throw new RebError(
      `${run.paths.brief} cannot be read: ${(error as Error).message}.`,
      "Open brief.md and fix the values between the --- lines.",
    );
  }
}

/** get_brief */
export async function getBrief(ctx: Context, input: { run?: string } = {}) {
  const run = await resolveRun(ctx, input.run);
  return logged(ctx, "get_brief", run, {}, async () => ({ ...run, ...(await readBrief(run)) }));
}

/** update_brief: changes some brief values and keeps the notes the analyst wrote. */
export async function updateBrief(ctx: Context, input: { run?: string; changes: unknown }) {
  const run = await resolveRun(ctx, input.run);
  return logged(ctx, "update_brief", run, { changes: input.changes }, async () => {
    const changes = BriefUpdateSchema.safeParse(input.changes);
    if (!changes.success) {
      throw new RebError(
        `The brief changes are not valid: ${describeIssues(changes.error)}.`,
        "Check the field names and values against the brief template.",
      );
    }
    const { brief, notes } = await readBrief(run);
    const updated = checkBrief({ ...brief, ...stripUndefined(changes.data) });
    await writeBriefText(run.paths, renderBrief(updated, notes));
    return { ...run, brief: updated };
  });
}

function stripUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;
}

/**
 * list_runs: every run, most recently changed first.
 * It works on no single run, so there is no run event log to write to.
 */
export async function listRuns(ctx: Context) {
  const runs = await listRunFolders(ctx.root);
  return Promise.all(
    runs.map(async (run) => {
      let product: string;
      let planVersion: number | null = null;
      let tasks = 0;
      try {
        product = (await readBrief(run)).brief.product;
      } catch {
        product = "(brief.md cannot be read)";
      }
      const planText = await readPlanText(run.paths);
      if (planText !== null) {
        try {
          const plan = parsePlan(JSON.parse(planText), run.paths.plan);
          planVersion = plan.version;
          tasks = plan.tasks.length;
        } catch {
          planVersion = null;
        }
      }
      return {
        slug: run.slug,
        dir: run.paths.dir,
        changedAt: run.changedAt,
        product,
        planVersion,
        tasks,
      };
    }),
  );
}
