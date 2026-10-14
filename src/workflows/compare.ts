import { compareGraphs } from "../domain/compare.js";
import { RebError } from "../domain/errors.js";
import { writeReportText } from "../storage/reportFiles.js";
import type { Context } from "./context.js";
import { loadGraph } from "./graph.js";
import { logged } from "./logging.js";
import { readBrief, resolveRun } from "./runs.js";

/**
 * compare_runs (SPEC 9, v2): compares the graph of `run` with the graph of `other` and writes
 * reports/compare-<other>.md in `run`. For the same product, `other` is read as the later run;
 * for two products, it is the competitor. It never changes `other`.
 */
export async function compareRuns(ctx: Context, input: { run?: string; other: string }) {
  const run = await resolveRun(ctx, input.run);
  return logged(ctx, "compare_runs", run, { other: input.other }, async () => {
    const other = await resolveRun(ctx, input.other);
    if (other.slug === run.slug) {
      throw new RebError(
        `Both runs are ${run.slug}.`,
        "Give two different runs, for example: reb compare acme-2026-01-10 --run acme-2026-10-14",
      );
    }
    const [a, b] = await Promise.all([run, other].map((r) => loadGraph(r.paths)));
    const [briefA, briefB] = await Promise.all([readBrief(run), readBrief(other)]);
    const comparison = compareGraphs(
      { slug: run.slug, product: briefA.brief.product, nodes: a!.nodes },
      { slug: other.slug, product: briefB.brief.product, nodes: b!.nodes },
    );
    const file = await writeReportText(run.paths, `compare-${other.slug}.md`, comparison.markdown);
    return { ...run, other: other.slug, file, ...comparison };
  });
}
