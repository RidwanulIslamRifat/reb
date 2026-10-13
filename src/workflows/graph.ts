import type { z } from "zod";
import { RebError } from "../domain/errors.js";
import { correctionsOf, isLedgerId, type LedgerRecord } from "../domain/evidence.js";
import { buildGraphJson, buildStatsJson } from "../domain/graph.js";
import {
  describeAllowed,
  isAllowedLink,
  linkCanStartAt,
  LinkTypeSchema,
  NodeTypeSchema,
  type LinkType,
} from "../domain/links.js";
import {
  isNodeIdFor,
  linksOf,
  looksLikeNodeId,
  NodeMetaSchema,
  nodeIdFor,
  parseNode,
  renderNode,
  type GraphNode,
} from "../domain/node.js";
import { ConfidenceSchema } from "../domain/evidence.js";
import { describeIssues } from "../domain/plan.js";
import type { GraphInput } from "../domain/validation.js";
import { readLedger } from "../storage/ledger.js";
import {
  readNodeFiles,
  readNodeText,
  withGraphLock,
  writeGraphFiles,
  writeNodeText,
} from "../storage/nodeFiles.js";
import type { RunPaths } from "../storage/runFolder.js";
import type { Context } from "./context.js";
import { argsOf, logged } from "./logging.js";
import { resolveRun } from "./runs.js";

/** Reads every node file and the ledger. Unreadable node files are listed, not thrown. */
export async function loadGraph(paths: RunPaths): Promise<GraphInput> {
  const nodes: GraphInput["nodes"] = [];
  const badFiles: GraphInput["badFiles"] = [];
  for (const { file, text } of await readNodeFiles(paths)) {
    try {
      nodes.push({ ...parseNode(text), file });
    } catch (error) {
      badFiles.push({ file, reason: (error as Error).message });
    }
  }
  return { nodes, badFiles, records: await readLedger(paths) };
}

function checkNodeId(id: string): void {
  if (!looksLikeNodeId(id)) {
    throw new RebError(
      `"${id}" is not a node id.`,
      'Node ids look like "<type>-<short-kebab-name>", for example "feature-sso".',
    );
  }
}

/** Reads one node, or null when it does not exist. Throws a RebError when the file is broken. */
async function readNode(paths: RunPaths, id: string): Promise<GraphNode | null> {
  checkNodeId(id);
  const text = await readNodeText(paths, id);
  if (text === null) return null;
  try {
    return parseNode(text);
  } catch (error) {
    throw new RebError(
      `${paths.node(id)} cannot be read: ${(error as Error).message}.`,
      "Open the file and fix its front matter between the --- lines.",
    );
  }
}

async function requireNode(paths: RunPaths, id: string): Promise<GraphNode> {
  const node = await readNode(paths, id);
  if (!node) {
    throw new RebError(
      `There is no node "${id}".`,
      'Create it with "reb kb add <type> <name>", or check the id with "reb kb query".',
    );
  }
  return node;
}

function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown, what: string, fix: string): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new RebError(`${what}: ${describeIssues(result.error)}.`, fix);
  return result.data;
}

/**
 * upsert_node: creates a node, or updates the name, label and (when given) body of an existing one.
 * Links are kept; add them with link_nodes. The id is `<type>-<kebab name>` unless given.
 */
