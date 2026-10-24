import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { writeRunFile } from "../../src/storage/inbox.js";
import { readLedger } from "../../src/storage/ledger.js";
import { runPaths } from "../../src/storage/runFolder.js";
import { analyseCapture } from "../../src/workflows/featureModel.js";
import { getFramework } from "../../src/workflows/frameworks.js";
import { loadGraph, upsertNode } from "../../src/workflows/graph.js";
import { renderReport } from "../../src/workflows/renderReport.js";
import { createRun } from "../../src/workflows/runs.js";
import { validateGraph } from "../../src/workflows/validate.js";
import { crmScreens } from "../domain/crmScreens.js";
import { testContext } from "../helpers.js";

/** A run with a capture map in session-01, as reb capture leaves it, and the screen nodes. */
async function capturedRun() {
  const ctx = await testContext();
  const run = await createRun(ctx, {
    domain: "acme-crm.example",
    category: "b2b-saas",
    reports: ["requirements"],
  });
  const dir = run.paths.dir;
  const screens = crmScreens();
  await writeRunFile(
    join(dir, "evidence", "imports", "session-01", "capture.json"),
    JSON.stringify({
      start: "/contacts",
      origin: "https://app.acme-crm.example",
      screens,
      skipped: [],
    }),
  );
  for (const s of screens) {
    await upsertNode(ctx, { run: dir, type: "screen", id: s.id, name: s.name, label: "observed" });
  }
  await upsertNode(ctx, { run: dir, type: "product", name: "Acme CRM", label: "documented" });
  return { ctx, dir };
}

describe("analyse_capture (feature model from captured screens)", { timeout: 30_000 }, () => {
  it("adds inferred modules, features, entities, rules, roles and requirements with evidence", async () => {
    const { ctx, dir } = await capturedRun();
    const result = await analyseCapture(ctx, { run: dir });
    expect(result.session).toBe("session-01");
    expect(result).toMatchObject({ modules: 6, entities: 4, roles: 3 });
    await access(join(dir, "notes", "feature-model-session-01.md"));

    const { nodes, records } = await loadGraph(runPaths(dir));
    const byId = new Map(nodes.map((n) => [n.meta.id, n.meta]));
    const deal = byId.get("data_object-deal")!;
    expect(deal.label).toBe("inferred");
    expect(deal["states"]).toEqual([
      "Appointment scheduled",
      "Qualified",
      "Proposal",
      "Closed won",
      "Closed lost",
    ]);
    expect(deal["fields"]).toEqual(
      expect.arrayContaining([
        { name: "Amount", type: "money", required: false },
        { name: "Company", type: "link to Company", required: false },
      ]),
    );
    expect(deal.links.relates_to).toEqual(
      expect.arrayContaining(["data_object-company", "data_object-user"]),
    );
    const pipeline = byId.get("feature-deal-pipeline")!;
    expect(pipeline["logic"]).toEqual(
      expect.arrayContaining([expect.stringContaining("state machine")]),
    );
    expect(pipeline["data_use"]).toHaveLength(1);
    expect(byId.get("module-deals")!.links.has).toEqual(
      expect.arrayContaining(["feature-deal-management", "feature-deal-pipeline"]),
    );
    expect(byId.get("product-acme-crm")!.links.has).toContain("module-deals");
    expect(byId.get("screen-deals")!.links.shows).toEqual(
      expect.arrayContaining(["feature-deal-management", "data_object-deal"]),
    );
    const nfr = byId.get("requirement-security-role-based-access")!;
    expect(nfr).toMatchObject({ kind: "non_functional", category: "security", priority: "must" });
    expect(byId.get("user_role-sales-rep")!.links.can).toEqual([
      "feature-team-and-user-management",
    ]);
    // Every node it made has an inferred evidence record from the notes file.
    for (const id of result.created) {
      const evidence = byId.get(id)!.links.evidence ?? [];
      expect(evidence, id).toHaveLength(1);
      const record = records.find((r) => r.id === evidence[0])!;
      expect(record).toMatchObject({
        confidence: "inferred",
        source: "notes/feature-model-session-01.md",
      });
    }
    const { problems } = await validateGraph(ctx, { run: dir });
    expect(
      problems.filter((p) => p.rule === "broken_link" || p.rule === "label_stronger_than_evidence"),
    ).toEqual([]);
  });

  it("never changes a node the analyst already has, and adds only what is new on a second run", async () => {
    const { ctx, dir } = await capturedRun();
    await upsertNode(ctx, {
      run: dir,
      type: "data_object",
      name: "Deal",
      label: "observed",
      body: "\n# Deal\n\nChecked by hand.\n",
    });
    const first = await analyseCapture(ctx, { run: dir });
    expect(first.kept).toContain("data_object-deal");
    const text = await readFile(join(dir, "kb", "nodes", "data_object-deal.md"), "utf8");
    expect(text).toContain("label: observed");
    expect(text).toContain("Checked by hand.");
    const again = await analyseCapture(ctx, { run: dir });
    expect(again.created).toEqual([]);
  });

  it("previews with dry_run and explains when there is no capture", async () => {
    const { ctx, dir } = await capturedRun();
    const ledger = (await readLedger(runPaths(dir))).length;
    const preview = await analyseCapture(ctx, { run: dir, dry_run: true });
    expect(preview.dry_run).toBe(true);
    expect(preview.model!.features.length).toBeGreaterThan(5);
    await expect(access(join(dir, "notes", "feature-model-session-01.md"))).rejects.toThrow();
    expect((await readLedger(runPaths(dir))).length).toBe(ledger);
    await expect(analyseCapture(ctx, { run: dir, session: "session-09" })).rejects.toThrow(
      /no capture in session-09/,
    );

    const other = await testContext();
    const empty = await createRun(other, { domain: "empty.example", reports: ["requirements"] });
    await expect(analyseCapture(other, { run: empty.paths.dir })).rejects.toThrow(
      /no captured screens/,
    );
  });

  it("feeds the feature logic, requirements and NFR views and the requirements report", async () => {
    const { ctx, dir } = await capturedRun();
    await analyseCapture(ctx, { run: dir });
    const fr = await getFramework(ctx, { run: dir, framework: "requirements" });
    expect(fr.markdown).toContain("**FR-001 ");
    expect(fr.markdown).toContain("Store Deal records");
    expect(fr.markdown).toContain("Accept: ");
    const nfr = await getFramework(ctx, { run: dir, framework: "nfr" });
    expect(nfr.markdown).toContain("| NFR-001 | Performance |");
    const logic = await getFramework(ctx, { run: dir, framework: "feature_logic" });
    expect(logic.markdown).toContain("  - Logic: ");
    expect(logic.markdown).toContain("  - Data reuse: ");

    const report = await renderReport(ctx, { run: dir, report: "requirements" });
    const text = await readFile(report.file, "utf8");
    for (const heading of [
      "## Features, their logic and data reuse",
      "## Data model",
      "## Functional requirements",
      "## Non-functional requirements",
    ]) {
      expect(text).toContain(heading);
    }
    expect(text).toContain("erDiagram");
  });
});
