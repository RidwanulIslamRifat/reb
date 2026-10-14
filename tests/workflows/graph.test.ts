import { cp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RebError } from "../../src/domain/errors.js";
import { recordEvidence, recordSource } from "../../src/workflows/evidence.js";
import {
  buildGraph,
  getNode,
  linkNodes,
  queryGraph,
  upsertNode,
} from "../../src/workflows/graph.js";
import { createRun } from "../../src/workflows/runs.js";
import { validateGraph } from "../../src/workflows/validate.js";
import { tempDir, testContext } from "../helpers.js";

async function setup() {
  const ctx = await testContext();
  const run = await createRun(ctx, { domain: "example.com" });
  const slug = run.slug;
  const add = (type: string, name: string, label = "documented") =>
    upsertNode(ctx, { run: slug, type, name, label });
  const link = (from: string, type: string, to: string) =>
    linkNodes(ctx, { run: slug, from, type, to });
  return { ctx, run, slug, add, link };
}

describe("upsert_node", () => {
  it("creates a node file, then updates name and label but keeps links and body", async () => {
    const { ctx, run, slug, add, link } = await setup();
    const created = await add("feature", "CSV export");
    expect(created).toMatchObject({ created: true, node: { meta: { id: "feature-csv-export" } } });
    await add("data_object", "Report");
    await link("feature-csv-export", "reads_writes", "data_object-report");
    const file = run.paths.node("feature-csv-export");
    await writeFile(file, (await readFile(file, "utf8")) + "Notes by hand.\n");

    const updated = await upsertNode(ctx, {
      run: slug,
      id: "feature-csv-export",
      type: "feature",
      name: "CSV and Excel export",
      label: "observed",
    });
    expect(updated.created).toBe(false);
    const text = await readFile(file, "utf8");
    expect(text).toContain(
      "name: CSV and Excel export\nlabel: observed\nlinks:\n  reads_writes:\n    - data_object-report",
    );
    expect(text).toContain("Notes by hand.");
  });

  it("rejects a wrong type, label or id, and a type change", async () => {
    const { ctx, slug, add } = await setup();
    const fails = (p: Promise<unknown>) => expect(p).rejects.toBeInstanceOf(RebError);
    await fails(add("widget", "A"));
    await fails(add("feature", "A", "certain"));
    await fails(
      upsertNode(ctx, {
        run: slug,
        type: "feature",
        name: "A",
        label: "inferred",
        id: "product-a",
      }),
    );
    await add("feature", "Search");
    await fails(
      upsertNode(ctx, {
        run: slug,
        type: "module",
        name: "S",
        label: "inferred",
        id: "feature-search",
      }),
    );
  });

  it("warns about a second node with the same name", async () => {
    const { ctx, slug, add } = await setup();
    await add("feature", "Search");
    const second = await upsertNode(ctx, {
      run: slug,
      id: "feature-find",
      type: "feature",
      name: "search",
      label: "inferred",
    });
    expect(second.warnings).toEqual([
      "feature-search has the same name; one fact should live in one node.",
    ]);
  });
});

describe("link_nodes", () => {
  it("rejects a wrong pair, for example persona makes feature", async () => {
    const { add, link } = await setup();
    await add("persona", "Admin", "inferred");
    await add("feature", "SSO");
    await expect(link("persona-admin", "makes", "feature-sso")).rejects.toThrow(
      /persona cannot have a "makes" link/,
    );
    await add("product", "Notes");
    await expect(link("product-notes", "has", "feature-sso")).rejects.toMatchObject({
      fix: expect.stringMatching(/product -> module, module -> feature/),
    });
  });

  it("needs both ends to exist, and evidence links to point at the ledger", async () => {
    const { ctx, slug, add, link } = await setup();
    await add("feature", "SSO");
    await add("module", "Admin");
    await expect(link("feature-sso", "gated_by", "pricing_tier-pro")).rejects.toThrow(/no node/);
    await expect(link("feature-sso", "evidence", "E-001")).rejects.toThrow(
      /not in the evidence ledger/,
    );
    await expect(link("feature-sso", "evidence", "module-admin")).rejects.toBeInstanceOf(RebError);
    await recordSource(ctx, { run: slug, url: "https://example.com", title: "Home", content: "x" });
    expect((await link("feature-sso", "evidence", "S-001")).changed).toBe(true);
  });

  it("keeps the order of ordered links and ignores a repeated link", async () => {
    const { run, add, link } = await setup();
    await add("journey", "Sign up", "inferred");
    for (const name of ["Invite", "Login", "Billing"]) await add("feature", name);
    await link("journey-sign-up", "uses", "feature-login");
    await link("journey-sign-up", "uses", "feature-invite");
    await link("journey-sign-up", "uses", "feature-billing");
    expect((await link("journey-sign-up", "uses", "feature-login")).changed).toBe(false);
    const text = await readFile(run.paths.node("journey-sign-up"), "utf8");
    expect(text).toContain(
      "uses:\n    - feature-login\n    - feature-invite\n    - feature-billing\n",
    );
  });
});

