import { z } from "zod";
import { CONFIDENCES } from "../../../domain/evidence.js";
import { LINK_TYPES, NODE_TYPES } from "../../../domain/links.js";
import {
  buildGraph,
  getNode,
  linkNodes,
  queryGraph,
  upsertNode,
} from "../../../workflows/graph.js";
import { validateGraph } from "../../../workflows/validate.js";
import { runArg, tool } from "./common.js";

export const graphTools = [
  tool({
    name: "upsert_node",
    description:
      "Create a knowledge-graph node, or update the name, label and body of an existing one (links are kept). " +
      "The id is <type>-<kebab-name> unless given. Check query_graph first so one fact lives in one node.",
    input: {
      run: runArg,
      type: z.enum(NODE_TYPES),
      name: z.string().min(1),
      label: z
        .enum(CONFIDENCES)
        .describe("Evidence label, never stronger than the node's evidence."),
      id: z.string().optional().describe("Node id; default <type>-<kebab name>."),
      body: z.string().optional().describe("Markdown body; cite ids like [E-012]."),
    },
    call: (ctx, args) => upsertNode(ctx, args),
  }),
  tool({
    name: "link_nodes",
    description:
      "Link two nodes, or a node to an E-/S- id with type evidence. Allowed pairs: company makes product; " +
      "product has module; module has feature; persona does journey; journey uses feature (in step order); " +
      "feature gated_by pricing_tier; feature reads_writes data_object; feature connects_to integration; " +
      "competitor also_offers feature; persona belongs_to market_segment; hypothesis explains feature or data_object; " +
      "question about any node; any node evidence E-/S- id.",
    input: {
      run: runArg,
      from: z.string().min(1).describe("Node id the link starts at."),
      type: z.enum(LINK_TYPES),
      to: z.string().min(1).describe("Node id, or E-/S- id for evidence links."),
    },
    call: (ctx, args) => linkNodes(ctx, args),
  }),
  tool({
    name: "get_node",
    description: "Read one node with its body, links out and in, and the evidence about it.",
    input: { run: runArg, id: z.string().min(1) },
    call: (ctx, args) => getNode(ctx, args),
  }),
  tool({
    name: "query_graph",
    description:
      "Find nodes matching every filter given: type, label, text in id or name, linked to a node.",
    input: {
      run: runArg,
      type: z.enum(NODE_TYPES).optional(),
      label: z.enum(CONFIDENCES).optional(),
      text: z.string().optional(),
      linked_to: z.string().optional().describe("Only nodes linked to or from this node id."),
    },
    call: (ctx, args) => queryGraph(ctx, args),
  }),
  tool({
    name: "validate_graph",
    description:
      "Check the graph and ledger: broken links, features without evidence, numbers without a dated source, " +
      "labels stronger than evidence, duplicate names, wrong link pairs. Each problem comes with a fix.",
    input: { run: runArg },
    call: (ctx, args) => validateGraph(ctx, args),
  }),
  tool({
    name: "build_graph",
    description:
      "Write kb/graph.json and kb/stats.json and return the counts (nodes, links, evidence coverage, problems).",
    input: { run: runArg },
    call: async (ctx, args) => {
      const { graph: _graph, ...rest } = await buildGraph(ctx, args);
      void _graph; // the full graph is in kb/graph.json; the reply keeps to the counts
      return rest;
    },
  }),
];
