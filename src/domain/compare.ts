import { CONFIDENCES } from "./evidence.js";
import { NODE_TYPES, type NodeType } from "./links.js";
import type { GraphNode } from "./node.js";
import { TYPE_FIELDS } from "./nodeFields.js";

/**
 * compare_runs (SPEC 9, v2): what differs between two runs. For two runs of the same product it
 * shows what changed over time (nodes added and removed, labels and typed fields that changed,
 * metrics then and now); for two competing products it shows the gap (features, plans and
 * integrations only one of them has). Nodes are matched by type and name, so the comparison
 * works across runs whose ids differ. Pure: it reads two loaded graphs and changes nothing.
 */

export interface RunGraph {
  slug: string;
  product: string;
  nodes: GraphNode[];
}

export interface NodeRef {
  id: string;
  type: NodeType;
  name: string;
}

export interface Change {
  name: string;
  type: NodeType;
  ids: [string, string];
  what: string;
  from: string;
  to: string;
}

export interface Comparison {
  same_product: boolean;
  counts: Array<{ type: NodeType; a: number; b: number }>;
  only_in_a: NodeRef[];
  only_in_b: NodeRef[];
  in_both: number;
  changes: Change[];
  metrics: Array<{ kind: string; a: string; b: string }>;
  markdown: string;
}

/** Node types where "only in one run" is the interesting part of a comparison. */
const GAP_TYPES: NodeType[] = [
  "feature",
  "pricing_tier",
  "integration",
  "module",
  "persona",
  "market_segment",
  "channel",
  "revenue_stream",
  "geography",
  "compliance",
  "technology",
  "risk",
  "competitor",
];

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const key = (n: GraphNode) => `${n.meta.type}:${norm(n.meta.name)}`;
const ref = (n: GraphNode): NodeRef => ({ id: n.meta.id, type: n.meta.type, name: n.meta.name });
const show = (v: unknown): string => {
  if (v === undefined || v === null || v === "") return "(none)";
  if (Array.isArray(v))
    return v.map((x) => (typeof x === "object" ? JSON.stringify(x) : String(x))).join(", ");
  return typeof v === "object" ? JSON.stringify(v) : String(v);
};
const cell = (s: string) => s.replace(/\|/g, "\\|");

/** The newest value of each metric kind (by as_of), as "value unit (as_of)". */
function latestMetrics(nodes: GraphNode[]): Map<string, string> {
  const out = new Map<string, { at: string; text: string }>();
  for (const n of nodes) {
    if (n.meta.type !== "metric") continue;
    const m = n.meta as Record<string, unknown>;
    const kind = String(m.kind ?? "other");
    const at = String(m.as_of ?? "");
    const label = kind === "other" ? `other: ${n.meta.name}` : kind;
    const text = `${show(m.value)}${m.unit ? ` ${String(m.unit)}` : ""}${at ? ` (${at})` : ""}`;
    const known = out.get(label);
    if (!known || at > known.at) out.set(label, { at, text });
  }
  return new Map([...out].map(([k, v]) => [k, v.text]));
}

/** Both runs are about the same product when their product nodes, or brief products, match. */
function sameProduct(a: RunGraph, b: RunGraph): boolean {
  if (norm(a.product) === norm(b.product)) return true;
  const products = (g: RunGraph) =>
    new Set(g.nodes.filter((n) => n.meta.type === "product").map((n) => norm(n.meta.name)));
  const pa = products(a);
  return [...products(b)].some((p) => pa.has(p));
}

