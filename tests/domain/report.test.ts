import { describe, expect, it } from "vitest";
import {
  citationProblems,
  citationsIn,
  claimsIn,
  parseReportDraft,
} from "../../src/domain/report.js";
import type { ReportTemplate } from "../../src/domain/reportSpec.js";

const known = {
  nodes: new Set(["feature-sso", "pricing_tier-business"]),
  ledger: new Set(["E-004", "S-001"]),
};

const template: ReportTemplate = {
  report: "feature",
  title: "Feature report",
  intro: "",
  sections: [
    { id: "features", title: "Features", about: "", needs: [], views: [], list: true },
    { id: "plans", title: "What each plan includes", about: "", needs: [], views: [], list: true },
  ],
};

describe("citations", () => {
  it("finds node ids and E-/S- ids in brackets, but not links or plain words", () => {
    expect(
      citationsIn(
        "SSO is on Business [feature-sso, E-004]; see [the docs](https://x.example) [sic].",
      ),
    ).toEqual(["feature-sso", "E-004"]);
    expect(citationsIn("[S-001; pricing_tier-business] and [E-4]")).toEqual([
      "S-001",
      "pricing_tier-business",
      "E-4",
    ]);
  });

  it("treats paragraphs, list items and table body rows as claims", () => {
    const claims = claimsIn(
      [
        "# Title",
        "",
        "A paragraph that goes",
        "over two lines.",
        "",
        "Lead-in:",
        "- one item",
        "  continued",
        "1. numbered",
        "",
        "| Plan | Price |",
        "| --- | --- |",
        "| Business | per seat |",
        "",
        "```",
        "code is not a claim",
        "```",
      ].join("\n"),
    );
    expect(claims).toEqual([
      { line: 3, text: "A paragraph that goes over two lines." },
      { line: 7, text: "- one item continued" },
      { line: 9, text: "1. numbered" },
      { line: 13, text: "| Business | per seat |" },
    ]);
  });

  it("lists a claim without a citation and a citation of a missing id, with line numbers", () => {
    const problems = citationProblems(
      [
        "SSO is only on Business [feature-sso, E-004].",
        "",
        "Export is free.",
        "",
        "- Search is fast [feature-search, E-099].",
      ].join("\n"),
      known,
    );
    expect(problems).toEqual([
      'line 3: no citation in "Export is free."',
      "line 5: cites feature-search, which is not a node in the graph",
      "line 5: cites E-099, which is not in the evidence ledger",
    ]);
  });

  it("finds no problem when every claim cites ids that exist", () => {
    expect(citationProblems("Business is per seat [pricing_tier-business, S-001].", known)).toEqual(
      [],
    );
  });
});

describe("report draft", () => {
  it("splits a draft by section title or id, with the text before the first heading as summary", () => {
    const draft = parseReportDraft(
      "# Draft\n\nShort summary [feature-sso].\n\n## features\n\nA [E-004].\n\n## What each plan includes\n\nB [S-001].\n",
      template,
    );
    expect(draft.summary).toBe("Short summary [feature-sso].");
    expect(draft.sections.get("features")).toBe("A [E-004].");
    expect(draft.sections.get("plans")).toBe("B [S-001].");
    expect(draft.problems).toEqual([]);
  });

  it("names headings that are not sections of the report", () => {
    const draft = parseReportDraft("## Pricing\n\nx\n\n## Sources\n", template);
    expect(draft.problems).toHaveLength(2);
    expect(draft.problems[0]).toMatch(
      /^line 1: "## Pricing" is not a section of the feature report/,
    );
    expect(draft.problems[1]).toMatch(/^line 5: "## Sources".*reb writes .*"Sources"/);
  });
});
