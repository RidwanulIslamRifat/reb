import { correctionsOf, type LedgerRecord } from "./evidence.js";
import { LINK_TYPES, type LinkType, type NodeType } from "./links.js";
import type { GraphNode } from "./node.js";

/**
 * Lookups over a loaded graph and ledger that reports and framework views share: nodes by id and
 * type, links in both directions, and the current (not corrected) evidence behind each node.
 */
export class GraphIndex {
  readonly byId: Map<string, GraphNode>;
  readonly ledger: Map<string, LedgerRecord>;
  private readonly corrected: Map<string, string>;
  private readonly incoming = new Map<string, Array<{ type: LinkType; from: string }>>();

  constructor(
    readonly nodes: GraphNode[],
    readonly records: LedgerRecord[],
  ) {
    this.byId = new Map(nodes.map((n) => [n.meta.id, n]));
    this.ledger = new Map(records.map((r) => [r.id, r]));
    this.corrected = correctionsOf(records);
    for (const n of nodes) {
      for (const type of LINK_TYPES) {
        if (type === "evidence") continue;
        for (const to of n.meta.links[type] ?? []) {
          this.incoming.set(to, [...(this.incoming.get(to) ?? []), { type, from: n.meta.id }]);
        }
      }
    }
  }

  /** The newest record that corrects `id`, or `id` itself. */
  latest(id: string): string {
    const seen = new Set<string>();
    while (this.corrected.has(id) && !seen.has(id)) {
      seen.add(id);
      id = this.corrected.get(id)!;
    }
    return id;
  }

  /** Current E-/S- ids behind a node: its evidence links and evidence records about it. */
  evidenceOf(node: GraphNode): string[] {
    const ids = [
      ...(node.meta.links.evidence ?? []).map((id) => this.latest(id)),
      ...this.records
        .filter(
          (r) => r.kind === "evidence" && r.subject === node.meta.id && !this.corrected.has(r.id),
        )
        .map((r) => r.id),
    ];
    return [...new Set(ids)].filter((id) => this.ledger.has(id));
  }

  /** Nodes of a type, sorted by name then id. */
  ofType(type: NodeType): GraphNode[] {
    return this.nodes
      .filter((n) => n.meta.type === type)
      .sort((a, b) => a.meta.name.localeCompare(b.meta.name) || a.meta.id.localeCompare(b.meta.id));
  }

  nameOf(id: string): string | undefined {
    return this.byId.get(id)?.meta.name;
  }

  /** Nodes this node links to with `type`, in front-matter order (missing targets left out). */
  out(node: GraphNode, type: LinkType): GraphNode[] {
    return (node.meta.links[type] ?? [])
      .map((id) => this.byId.get(id))
      .filter((n) => n !== undefined);
  }

  /** Nodes that link to this node with `type`. */
  into(node: GraphNode | string, type: LinkType): GraphNode[] {
    const id = typeof node === "string" ? node : node.meta.id;
    return (this.incoming.get(id) ?? [])
      .filter((l) => l.type === type)
      .map((l) => this.byId.get(l.from))
      .filter((n) => n !== undefined);
  }

  /** Every incoming link of a node. */
  incomingOf(id: string): Array<{ type: LinkType; from: string }> {
    return this.incoming.get(id) ?? [];
  }

  /** The node id and its evidence ids, as a citation: "[feature-sso, E-004]". */
  cite(node: GraphNode, ...more: GraphNode[]): string {
    const ids = [node, ...more].flatMap((n) => [n.meta.id, ...this.evidenceOf(n)]);
    return `[${[...new Set(ids)].join(", ")}]`;
  }
}

/** First paragraph of a node body, on one line, at most `max` characters. */
export function summaryOf(body: string, max = 300): string {
  const paragraph =
    body
      .trim()
      .split(/\n\s*\n/)
      .find((p) => p.trim() && !p.trim().startsWith("#")) ?? "";
  const line = paragraph.replace(/\s+/g, " ").trim();
  return line.length > max ? `${line.slice(0, max - 3)}...` : line;
}
