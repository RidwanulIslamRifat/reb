import { z } from "zod";

/** The 13 v1 node types, the 21 v2 node types and requirement (SPEC 6.3). */
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
  // v2: business model
  "value_proposition",
  "revenue_stream",
  "cost_driver",
  "channel",
  "partner",
  "customer",
  // v2: company condition
  "metric",
  "funding_round",
  "leader",
  "signal",
  "geography",
  "compliance",
  // v2: strategy and risk
  "finding",
  "risk",
  "trend",
  "force",
  // v2: technology and rebuild
  "technology",
  "screen",
  "user_role",
  "business_rule",
  "api_endpoint",
  // Feature model: functional and non-functional requirements
  "requirement",
] as const;
export const NodeTypeSchema = z.enum(NODE_TYPES);
export type NodeType = z.infer<typeof NodeTypeSchema>;

/** The 12 v1 link types, the 23 v2 link types and specifies (SPEC 6.3). */
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
  // v2
  "delivers",
  "serves",
  "earns",
  "incurs",
  "sells_through",
  "partners_with",
  "buys",
  "measures",
  "raised",
  "leads",
  "complies_with",
  "operates_in",
  "competes_in",
  "powers",
  "threatens",
  "concerns",
  "affects",
  "shows",
  "navigates_to",
  "can",
  "governs",
  "exposes",
  "relates_to",
  "specifies",
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
  reads_writes: { pairs: [{ from: ["feature", "api_endpoint"], to: ["data_object"] }] },
  connects_to: { pairs: [{ from: ["feature"], to: ["integration"] }] },
  also_offers: { pairs: [{ from: ["competitor"], to: ["feature"] }] },
  belongs_to: { pairs: [{ from: ["persona", "customer"], to: ["market_segment"] }] },
  explains: { pairs: [{ from: ["hypothesis"], to: "any" }] },
  evidence: { pairs: [{ from: "any", to: "ledger" }] },
  about: { pairs: [{ from: ["question"], to: "any" }] },
  // v2: business model
  delivers: { pairs: [{ from: ["product"], to: ["value_proposition"] }] },
  serves: {
    pairs: [
      {
        from: ["value_proposition", "product"],
        to: ["persona", "market_segment", "customer"],
      },
    ],
  },
  earns: { pairs: [{ from: ["company", "product"], to: ["revenue_stream"] }] },
  incurs: { pairs: [{ from: ["company"], to: ["cost_driver"] }] },
  sells_through: { pairs: [{ from: ["company", "product"], to: ["channel"] }] },
  partners_with: { pairs: [{ from: ["company"], to: ["partner"] }] },
  buys: { pairs: [{ from: ["customer"], to: ["product"] }] },
  // v2: company condition
  measures: { pairs: [{ from: ["metric"], to: "any" }] },
  raised: { pairs: [{ from: ["company"], to: ["funding_round"] }] },
  leads: { pairs: [{ from: ["leader"], to: ["company"] }] },
  complies_with: { pairs: [{ from: ["company", "product"], to: ["compliance"] }] },
  operates_in: { pairs: [{ from: ["company", "product"], to: ["geography"] }] },
  competes_in: { pairs: [{ from: ["competitor"], to: ["market_segment"] }] },
  // v2: strategy and risk
  threatens: { pairs: [{ from: ["risk"], to: "any" }] },
  concerns: { pairs: [{ from: ["finding"], to: "any" }] },
  affects: { pairs: [{ from: ["trend", "force", "signal"], to: "any" }] },
  // v2: technology and rebuild
  powers: {
    pairs: [{ from: ["technology"], to: ["product", "module", "feature", "integration"] }],
  },
  shows: { pairs: [{ from: ["screen"], to: ["feature", "data_object"] }] },
  navigates_to: { pairs: [{ from: ["screen"], to: ["screen"] }] },
  can: { pairs: [{ from: ["user_role"], to: ["feature", "screen"] }] },
  governs: {
    pairs: [
      { from: ["business_rule"], to: ["feature", "data_object", "pricing_tier", "user_role"] },
    ],
  },
  exposes: { pairs: [{ from: ["product", "module"], to: ["api_endpoint"] }] },
  relates_to: { pairs: [{ from: ["data_object"], to: ["data_object"] }] },
  specifies: { pairs: [{ from: ["requirement"], to: "any" }] },
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
