import { describe, expect, it } from "vitest";
import { BriefSchema, parseBrief, renderBrief } from "../../src/domain/brief.js";

describe("brief.md format", () => {
  it("round-trips every field and keeps the notes", () => {
    const brief = BriefSchema.parse({
      product: "example.com",
      url: "https://example.com",
      category: "b2b-saas",
      reports: ["business", "feature"],
      focus_questions: ['Who is the "main" buyer?'],
      plan_tier: "Free trial",
      deadline: "2026-11-01",
    });
    const text = renderBrief(brief, "\nMy own notes.\n");
    expect(parseBrief(text)).toEqual({ brief, notes: "\nMy own notes.\n" });
  });

  it("explains a value that lost its quotes", () => {
    const text = renderBrief(BriefSchema.parse({ product: "a.com", url: "https://a.com" })).replace(
      'plan_tier: ""',
      "plan_tier: Free trial",
    );
    expect(() => parseBrief(text)).toThrow(/plan_tier.*needs quotes/);
  });

  it("rejects an unknown report type", () => {
    const text = renderBrief(BriefSchema.parse({ product: "a.com", url: "https://a.com" })).replace(
      "reports: []",
      'reports: ["poems"]',
    );
    expect(() => parseBrief(text)).toThrow(/reports/);
  });
});
