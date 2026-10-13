import { describe, expect, it } from "vitest";
import type { LedgerRecord } from "../../src/domain/evidence.js";
import type { NodeMeta } from "../../src/domain/node.js";
import { validateGraph, VALIDATION_RULES, type GraphInput } from "../../src/domain/validation.js";
import { loadGraph } from "../../src/workflows/graph.js";
import { runPaths } from "../../src/storage/runFolder.js";

const HASH = "a".repeat(64);
const AT = "2026-10-01T09:00:00.000Z";

type NodeArgs = Pick<NodeMeta, "id" | "type" | "name" | "label"> & { links?: NodeMeta["links"] };

function node(meta: NodeArgs): GraphInput["nodes"][number] {
  return { meta: { ...meta, links: meta.links ?? {} }, body: "", file: `${meta.id}.md` };
}

function evidence(id: string, subject: string, extra: Partial<LedgerRecord> = {}): LedgerRecord {
  return {
    kind: "evidence",
    id,
    role: "desk_researcher",
    subject,
    operation: "read_public_page",
    source: "S-001",
    finding: "Listed on the pricing page.",
    confidence: "documented",
    limitations: [],
    links: [],
    at: AT,
    ...extra,
  } as LedgerRecord;
}

/** A small graph with no problems. Each test below breaks it in exactly one way. */
function cleanGraph(): GraphInput {
  return {
    badFiles: [],
    nodes: [
      node({
        id: "company-acme",
        type: "company",
        name: "Acme",
        label: "documented",
        links: { makes: ["product-notes"] },
      }),
      node({
        id: "product-notes",
        type: "product",
        name: "Notes",
        label: "documented",
        links: { has: ["module-editor"], evidence: ["S-001"] },
      }),
      node({
        id: "module-editor",
        type: "module",
        name: "Editor",
        label: "inferred",
        links: { has: ["feature-sso"] },
      }),
      node({
        id: "feature-sso",
        type: "feature",
        name: "SSO",
        label: "documented",
        links: { gated_by: ["pricing_tier-pro"] },
      }),
      node({
        id: "pricing_tier-pro",
        type: "pricing_tier",
        name: "Pro",
        label: "documented",
        links: { evidence: ["E-002"] },
      }),
      node({
        id: "question-who-buys",
        type: "question",
        name: "Who buys?",
        label: "unknown",
        links: { about: ["product-notes"] },
      }),
    ],
    records: [
      {
        kind: "source",
        id: "S-001",
        url: "https://notes.example/pricing",
        title: "Pricing",
        publisher: "",
        published: "2026-09-01",
        read_at: AT,
        content_sha256: HASH,
      },
      {
        kind: "source",
        id: "S-002",
        url: "https://blog.example/post",
        title: "Post",
        publisher: "",
        read_at: AT,
        content_sha256: HASH,
      },
      evidence("E-001", "feature-sso"),
      evidence("E-002", "pricing_tier-pro", { finding: "Pro costs $10 a month." }),
    ],
  };
}

const rules = (input: GraphInput) => validateGraph(input).map((p) => p.rule);
const find = (input: GraphInput, id: string) => input.nodes.find((n) => n.meta.id === id)!.meta;

