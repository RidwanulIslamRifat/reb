import { cp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateGraph } from "../src/workflows/validate.js";
import { renderReport } from "../src/workflows/renderReport.js";
import { tempDir, testContext } from "./helpers.js";

const EXAMPLE = join("examples", "tidyhive-example-2026-10-13");

/** The sample run in examples/ (made by tests/e2e/fullRun.test.ts) stays valid as reb changes. */
describe("examples/ sample run", () => {
  it("has a clean graph and its feature report renders the same sections again", async () => {
    const dir = join(await tempDir(), "tidyhive");
    await cp(EXAMPLE, dir, { recursive: true });
    const ctx = await testContext();
    const check = await validateGraph(ctx, { run: dir });
    expect(check.problems).toEqual([]);

    const before = await readFile(join(dir, "reports", "feature.md"), "utf8");
    await rm(join(dir, "reports"), { recursive: true });
    const result = await renderReport(ctx, { run: dir, report: "feature" });
    expect(result.unmet_needs).toEqual([]);
    const after = await readFile(join(dir, "reports", "feature.md"), "utf8");
    const headings = (text: string) => text.split("\n").filter((l) => l.startsWith("## "));
    expect(headings(after)).toEqual(headings(before));
  });

  it("is made up: no real product, person or secret", async () => {
    const ledger = await readFile(join(EXAMPLE, "evidence", "ledger.jsonl"), "utf8");
    const urls = [...ledger.matchAll(/https?:\/\/([^/"\s]+)/g)].map((m) => m[1]!);
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.every((host) => host.endsWith(".example"))).toBe(true);
  });
});
