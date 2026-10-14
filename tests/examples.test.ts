import { cp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateGraph } from "../src/workflows/validate.js";
import { renderReport } from "../src/workflows/renderReport.js";
import { tempDir, testContext } from "./helpers.js";

/** The sample runs in examples/ and the report each is checked with. */
const EXAMPLES = [
  // Made by tests/e2e/fullRun.test.ts.
  { folder: join("examples", "tidyhive-example-2026-10-14"), report: "feature" },
  // Made by tests/e2e/v2Run.test.ts.
  { folder: join("examples", "ledgerly-example-2026-10-14"), report: "due_diligence" },
];

/** The sample runs in examples/ stay valid as reb changes. */
describe.each(EXAMPLES)("examples/ sample run $folder", ({ folder, report }) => {
  it(`has a clean graph and its ${report} report renders the same sections again`, async () => {
    const dir = join(await tempDir(), "example");
    await cp(folder, dir, { recursive: true });
    const ctx = await testContext();
    const check = await validateGraph(ctx, { run: dir });
    expect(check.problems).toEqual([]);

    const before = await readFile(join(dir, "reports", `${report}.md`), "utf8");
    await rm(join(dir, "reports"), { recursive: true });
    const result = await renderReport(ctx, { run: dir, report });
    expect(result.unmet_needs).toEqual([]);
    const after = await readFile(join(dir, "reports", `${report}.md`), "utf8");
    const headings = (text: string) => text.split("\n").filter((l) => /^#{2,3} /.test(l));
    expect(headings(after)).toEqual(headings(before));
  });

  it("is made up: no real product, person or secret", async () => {
    const ledger = await readFile(join(folder, "evidence", "ledger.jsonl"), "utf8");
    const urls = [...ledger.matchAll(/https?:\/\/([^/"\s]+)/g)].map((m) => m[1]!);
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.every((host) => host.endsWith(".example"))).toBe(true);
  });
});