describe("validate_graph rules", () => {
  it("finds nothing wrong in a clean graph", () => {
    expect(validateGraph(cleanGraph())).toEqual([]);
  });

  it("bad_node_file: an unreadable file or a file name that differs from the id", () => {
    const g = cleanGraph();
    g.badFiles.push({ file: "feature-x.md", reason: "label: Required" });
    g.nodes[0]!.file = "company-other.md";
    expect(rules(g)).toEqual(["bad_node_file", "bad_node_file"]);
  });

  it("broken_link: a link to a missing node or ledger id", () => {
    const g = cleanGraph();
    find(g, "feature-sso").links.gated_by = ["pricing_tier-gone"];
    find(g, "product-notes").links.evidence = ["S-001", "E-099"];
    expect(rules(g)).toEqual(["broken_link", "broken_link"]);
  });

  it("broken_link: evidence about a missing node, or citing a missing source", () => {
    const g = cleanGraph();
    g.records.push(
      evidence("E-003", "feature-gone"),
      evidence("E-004", "feature-sso", { source: "S-009" }),
    );
    expect(validateGraph(g).map((p) => [p.rule, p.subject])).toEqual([
      ["broken_link", "E-003"],
      ["broken_link", "E-004"],
    ]);
  });

  it("wrong_link_type: a pair the link type does not allow", () => {
    const g = cleanGraph();
    g.nodes.push(
      node({
        id: "persona-admin",
        type: "persona",
        name: "Admin",
        label: "inferred",
        links: { makes: ["feature-sso"], evidence: ["module-editor"] },
      }),
    );
    expect(rules(g)).toEqual(["wrong_link_type", "wrong_link_type"]);
  });

  it("feature_without_evidence: no evidence link and no evidence record about it", () => {
    const g = cleanGraph();
    g.records = g.records.filter((r) => r.id !== "E-001");
    expect(validateGraph(g)).toMatchObject([
      { rule: "feature_without_evidence", subject: "feature-sso" },
    ]);
    find(g, "feature-sso").links.evidence = ["S-001"];
    expect(validateGraph(g)).toEqual([]);
  });

  it("number_without_dated_source: a number from an undated source", () => {
    const g = cleanGraph();
    g.records.push(
      evidence("E-003", "company-acme", { source: "S-002", finding: "Acme has 500 staff." }),
    );
    g.records.push(
      evidence("E-004", "company-acme", {
        source: "https://other.example",
        finding: "Founded in 2015.",
      }),
    );
    expect(validateGraph(g).map((p) => p.subject)).toEqual(["E-003", "E-004"]);
    expect(rules(g)).toEqual(["number_without_dated_source", "number_without_dated_source"]);
  });

  it("number_without_dated_source: observed numbers and corrected records are fine", () => {
    const g = cleanGraph();
    g.records.push(
      evidence("E-003", "company-acme", { source: "S-002", finding: "Acme has 500 staff." }),
    );
    g.records.push(
      evidence("E-004", "company-acme", { finding: "Acme has 500 staff.", corrects: "E-003" }),
    );
    g.records.push(
      evidence("E-005", "feature-sso", {
        source: "shots/1.png",
        finding: "Saw 3 SSO options.",
        confidence: "observed",
      }),
    );
    expect(validateGraph(g)).toEqual([]);
  });

  it("label_stronger_than_evidence: an observed node with only inferred evidence", () => {
    const g = cleanGraph();
    find(g, "feature-sso").label = "observed";
    expect(validateGraph(g)).toMatchObject([
      { rule: "label_stronger_than_evidence", subject: "feature-sso" },
    ]);
    g.records.push(evidence("E-003", "feature-sso", { confidence: "inferred", corrects: "E-001" }));
    find(g, "feature-sso").label = "documented";
    expect(rules(g)).toEqual(["label_stronger_than_evidence"]);
  });

  it("duplicate_name: two nodes of one type with the same name", () => {
    const g = cleanGraph();
    g.nodes.push(
      node({
        id: "feature-single-sign-on",
        type: "feature",
        name: " sso ",
        label: "documented",
        links: { evidence: ["S-001"] },
      }),
    );
    g.nodes.push(
      node({ id: "competitor-sso", type: "competitor", name: "SSO", label: "documented" }),
    );
    expect(rules(g)).toEqual(["duplicate_name"]);
  });
});

describe("the kb-sample fixture", () => {
  it("contains exactly one example of each planted problem", async () => {
    const problems = validateGraph(await loadGraph(runPaths("tests/fixtures/kb-sample")));
    expect(problems.map((p) => [p.rule, p.subject])).toEqual([
      ["broken_link", "persona-team-lead"],
      ["wrong_link_type", "persona-team-lead"],
      ["feature_without_evidence", "feature-export"],
      ["number_without_dated_source", "E-003"],
      ["label_stronger_than_evidence", "feature-search"],
      ["duplicate_name", "feature-full-text-search"],
    ]);
    // Every rule except bad_node_file (tested above) has its example in the fixture.
    expect(new Set(problems.map((p) => p.rule))).toEqual(
      new Set(Object.keys(VALIDATION_RULES).filter((r) => r !== "bad_node_file")),
    );
  });
});
