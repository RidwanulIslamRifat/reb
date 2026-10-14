import { RebError } from "../domain/errors.js";
import { FRAMEWORKS, FrameworkSchema, frameworkView } from "../domain/frameworks.js";
import type { Context } from "./context.js";
import { loadGraph } from "./graph.js";
import { logged } from "./logging.js";
import { resolveRun } from "./runs.js";

/**
 * get_framework (SPEC 9, v2): one standard analysis framework (SWOT, risk register, business model
 * canvas ...) drawn from the graph as Markdown with citations. It changes nothing.
 */
export async function getFramework(ctx: Context, input: { run?: string; framework: string }) {
  const run = await resolveRun(ctx, input.run);
  return logged(ctx, "get_framework", run, { framework: input.framework }, async () => {
    const parsed = FrameworkSchema.safeParse(input.framework.trim().toLowerCase());
    if (!parsed.success) {
      throw new RebError(
        `"${input.framework}" is not a framework reb knows.`,
        `Use one of: ${FRAMEWORKS.join(", ")}.`,
      );
    }
    const graph = await loadGraph(run.paths);
    return { ...run, ...frameworkView(parsed.data, graph.nodes, graph.records) };
  });
}
