import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { z } from "zod";
import { ConfidenceSchema } from "./evidence.js";
import {
  LINK_TYPES,
  LinkTypeSchema,
  NodeTypeSchema,
  type LinkType,
  type NodeType,
} from "./links.js";
import { describeIssues } from "./plan.js";

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** True when `id` has the form `<type>-<short-kebab-name>` (ROADMAP decision 7). */
export function isNodeIdFor(id: string, type: NodeType): boolean {
  return id.startsWith(`${type}-`) && KEBAB.test(id.slice(type.length + 1));
}

/** True when `id` has the shape of any node id; used before an id becomes a file name. */
export function looksLikeNodeId(id: string): boolean {
  return /^[a-z]+(_[a-z]+)*-[a-z0-9]+(-[a-z0-9]+)*$/.test(id);
}

/** Builds a node id from type and name: ("feature", "CSV Export") -> "feature-csv-export". */
export function nodeIdFor(type: NodeType, name: string): string {
  const kebab = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
  if (!kebab) throw new Error(`cannot make an id from the name "${name}"`);
  return `${type}-${kebab}`;
}

/** Links in front matter: one list of target ids per link type. */
export const NodeLinksSchema = z.partialRecord(LinkTypeSchema, z.array(z.string().min(1)));
export type NodeLinks = z.infer<typeof NodeLinksSchema>;

/**
 * Node front matter (SPEC 6.3). `label` is the evidence label (ROADMAP decision 8).
 * Extra fields an analyst adds by hand are kept as they are.
 */
export const NodeMetaSchema = z
  .object({
    id: z.string().min(1),
    type: NodeTypeSchema,
    name: z.string().trim().min(1),
    label: ConfidenceSchema,
    links: NodeLinksSchema.default({}),
  })
  .loose()
  .superRefine((node, ctx) => {
    if (!isNodeIdFor(node.id, node.type)) {
      ctx.addIssue({
        code: "custom",
        path: ["id"],
        message: `"${node.id}" must look like "${node.type}-<short-kebab-name>"`,
      });
    }
  });
export type NodeMeta = z.infer<typeof NodeMetaSchema>;

/** A node file: front matter plus Markdown body. */
export interface GraphNode {
  meta: NodeMeta;
  body: string;
}

/** Every link of a node as [type, target] pairs, in front-matter order. */
export function linksOf(meta: NodeMeta): Array<{ type: LinkType; to: string; order: number }> {
  return LINK_TYPES.flatMap((type) =>
    (meta.links[type] ?? []).map((to, order) => ({ type, to, order })),
  );
}

/** Reads a node file. Throws a plain Error with a reason; the caller adds the file path. */
export function parseNode(text: string): GraphNode {
  const match = /^---\n([\s\S]*?)\n?---\n?([\s\S]*)$/.exec(text.replace(/\r\n/g, "\n"));
  if (!match) throw new Error("the --- lines around the front matter at the top are missing");
  let raw: unknown;
  try {
    raw = parseYaml(match[1]!);
  } catch (error) {
    throw new Error(
      `the front matter is not valid YAML (${(error as Error).message.split("\n")[0]})`,
      { cause: error },
    );
  }
  const result = NodeMetaSchema.safeParse(raw ?? {});
  if (!result.success) throw new Error(describeIssues(result.error));
  return { meta: result.data, body: match[2]! };
}

/**
 * Writes a node file in one fixed layout: id, type, name, label, links (in SPEC order,
 * empty lists left out), then any extra fields. Reading and writing a file in this layout
 * gives the same text back.
 */
export function renderNode(node: GraphNode): string {
  const { id, type, name, label, links, ...extra } = node.meta;
  const ordered: Record<string, string[]> = {};
  for (const linkType of LINK_TYPES) {
    const targets = links[linkType];
    if (targets?.length) ordered[linkType] = targets;
  }
  const front = {
    id,
    type,
    name,
    label,
    ...(Object.keys(ordered).length ? { links: ordered } : {}),
    ...extra,
  };
  return `---\n${stringifyYaml(front, { lineWidth: 0 })}---\n${node.body}`;
}
