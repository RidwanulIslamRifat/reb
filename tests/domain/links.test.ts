import { describe, expect, it } from "vitest";
import { isAllowedLink, LINK_TYPES, linkCanStartAt, NODE_TYPES } from "../../src/domain/links.js";

describe("node and link types (SPEC 6.3)", () => {
  it("has 13 node types and 12 link types", () => {
    expect(NODE_TYPES).toHaveLength(13);
    expect(LINK_TYPES).toHaveLength(12);
  });

  it.each([
    ["makes", "company", "product"],
    ["has", "product", "module"],
    ["has", "module", "feature"],
    ["does", "persona", "journey"],
    ["uses", "journey", "feature"],
    ["gated_by", "feature", "pricing_tier"],
    ["reads_writes", "feature", "data_object"],
    ["connects_to", "feature", "integration"],
    ["also_offers", "competitor", "feature"],
    ["belongs_to", "persona", "market_segment"],
    ["explains", "hypothesis", "feature"],
    ["explains", "hypothesis", "data_object"],
    ["evidence", "persona", "ledger"],
    ["about", "question", "competitor"],
  ] as const)("allows %s from %s to %s", (link, from, to) => {
    expect(isAllowedLink(link, from, to)).toBe(true);
  });

  it.each([
    ["makes", "persona", "feature"],
    ["has", "product", "feature"],
    ["has", "module", "module"],
    ["explains", "hypothesis", "persona"],
    ["evidence", "feature", "feature"],
    ["uses", "journey", "ledger"],
    ["about", "feature", "question"],
  ] as const)("rejects %s from %s to %s", (link, from, to) => {
    expect(isAllowedLink(link, from, to)).toBe(false);
  });

  it("knows where a link type may start", () => {
    expect(linkCanStartAt("evidence", "company")).toBe(true);
    expect(linkCanStartAt("makes", "persona")).toBe(false);
  });
});