export function compareGraphs(a: RunGraph, b: RunGraph): Comparison {
  const same = sameProduct(a, b);
  const byKeyA = new Map(a.nodes.map((n) => [key(n), n]));
  const byKeyB = new Map(b.nodes.map((n) => [key(n), n]));
  const sortRefs = (list: NodeRef[]) =>
    list.sort(
      (x, y) =>
        NODE_TYPES.indexOf(x.type) - NODE_TYPES.indexOf(y.type) || x.name.localeCompare(y.name),
    );
  const onlyA = sortRefs(a.nodes.filter((n) => !byKeyB.has(key(n))).map(ref));
  const onlyB = sortRefs(b.nodes.filter((n) => !byKeyA.has(key(n))).map(ref));

  const changes: Change[] = [];
  let inBoth = 0;
  for (const [k, na] of byKeyA) {
    const nb = byKeyB.get(k);
    if (!nb) continue;
    inBoth++;
    const base = {
      name: na.meta.name,
      type: na.meta.type,
      ids: [na.meta.id, nb.meta.id] as [string, string],
    };
    if (na.meta.label !== nb.meta.label) {
      changes.push({ ...base, what: "label", from: na.meta.label, to: nb.meta.label });
    }
    for (const f of TYPE_FIELDS[na.meta.type] ?? []) {
      const va = show((na.meta as Record<string, unknown>)[f.name]);
      const vb = show((nb.meta as Record<string, unknown>)[f.name]);
      if (va !== vb) changes.push({ ...base, what: f.name, from: va, to: vb });
    }
  }

  const counts = NODE_TYPES.map((type) => ({
    type,
    a: a.nodes.filter((n) => n.meta.type === type).length,
    b: b.nodes.filter((n) => n.meta.type === type).length,
  })).filter((c) => c.a || c.b);

  const ma = latestMetrics(a.nodes);
  const mb = latestMetrics(b.nodes);
  const metrics = [...new Set([...ma.keys(), ...mb.keys()])]
    .sort()
    .map((kind) => ({ kind, a: ma.get(kind) ?? "(none)", b: mb.get(kind) ?? "(none)" }));

  const comparison = {
    same_product: same,
    counts,
    only_in_a: onlyA,
    only_in_b: onlyB,
    in_both: inBoth,
    changes,
    metrics,
  };
  return { ...comparison, markdown: compareMarkdown(a, b, comparison) };
}

function labelMix(nodes: GraphNode[]): string {
  if (!nodes.length) return "no nodes";
  return CONFIDENCES.map((l) => [l, nodes.filter((n) => n.meta.label === l).length] as const)
    .filter(([, n]) => n > 0)
    .map(([l, n]) => `${Math.round((n / nodes.length) * 100)}% ${l}`)
    .join(", ");
}

function compareMarkdown(a: RunGraph, b: RunGraph, c: Omit<Comparison, "markdown">): string {
  const A = `${a.product} (${a.slug})`;
  const B = `${b.product} (${b.slug})`;
  const out: string[] = [
    `# Comparison: ${a.product} and ${b.product}`,
    "",
    c.same_product
      ? `Two runs of the same product: **${A}** (earlier) and **${B}** (later). ` +
        "Nodes are matched by type and name."
      : `Two different products: **${A}** and **${B}**. Nodes are matched by type and name, ` +
        "so the lists below show what one has and the other does not (as far as each graph knows).",
    "",
    "## Size of each analysis",
    "",
    `| Node type | ${cell(a.slug)} | ${cell(b.slug)} |`,
    "| --- | --- | --- |",
    ...c.counts.map((x) => `| ${x.type} | ${x.a} | ${x.b} |`),
    "",
    `Evidence labels: ${a.slug}: ${labelMix(a.nodes)}; ${b.slug}: ${labelMix(b.nodes)}.`,
    "",
  ];
  if (c.metrics.length) {
    out.push(
      "## Metrics side by side",
      "",
      `| Metric | ${cell(a.slug)} | ${cell(b.slug)} |`,
      "| --- | --- | --- |",
      ...c.metrics.map((m) => `| ${cell(m.kind)} | ${cell(m.a)} | ${cell(m.b)} |`),
      "",
    );
  }
  const gaps = (list: NodeRef[], title: string) => {
    const shown = c.same_product ? list : list.filter((r) => GAP_TYPES.includes(r.type));
    out.push(`## ${title}`, "");
    if (!shown.length) out.push("_Nothing._", "");
    for (const type of NODE_TYPES) {
      const names = shown.filter((r) => r.type === type);
      if (names.length)
        out.push(`- **${type}**: ${names.map((r) => `${r.name} [${r.id}]`).join("; ")}`);
    }
    out.push("");
  };
  gaps(c.only_in_a, c.same_product ? `Only in the earlier run, ${A}` : `Only in ${A}`);
  gaps(c.only_in_b, c.same_product ? `New in the later run, ${B}` : `Only in ${B}`);
  if (c.same_product) {
    out.push("## What changed", "");
    if (!c.changes.length) out.push("_No label or typed field changed on nodes both runs have._");
    for (const ch of c.changes) {
      out.push(
        `- **${ch.name}** (${ch.type}) ${ch.what}: ${ch.from} -> ${ch.to} [${[...new Set(ch.ids)].join(", ")}]`,
      );
    }
    out.push("");
  }
  out.push(
    "## Read with care",
    "",
    "A node missing from one run can mean the product does not have it, or that the analysis did not " +
      "find or record it. Check the evidence before stating a gap as fact.",
    "",
  );
  return out.join("\n");
}
