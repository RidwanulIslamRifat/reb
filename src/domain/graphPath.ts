/** A link between two nodes, as in kb/graph.json. */
export interface PathEdge {
  from: string;
  type: string;
  to: string;
}

/**
 * The shortest chain of links between two nodes, following links in either direction
 * (breadth-first search). Returns the node ids from `from` to `to` and the links used,
 * or null when the two nodes are not connected. Ties are broken by link order, so the result is stable.
 */
export function shortestPath(
  nodeIds: Iterable<string>,
  edges: readonly PathEdge[],
  from: string,
  to: string,
): { nodes: string[]; edges: PathEdge[] } | null {
  const known = new Set(nodeIds);
  if (!known.has(from) || !known.has(to)) return null;
  const neighbours = new Map<string, Array<{ next: string; edge: PathEdge }>>();
  const add = (a: string, b: string, edge: PathEdge) => {
    if (!neighbours.has(a)) neighbours.set(a, []);
    neighbours.get(a)!.push({ next: b, edge });
  };
  for (const edge of edges) {
    if (!known.has(edge.from) || !known.has(edge.to)) continue;
    add(edge.from, edge.to, edge);
    add(edge.to, edge.from, edge);
  }
  const cameFrom = new Map<string, { prev: string; edge: PathEdge } | null>([[from, null]]);
  const queue = [from];
  while (queue.length) {
    const current = queue.shift()!;
    if (current === to) break;
    for (const { next, edge } of neighbours.get(current) ?? []) {
      if (cameFrom.has(next)) continue;
      cameFrom.set(next, { prev: current, edge });
      queue.push(next);
    }
  }
  if (!cameFrom.has(to)) return null;
  const nodes = [to];
  const used: PathEdge[] = [];
  for (let step = cameFrom.get(to); step; step = cameFrom.get(step.prev)) {
    nodes.unshift(step.prev);
    used.unshift(step.edge);
  }
  return { nodes, edges: used };
}
