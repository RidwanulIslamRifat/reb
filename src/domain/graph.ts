import { NODE_TYPES, LINK_TYPES, LINK_RULES } from "./links.js";
import { CONFIDENCES, correctionsOf, type EvidenceRecord } from "./evidence.js";
import { linksOf, type NodeMeta } from "./node.js";
import { validateGraph, VALIDATION_RULES, type GraphInput } from "./validation.js";

/** kb/graph.json: every node and every link, for the dashboard and reports. */
export function buildGraphJson(input: GraphInput, generatedAt: string) {
  const nodes = [...input.nodes]
    .map((n) => n.meta)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(({ id, type, name, label }) => ({ id, type, name, label }));
  const edges = [...input.nodes]
    .map((n) => n.meta)
    .sort((a, b) => a.id.localeCompare(b.id))
    .flatMap((meta: NodeMeta) =>
      linksOf(meta).map((l) => ({
        from: meta.id,
        type: l.type,
        to: l.to,
        // Only ordered link types (uses) carry a step number, starting at 1.
        ...(LINK_RULES[l.type].ordered ? { step: l.order + 1 } : {}),
      })),
    );
  return { generated_at: generatedAt, nodes, edges };
}

const countBy = <K extends string>(keys: readonly K[], values: K[]) =>
  Object.fromEntries(keys.map((k) => [k, values.filter((v) => v === k).length])) as Record<
    K,
    number
  >;

/** kb/stats.json: counts that show how far the analysis has come. */
export function buildStatsJson(input: GraphInput, generatedAt: string) {
  const metas = input.nodes.map((n) => n.meta);
  const links = metas.flatMap(linksOf);
  const corrected = correctionsOf(input.records);
  const evidence = input.records.filter((r): r is EvidenceRecord => r.kind === "evidence");
  const features = metas.filter((m) => m.type === "feature");
  const subjects = new Set(evidence.filter((r) => !corrected.has(r.id)).map((r) => r.subject));
  const problems = validateGraph(input);
  return {
    generated_at: generatedAt,
    nodes: {
      total: metas.length,
      by_type: countBy(
        NODE_TYPES,
        metas.map((m) => m.type),
      ),
    },
    nodes_by_label: countBy(
      CONFIDENCES,
      metas.map((m) => m.label),
    ),
    links: {
      total: links.length,
      by_type: countBy(
        LINK_TYPES,
        links.map((l) => l.type),
      ),
    },
    ledger: {
      evidence: evidence.length,
      sources: input.records.length - evidence.length,
      corrected: corrected.size,
    },
    features_with_evidence: features.filter(
      (f) => (f.links.evidence ?? []).length > 0 || subjects.has(f.id),
    ).length,
    features_total: features.length,
    problems: {
      total: problems.length,
      by_rule: countBy(
        Object.keys(VALIDATION_RULES) as (keyof typeof VALIDATION_RULES)[],
        problems.map((p) => p.rule),
      ),
    },
  };
}
export type GraphStats = ReturnType<typeof buildStatsJson>;