export async function upsertNode(
  ctx: Context,
  input: { run?: string; type: string; name: string; label: string; id?: string; body?: string },
) {
  const run = await resolveRun(ctx, input.run);
  const { body, ...args } = argsOf(input);
  return logged(ctx, "upsert_node", run, { ...args, body_chars: body?.length }, async () => {
    const type = parseOrThrow(
      NodeTypeSchema,
      input.type,
      `"${input.type}" is not a node type`,
      `Use one of: ${NodeTypeSchema.options.join(", ")}.`,
    );
    const label = parseOrThrow(
      ConfidenceSchema,
      input.label,
      `"${input.label}" is not an evidence label`,
      `Use one of: ${ConfidenceSchema.options.join(", ")}.`,
    );
    let id = input.id;
    if (!id) {
      try {
        id = nodeIdFor(type, input.name);
      } catch {
        throw new RebError(
          `The name "${input.name}" has no letters or digits to make an id from.`,
          "Give a name with letters, or an id with --id.",
        );
      }
    }
    if (!isNodeIdFor(id, type)) {
      throw new RebError(
        `"${id}" is not a valid id for a ${type} node.`,
        `Use "${type}-<short-kebab-name>", for example "${type}-example".`,
      );
    }
    const nodeId = id;
    return withGraphLock(run.paths, async () => {
      const existing = await readNode(run.paths, nodeId);
      if (existing && existing.meta.type !== type) {
        throw new RebError(
          `Node ${nodeId} already exists as a ${existing.meta.type}.`,
          "Use another id, or keep the type it has.",
        );
      }
      const meta = parseOrThrow(
        NodeMetaSchema,
        { ...(existing?.meta ?? { links: {} }), id: nodeId, type, name: input.name, label },
        "The node is not valid",
        "Give a type, a name and a label.",
      );
      const node: GraphNode = {
        meta,
        body: body ?? existing?.body ?? `\n# ${meta.name}\n`,
      };
      await writeNodeText(run.paths, nodeId, renderNode(node));
      const warnings = (await loadGraph(run.paths)).nodes
        .filter(
          (n) =>
            n.meta.id !== nodeId &&
            n.meta.type === type &&
            n.meta.name.trim().toLowerCase() === meta.name.trim().toLowerCase(),
        )
        .map((n) => `${n.meta.id} has the same name; one fact should live in one node.`);
      return { ...run, node, created: !existing, warnings };
    });
  });
}

/**
 * link_nodes: adds `to` to the `type` list in the front matter of `from`.
 * Only the from -> to pairs in SPEC 6.3 are allowed; `evidence` links point at E-/S- ids.
 */
export async function linkNodes(
  ctx: Context,
  input: { run?: string; from: string; type: string; to: string },
) {
  const run = await resolveRun(ctx, input.run);
  const args = argsOf(input);
  return logged(ctx, "link_nodes", run, args, async () => {
    const type: LinkType = parseOrThrow(
      LinkTypeSchema,
      input.type,
      `"${input.type}" is not a link type`,
      `Use one of: ${LinkTypeSchema.options.join(", ")}.`,
    );
    return withGraphLock(run.paths, async () => {
      const from = await requireNode(run.paths, input.from);
      const fromType = from.meta.type;
      const wrongPair = (toLabel: string) =>
        new RebError(
          `A ${fromType} cannot have a "${type}" link to ${toLabel}.`,
          `"${type}" only allows ${describeAllowed(type)}.`,
        );
      if (!linkCanStartAt(type, fromType)) throw wrongPair(input.to);
      if (type === "evidence" || isLedgerId(input.to)) {
        if (!isLedgerId(input.to) || !isAllowedLink(type, fromType, "ledger")) {
          throw wrongPair(input.to);
        }
        if (!(await readLedger(run.paths)).some((r) => r.id === input.to)) {
          throw new RebError(
            `${input.to} is not in the evidence ledger.`,
            'Record it first with "reb evidence add" or "reb evidence source".',
          );
        }
      } else {
        const to = await requireNode(run.paths, input.to);
        if (!isAllowedLink(type, fromType, to.meta.type)) {
          throw wrongPair(`a ${to.meta.type} (${input.to})`);
        }
      }
      const current = from.meta.links[type] ?? [];
      if (current.includes(input.to)) return { ...run, node: from, changed: false };
      const node: GraphNode = {
        ...from,
        meta: { ...from.meta, links: { ...from.meta.links, [type]: [...current, input.to] } },
      };
      await writeNodeText(run.paths, from.meta.id, renderNode(node));
      return { ...run, node, changed: true };
    });
  });
}

