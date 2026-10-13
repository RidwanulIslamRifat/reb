import { correctionsOf, type LedgerRecord } from "../domain/evidence.js";
import { RebError } from "../domain/errors.js";
import { parseDecisions, parseRoleLog } from "../domain/event.js";
import { EventSchema } from "../domain/event.js";
import { shortestPath } from "../domain/graphPath.js";
import { linksOf } from "../domain/node.js";
import { parsePlan, RoleSchema, type Plan } from "../domain/plan.js";
import { diffPlans } from "../domain/planDiff.js";
import { validateGraph } from "../domain/validation.js";
import { readJsonLines } from "../storage/jsonl.js";
import { readLedger } from "../storage/ledger.js";
import { listRunFolders, openRunFolder } from "../storage/runFolder.js";
import {
  listPlanHistoryVersions,
  listReportFiles,
  readDecisionsText,
  readPlanHistoryText,
  readReportText,
  readRoleLogs,
} from "../storage/viewFiles.js";
import { loadAudits } from "./audit.js";
import type { Context } from "./context.js";
import { describeNode, loadGraph } from "./graph.js";
import type { RunRef } from "./logging.js";
import { readCurrentPlan } from "./plan.js";
import { readBrief, resolveRun } from "./runs.js";

/*
 * Read-only views of run folders for the dashboard (SPEC 10). Nothing here writes a file,
 * and none of it is logged: looking at a run never changes it.
 */

/** Where the dashboard looks for runs: the runs root, plus run folders named on the command line. */
export interface ViewScope {
  root: string;
  pinned: RunRef[];
}

/** Run names in addresses are plain folder names, never paths. */
const SLUG = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export async function findRun(scope: ViewScope, slug: string): Promise<RunRef> {
  const pinned = scope.pinned.find((r) => r.slug === slug);
  if (pinned) return pinned;
  if (!SLUG.test(slug) || slug.includes("..")) {
    throw new RebError(`"${slug}" is not a run name.`, "Pick a run from the runs list.");
  }
  return openRunFolder(scope.root, slug);
}

async function summarize(run: RunRef, changedAt: Date | null) {
  let product = run.slug;
  let url = "";
  let briefProblem: string | null = null;
  try {
    const { brief } = await readBrief(run);
    product = brief.product;
    url = brief.url;
  } catch (error) {
    briefProblem = (error as Error).message;
  }
  let planVersion: number | null = null;
  let tasks = 0;
  let done = 0;
  try {
    const plan = (await readCurrentPlan(run))?.plan;
    if (plan) {
      planVersion = plan.version;
      tasks = plan.tasks.length;
      done = plan.tasks.filter((t) => t.status === "done").length;
    }
  } catch {
    planVersion = null;
  }
  return {
    slug: run.slug,
    folder: run.paths.dir,
    product,
    url,
    changed_at: changedAt?.toISOString() ?? null,
    plan_version: planVersion,
    tasks,
    tasks_done: done,
    brief_problem: briefProblem,
  };
}

/** Every run, most recently changed first; runs named on the command line come first. */
export async function viewRuns(scope: ViewScope) {
  const pinnedSlugs = new Set(scope.pinned.map((r) => r.slug));
  const folders = (await listRunFolders(scope.root)).filter((f) => !pinnedSlugs.has(f.slug));
  const runs = await Promise.all([
    ...scope.pinned.map((r) => summarize(r, null)),
    ...folders.map((f) => summarize({ slug: f.slug, paths: f.paths }, f.changedAt)),
  ]);
  return { root: scope.root, runs };
}

/** The brief and a one-line count of everything in the run. */
export async function viewRun(scope: ViewScope, slug: string) {
  const run = await findRun(scope, slug);
  const { brief, notes } = await readBrief(run);
  const graph = await loadGraph(run.paths);
  const reports = await listReportFiles(run.paths);
  return {
    ...(await summarize(run, null)),
    brief,
    notes,
    counts: {
      nodes: graph.nodes.length,
      evidence: graph.records.filter((r) => r.kind === "evidence").length,
      sources: graph.records.filter((r) => r.kind === "source").length,
      reports: reports.length,
    },
  };
}