describe("get_node, query_graph and build_graph", () => {
  async function smallGraph() {
    const s = await setup();
    await s.add("company", "Acme");
    await s.add("product", "Notes");
    await s.add("module", "Editor");
    await s.add("feature", "SSO");
    await s.add("feature", "Export", "inferred");
    await s.link("company-acme", "makes", "product-notes");
    await s.link("product-notes", "has", "module-editor");
    await s.link("module-editor", "has", "feature-sso");
    await s.link("module-editor", "has", "feature-export");
    await recordEvidence(s.ctx, {
      run: s.slug,
      role: "feature_analyst",
      subject: "feature-sso",
      operation: "read_public_page",
      source: "https://example.com",
      finding: "SSO is listed.",
      confidence: "documented",
    });
    return s;
  }

  it("shows a node with links both ways and its evidence", async () => {
    const { ctx, slug } = await smallGraph();
    const result = await getNode(ctx, { run: slug, id: "module-editor" });
    expect(result.outgoing.map((l) => l.to)).toEqual(["feature-sso", "feature-export"]);
    expect(result.incoming).toEqual([{ from: "product-notes", type: "has", name: "Notes" }]);
    const sso = await getNode(ctx, { run: slug, id: "feature-sso" });
    expect(sso.evidence.map((r) => r.id)).toEqual(["E-001"]);
    await expect(getNode(ctx, { run: slug, id: "feature-none" })).rejects.toThrow(/no node/);
  });

  it("finds nodes by type, label, text and link", async () => {
    const { ctx, slug } = await smallGraph();
    const ids = async (filter: object) =>
      (await queryGraph(ctx, { run: slug, ...filter })).nodes.map((n) => n.id);
    expect(await ids({ type: "feature" })).toEqual(["feature-export", "feature-sso"]);
    expect(await ids({ label: "inferred" })).toEqual(["feature-export"]);
    expect(await ids({ text: "note" })).toEqual(["product-notes"]);
    expect(await ids({ linked_to: "module-editor" })).toEqual([
      "feature-export",
      "feature-sso",
      "product-notes",
    ]);
  });

  it("writes kb/graph.json and kb/stats.json", async () => {
    const { ctx, run, slug } = await smallGraph();
    await buildGraph(ctx, { run: slug });
    const graph = JSON.parse(await readFile(run.paths.graph, "utf8"));
    const stats = JSON.parse(await readFile(run.paths.stats, "utf8"));
    expect(graph.nodes).toHaveLength(5);
    expect(graph.edges).toContainEqual({
      from: "company-acme",
      type: "makes",
      to: "product-notes",
    });
    expect(stats).toMatchObject({
      nodes: { total: 5, by_type: { feature: 2, company: 1 } },
      links: { total: 4 },
      ledger: { evidence: 1, sources: 0 },
      features_with_evidence: 1,
      features_total: 2,
      problems: { total: 1, by_rule: { feature_without_evidence: 1 } },
    });
  });
});

describe("validate_graph on a run folder", () => {
  it("reads the fixture through a folder path and leaves its nodes and ledger untouched", async () => {
    const ctx = await testContext();
    const copy = join(await tempDir(), "kb-sample");
    await cp("tests/fixtures/kb-sample", copy, { recursive: true });
    const ledger = await readFile(join(copy, "evidence", "ledger.jsonl"), "utf8");
    const result = await validateGraph(ctx, { run: copy });
    expect(result.slug).toBe("kb-sample");
    expect(result.problems).toHaveLength(8);
    expect(await readFile(join(copy, "evidence", "ledger.jsonl"), "utf8")).toBe(ledger);
  });

  it("lists an unreadable node file instead of failing", async () => {
    const { ctx, run, slug, add } = await setup();
    await add("feature", "SSO");
    await writeFile(run.paths.node("feature-broken"), "---\nid: feature-broken\n---\n");
    const { problems } = await validateGraph(ctx, { run: slug });
    expect(problems.map((p) => p.rule)).toEqual(["bad_node_file", "feature_without_evidence"]);
  });

  it("explains a folder that is not a run", async () => {
    const ctx = await testContext();
    await expect(validateGraph(ctx, { run: (await tempDir()) + "/" })).rejects.toThrow(
      /not a reb run folder/,
    );
  });
});
