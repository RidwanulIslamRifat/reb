import { z } from "zod";

/** The 13 node types (SPEC 6.3). */
export const NODE_TYPES = [
  "company",
  "product",
  "module",
  "feature",
  "journey",
  "persona",
  "data_object",
  "integration",
  "pricing_tier",
  "competitor",
  "market_segment",
  "hypothesis",
  "question",
] as const;
export const NodeTypeSchema = z.enum(NODE_TYPES);
export type NodeType = z.infer<typeof NodeTypeSchema>;

/** The 12 link types (SPEC 6.3). */
export const LINK_TYPES = [
  "makes",
  "has",
  "does",
  "uses",
  "gated_by",
  "reads_writes",
  "connects_to",
  "also_offers",
  "belongs_to",
  "explains",
  "evidence",
  "about",
] as const;
export const LinkTypeSchema = z.enum(LINK_TYPES);
export type LinkType = z.infer<typeof LinkTypeSchema>;

/** "any" means any node type. `evidence` links point at ledger ids instead of nodes. */
type Ends = { from: NodeType[] | "any"; to: NodeType[] | "any" | "ledger" };

/**
 * Allowed from -> to pairs (SPEC 6.3). For `has`, the pairs are product->module and
 * module->feature only, so `pairs` lists them one by one instead of a from/to cross product.
 */
export const LINK_RULES: Record<LinkType, { pairs: Ends[]; ordered?: boolean }> = {
  makes: { pairs: [{ from: ["company"], to: ["product"] }] },
  has: {
    pairs: [
      { from: ["product"], to: ["module"] },
      { from: ["module"], to: ["feature"] },
    ],
  },
  does: { pairs: [{ from: ["persona"], to: ["journey"] }] },
  // ROADMAP decision 9: the order of the list is the step order.
  uses: { pairs: [{ from: ["journey"], to: ["feature"] }], ordered: true },
  gated_by: { pairs: [{ from: ["feature"], to: ["pricing_tier"] }] },
  reads_writes: { pairs: [{ from: ["feature"], to: ["data_object"] }] },
  connects_to: { pairs: [{ from: ["feature"], to: ["integration"] }] },
  also_offers: { pairs: [{ from: ["competitor"], to: ["feature"] }] },
  belongs_to: { pairs: [{ from: ["persona"], to: ["market_segment"] }] },
  explains: { pairs: [{ from: ["hypothesis"], to: ["feature", "data_object"] }] },
  evidence: { pairs: [{ from: "any", to: "ledger" }] },
  about: { pairs: [{ from: ["question"], to: "any" }] },
};

const matches = (allowed: NodeType[] | "any", type: NodeType) =>
  allowed === "any" || allowed.includes(type);

/** Can a link of this type start at a node of type `from`? */
export function linkCanStartAt(link: LinkType, from: NodeType): boolean {
  return LINK_RULES[link].pairs.some((p) => matches(p.from, from));
}

/** Is `from -[link]-> to` an allowed pair? `to` is a node type, or "ledger" for an E-/S- id. */
export function isAllowedLink(link: LinkType, from: NodeType, to: NodeType | "ledger"): boolean {
  return LINK_RULES[link].pairs.some((p) => {
    if (!matches(p.from, from)) return false;
    if (p.to === "ledger" || to === "ledger") return p.to === to;
    return matches(p.to, to);
  });
}

/** Plain-language list of allowed pairs, for error messages: "company -> product". */
export function describeAllowed(link: LinkType): string {
  const side = (s: NodeType[] | "any" | "ledger") =>
    s === "any" ? "any node" : s === "ledger" ? "an E-/S- id" : s.join(" or ");
  return LINK_RULES[link].pairs.map((p) => `${side(p.from)} -> ${side(p.to)}`).join(", ");
}
