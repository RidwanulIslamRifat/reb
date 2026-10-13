import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RebError } from "../../src/domain/errors.js";
import { sha256 } from "../../src/domain/evidence.js";
import {
  listEvidence,
  recordEvidence,
  recordSource,
  recordSourceFromFile,
} from "../../src/workflows/evidence.js";
import { upsertNode } from "../../src/workflows/graph.js";
import { tailEvents } from "../../src/workflows/logs.js";
import { createRun } from "../../src/workflows/runs.js";
import { tempDir, testContext } from "../helpers.js";

async function setup() {
  const ctx = await testContext();
  const run = await createRun(ctx, { domain: "example.com" });
  await upsertNode(ctx, { run: run.slug, type: "feature", name: "SSO", label: "documented" });
  return { ctx, run, slug: run.slug };
}

const finding = (n: number) => ({
  role: "desk_researcher",
  subject: "feature-sso",
  operation: "read_public_page",
  source: "https://example.com/pricing",
  finding: `Finding ${n}`,
  confidence: "documented",
});

describe("evidence ledger", () => {
  it("gives sequential, unique ids even when records are written at the same time", async () => {
    const { ctx, slug } = await setup();
    const results = await Promise.all(
      Array.from({ length: 25 }, (_, i) => recordEvidence(ctx, { run: slug, ...finding(i) })),
    );
    const ids = results.map((r) => r.record.id).sort();
    expect(ids).toEqual(
      Array.from({ length: 25 }, (_, i) => `E-${String(i + 1).padStart(3, "0")}`),
    );
    const { records } = await listEvidence(ctx, { run: slug });
    expect(new Set(records.map((r) => r.id)).size).toBe(25);
  });

  it("never rewrites the ledger: a correction adds a line that links to the old record", async () => {
    const { ctx, run, slug } = await setup();
    await recordEvidence(ctx, { run: slug, ...finding(1) });
    const before = await readFile(run.paths.ledger, "utf8");
    const { record } = await recordEvidence(ctx, {
      run: slug,
      ...finding(2),
      corrects: "E-001",
    });
    const after = await readFile(run.paths.ledger, "utf8");
    expect(after.startsWith(before)).toBe(true);
    expect(after.trim().split("\n")).toHaveLength(2);
    expect(record).toMatchObject({ id: "E-002", corrects: "E-001", links: ["E-001"] });
    const { records } = await listEvidence(ctx, { run: slug });
    expect(records.map((r) => [r.id, r.corrected_by])).toEqual([
      ["E-001", "E-002"],
      ["E-002", undefined],
    ]);
  });

  it("records sources with the sha256 of what was read", async () => {
    const { ctx, slug } = await setup();
    const file = join(await tempDir(), "page.html");
    await writeFile(file, "<h1>Pricing</h1>");
    const fromFile = await recordSourceFromFile(ctx, {
      run: slug,
      url: "https://example.com/pricing",
      title: "Pricing",
      published: "2026-09-01",
      file,
    });
    expect(fromFile.record).toMatchObject({
      kind: "source",
      id: "S-001",
      content_sha256: sha256("<h1>Pricing</h1>"),
      published: "2026-09-01",
    });
    const fromHash = await recordSource(ctx, {
      run: slug,
      url: "https://example.com/blog",
      title: "Blog",
      content_sha256: "b".repeat(64),
    });
    expect(fromHash.record.id).toBe("S-002");
    // Sources and evidence count separately.
    expect(
      (await recordEvidence(ctx, { run: slug, ...finding(1), source: "S-002" })).record.id,
    ).toBe("E-001");
  });

  it("refuses unclear input with a problem and a fix", async () => {
    const { ctx, slug } = await setup();
    const fails = (p: Promise<unknown>) => expect(p).rejects.toBeInstanceOf(RebError);
    await fails(recordSource(ctx, { run: slug, url: "https://a.example", title: "A" }));
    await fails(
      recordSource(ctx, {
        run: slug,
        url: "https://a.example",
        title: "A",
        content: "x",
        published: "Sept",
      }),
    );
    await fails(recordEvidence(ctx, { run: slug, ...finding(1), confidence: "sure" }));
    await fails(recordEvidence(ctx, { run: slug, ...finding(1), source: "S-404" }));
    await fails(recordEvidence(ctx, { run: slug, ...finding(1), corrects: "E-404" }));
    await fails(recordEvidence(ctx, { run: slug, ...finding(1), subject: "../../etc" }));
    expect((await listEvidence(ctx, { run: slug })).records).toEqual([]);
  });

  it("warns when the subject node does not exist yet, and logs every call", async () => {
    const { ctx, slug } = await setup();
    const result = await recordEvidence(ctx, {
      run: slug,
      ...finding(1),
      subject: "feature-later",
    });
    expect(result.warnings[0]).toMatch(/feature-later does not exist yet/);
    const { events } = await tailEvents(ctx, { run: slug });
    expect(events.map((e) => e.tool)).toEqual(["create_run", "upsert_node", "record_evidence"]);
  });
});