async function planAt(run: RunRef, version: number): Promise<Plan> {
  const current = await readCurrentPlan(run);
  if (current?.plan.version === version) return current.plan;
  const text = await readPlanHistoryText(run.paths, version);
  if (text === null) {
    throw new RebError(
      `Run "${run.slug}" has no plan version ${version}.`,
      "Pick a version from the list on the plan page.",
    );
  }
  try {
    return parsePlan(JSON.parse(text), run.paths.planVersion(version));
  } catch (error) {
    if (error instanceof RebError) throw error;
    throw new RebError(
      `${run.paths.planVersion(version)} is not valid JSON.`,
      "This history file was changed by hand; restore it from a backup.",
    );
  }
}

/** The current plan, every earlier version number, and the reason for each plan change. */
export async function viewPlan(scope: ViewScope, slug: string, version?: number) {
  const run = await findRun(scope, slug);
  const current = await readCurrentPlan(run);
  const history = await listPlanHistoryVersions(run.paths);
  const versions = [...new Set([...history, ...(current ? [current.plan.version] : [])])].sort(
    (a, b) => b - a,
  );
  const decisions = parseDecisions((await readDecisionsText(run.paths)) ?? "");
  const plan =
    version === undefined || version === current?.plan.version
      ? (current?.plan ?? null)
      : await planAt(run, version);
  return {
    slug: run.slug,
    current_version: current?.plan.version ?? null,
    versions,
    plan,
    decisions,
  };
}

/** What changed between two plan versions. */
export async function viewPlanDiff(scope: ViewScope, slug: string, from: number, to: number) {
  const run = await findRun(scope, slug);
  const [older, newer] = await Promise.all([planAt(run, from), planAt(run, to)]);
  const decisions = parseDecisions((await readDecisionsText(run.paths)) ?? "").filter(
    (d) => d.plan_version > Math.min(from, to) && d.plan_version <= Math.max(from, to),
  );
  return { slug: run.slug, diff: diffPlans(older, newer), decisions };
}

function evidenceCounts(
  records: LedgerRecord[],
  nodes: Awaited<ReturnType<typeof loadGraph>>["nodes"],
) {
  const counts = new Map<string, number>();
  for (const n of nodes) {
    const linked = new Set(n.meta.links.evidence ?? []);
    counts.set(
      n.meta.id,
      records.filter((r) => linked.has(r.id) || (r.kind === "evidence" && r.subject === n.meta.id))
        .length,
    );
  }
  return counts;
}

