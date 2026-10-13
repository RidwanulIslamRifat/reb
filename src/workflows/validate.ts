import { validateGraph as checkGraph } from "../domain/validation.js";
import type { Context } from "./context.js";
import { loadGraph } from "./graph.js";
import { logged } from "./logging.js";
import { resolveRun } from "./runs.js";

/**
 * validate_graph: checks the node files and the ledger (SPEC 6.3) and returns every problem,
 * each with a plain-language fix. It changes no node or ledger file.
 */
export async function validateGraph(ctx: Context, input: { run?: string } = {}) {
  const run = await resolveRun(ctx, input.run);
  return logged(ctx, "validate_graph", run, {}, async () => {
    const problems = checkGraph(await loadGraph(run.paths));
    return { ...run, problems };
  });
}
