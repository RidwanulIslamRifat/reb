import { evaluateGate, filesNeeded } from "../domain/gate.js";
import { findTask } from "../domain/plan.js";
import { validateGraph } from "../domain/validation.js";
import { existingRunFiles } from "../storage/runFolder.js";
import { loadAudits } from "./audit.js";
import type { Context } from "./context.js";
import { loadGraph } from "./graph.js";
import { logged } from "./logging.js";
import { requirePlan } from "./plan.js";
import { resolveRun } from "./runs.js";

/**
 * check_gate (SPEC 8): after a task, checks its done_when rules that code can check (node
 * counts, required links, evidence present, files, a clean graph) and returns the rest as a
 * checklist for the agent to confirm. It changes nothing; the agent then sets the status.
 */
export async function checkGate(ctx: Context, input: { run?: string; task: string }) {
  const run = await resolveRun(ctx, input.run);
  return logged(ctx, "check_gate", run, { task: input.task }, async () => {
    const { plan } = await requirePlan(run);
    const task = findTask(plan, input.task);
    const graph = await loadGraph(run.paths);
    const latest = (await loadAudits(run.paths)).at(-1);
    const gate = evaluateGate(task.done_when, {
      nodes: graph.nodes.map((n) => n.meta),
      records: graph.records,
      problems: validateGraph(graph),
      files: await existingRunFiles(run.paths, filesNeeded(task.done_when)),
      latestAuditActedOn: latest ? latest.stop || latest.replanned_in !== null : null,
    });
    return { ...run, task, ...gate };
  });
}