/** Nodes and the links between them (evidence links are counted, not drawn). */
export async function viewGraph(scope: ViewScope, slug: string) {
  const run = await findRun(scope, slug);
  const input = await loadGraph(run.paths);
  const counts = evidenceCounts(input.records, input.nodes);
  const ids = new Set(input.nodes.map((n) => n.meta.id));
  const nodes = input.nodes
    .map(({ meta }) => ({
      id: meta.id,
      type: meta.type,
      name: meta.name,
      label: meta.label,
      evidence: counts.get(meta.id) ?? 0,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const edges = input.nodes.flatMap(({ meta }) =>
    linksOf(meta)
      .filter((l) => l.type !== "evidence" && ids.has(l.to))
      .map((l) => ({ from: meta.id, type: l.type, to: l.to })),
  );
  return {
    slug: run.slug,
    nodes,
    edges,
    problems: validateGraph(input).length,
    unreadable: input.badFiles,
  };
}

/** One node's card: its links both ways and its evidence. */
export async function viewNode(scope: ViewScope, slug: string, id: string) {
  const run = await findRun(scope, slug);
  return { slug: run.slug, ...(await describeNode(run.paths, id)) };
}

/** The shortest chain of links between two nodes. */
export async function viewPath(scope: ViewScope, slug: string, from: string, to: string) {
  const { nodes, edges } = await viewGraph(scope, slug);
  const path = shortestPath(
    nodes.map((n) => n.id),
    edges,
    from,
    to,
  );
  return {
    slug,
    from,
    to,
    found: path !== null,
    nodes: path?.nodes ?? [],
    edges: path?.edges ?? [],
  };
}

/** Every ledger record, oldest first, with what it is about and whether a newer record replaced it. */
export async function viewEvidence(scope: ViewScope, slug: string) {
  const run = await findRun(scope, slug);
  const records = await readLedger(run.paths);
  const corrected = correctionsOf(records);
  const names = new Map((await loadGraph(run.paths)).nodes.map((n) => [n.meta.id, n.meta.name]));
  return {
    slug: run.slug,
    records: records.map((r) => ({
      ...r,
      corrected_by: corrected.get(r.id) ?? null,
      subject_name: r.kind === "evidence" ? (names.get(r.subject) ?? null) : null,
    })),
  };
}

/** One entry on the logs timeline. */
export type TimelineEntry =
  | {
      kind: "tool";
      at: string;
      tool: string;
      via: string;
      ok: boolean;
      error?: string;
      args: Record<string, unknown>;
    }
  | { kind: "plan"; at: string; plan_version: number; change: string; reason: string }
  | { kind: "role"; at: string; role: string; task?: string; summary: string }
  | {
      kind: "audit";
      at: string;
      number: number;
      gaps: Array<{ n: number; severity: string; summary: string }>;
      stop: boolean;
      stop_reason: string;
    };

/** Tool calls, plan changes, role work notes and audits, oldest first. */
export async function viewLogs(scope: ViewScope, slug: string) {
  const run = await findRun(scope, slug);
  const entries: TimelineEntry[] = [];
  for (const line of await readJsonLines(run.paths.events)) {
    const event = EventSchema.safeParse(line);
    if (!event.success) continue;
    const { at, tool, via, ok, error, args } = event.data;
    entries.push({ kind: "tool", at, tool, via, ok, ...(error ? { error } : {}), args });
  }
  for (const d of parseDecisions((await readDecisionsText(run.paths)) ?? "")) {
    entries.push({ kind: "plan", ...d });
  }
  for (const { role, text } of await readRoleLogs(run.paths)) {
    const parsed = RoleSchema.safeParse(role);
    if (!parsed.success) continue;
    for (const e of parseRoleLog(text, parsed.data)) entries.push({ kind: "role", ...e });
  }
  for (const a of await loadAudits(run.paths).catch(() => [])) {
    entries.push({
      kind: "audit",
      at: a.at,
      number: a.number,
      gaps: a.gaps.map(({ n, severity, summary }) => ({ n, severity, summary })),
      stop: a.stop,
      stop_reason: a.stop_reason,
    });
  }
  entries.sort((a, b) => a.at.localeCompare(b.at));
  return { slug: run.slug, entries };
}

const REPORT_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*\.(md|docx)$/;

/** Reports in the run's reports/ folder. */
export async function viewReports(scope: ViewScope, slug: string) {
  const run = await findRun(scope, slug);
  const files = await listReportFiles(run.paths);
  return {
    slug: run.slug,
    folder: `${run.paths.dir}/reports`,
    reports: files.map((name) => ({ name, format: name.endsWith(".md") ? "markdown" : "word" })),
  };
}

/** The text of one Markdown report. */
export async function viewReport(scope: ViewScope, slug: string, name: string) {
  const run = await findRun(scope, slug);
  const text =
    REPORT_NAME.test(name) && name.endsWith(".md") && !name.includes("..")
      ? await readReportText(run.paths, name)
      : null;
  if (text === null) {
    throw new RebError(
      `There is no Markdown report "${name}" in run "${run.slug}".`,
      "Pick a report from the list.",
    );
  }
  return { slug: run.slug, name, text };
}

/**
 * open_dashboard (SPEC 9): starts the local dashboard (or reuses the one already running),
 * opens it in the browser and returns its address. With `run`, the page opens on that run.
 */
export async function openDashboard(
  ctx: Context,
  input: { run?: string; open?: boolean; port?: number } = {},
) {
  if (!ctx.dashboard) {
    throw new RebError(
      "The dashboard cannot be started from here.",
      'Run "reb dashboard" in a terminal instead.',
    );
  }
  const run = input.run ? await resolveRun(ctx, input.run) : undefined;
  const handle = await ctx.dashboard({ root: ctx.root, run, port: input.port });
  const url = run ? `${handle.url}#/run/${encodeURIComponent(run.slug)}` : `${handle.url}#/`;
  let opened = false;
  if (input.open !== false && ctx.openBrowser) {
    opened = await ctx.openBrowser(url).then(
      () => true,
      () => false,
    );
  }
  return {
    url,
    opened,
    ...(run ? { slug: run.slug } : {}),
    note: opened
      ? "The dashboard is open in the browser. It only shows files; it changes nothing."
      : `Open ${url} in a browser to see the dashboard. It only shows files; it changes nothing.`,
    handle,
  };
}