/** Ledger records with `corrected_by` set when a newer record replaces them. */
function withCorrections(records: LedgerRecord[], ids: (r: LedgerRecord) => boolean) {
  const corrected = correctionsOf(records);
  return records.filter(ids).map((r) => ({ ...r, corrected_by: corrected.get(r.id) }));
}

/** One node with its links both ways and the evidence about it. Reads only; nothing is logged. */
export async function describeNode(paths: RunPaths, id: string) {
  const node = await requireNode(paths, id);
  const graph = await loadGraph(paths);
  const byId = new Map(graph.nodes.map((n) => [n.meta.id, n.meta]));
  const outgoing = linksOf(node.meta).map((l) => ({
    ...l,
    name: byId.get(l.to)?.name,
    exists: byId.has(l.to) || graph.records.some((r) => r.id === l.to),
  }));
  const incoming = graph.nodes.flatMap((n) =>
    linksOf(n.meta)
      .filter((l) => l.to === node.meta.id)
      .map((l) => ({ from: n.meta.id, type: l.type, name: n.meta.name })),
  );
  const linked = new Set(node.meta.links.evidence ?? []);
  const evidence = withCorrections(
    graph.records,
    (r) => linked.has(r.id) || (r.kind === "evidence" && r.subject === node.meta.id),
  );
  return { node, outgoing, incoming, evidence };
}

/** get_node: one node with its links both ways and the evidence about it. */
export async function getNode(ctx: Context, input: { run?: string; id: string }) {
  const run = await resolveRun(ctx, input.run);
  return logged(ctx, "get_node", run, { id: input.id }, async () => ({
    ...run,
    ...(await describeNode(run.paths, input.id)),
  }));
}

/** query_graph: nodes matching every filter given (type, label, text in id or name, linked to a node). */
export async function queryGraph(
  ctx: Context,
  input: { run?: string; type?: string; label?: string; text?: string; linked_to?: string } = {},
) {
  const run = await resolveRun(ctx, input.run);
  const args = argsOf(input);
  return logged(ctx, "query_graph", run, args, async () => {
    if (input.type) {
      parseOrThrow(
        NodeTypeSchema,
        input.type,
        `"${input.type}" is not a node type`,
        `Use one of: ${NodeTypeSchema.options.join(", ")}.`,
      );
    }
    if (input.label) {
      parseOrThrow(
        ConfidenceSchema,
        input.label,
        `"${input.label}" is not an evidence label`,
        `Use one of: ${ConfidenceSchema.options.join(", ")}.`,
      );
    }
    const text = input.text?.toLowerCase();
    const { nodes } = await loadGraph(run.paths);
    const touches = (meta: GraphNode["meta"], other: string) =>
      linksOf(meta).some((l) => l.to === other) ||
      nodes.some((n) => n.meta.id === other && linksOf(n.meta).some((l) => l.to === meta.id));
    const found = nodes
      .map((n) => n.meta)
      .filter((m) => !input.type || m.type === input.type)
      .filter((m) => !input.label || m.label === input.label)
      .filter((m) => !text || m.id.includes(text) || m.name.toLowerCase().includes(text))
      .filter((m) => !input.linked_to || touches(m, input.linked_to));
    return { ...run, nodes: found };
  });
}

/** build_graph: writes kb/graph.json and kb/stats.json from the node files and the ledger. */
export async function buildGraph(ctx: Context, input: { run?: string } = {}) {
  const run = await resolveRun(ctx, input.run);
  return logged(ctx, "build_graph", run, {}, async () => {
    const graphInput = await loadGraph(run.paths);
    const at = ctx.now().toISOString();
    const graph = buildGraphJson(graphInput, at);
    const stats = buildStatsJson(graphInput, at);
    await writeGraphFiles(run.paths, graph, stats);
    return { ...run, graph, stats, files: [run.paths.graph, run.paths.stats] };
  });
}
