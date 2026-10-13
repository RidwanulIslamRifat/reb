import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { parseBrief } from "../../src/domain/brief.js";
import { RebError } from "../../src/domain/errors.js";
import { RUN_SUBFOLDERS } from "../../src/storage/runFolder.js";
import {
  createRun,
  getBrief,
  listRuns,
  updateBrief,
  resolveRun,
} from "../../src/workflows/runs.js";
import { tempDir, testContext } from "../helpers.js";

async function allEntries(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true });
  return entries.map((e) => relative(dir, join(dir, e)).split("\\").join("/")).sort();
}

describe("create_run", () => {
  it("creates exactly the SPEC 5 folders, a valid brief.md and one event", async () => {
    const ctx = await testContext();
    const run = await createRun(ctx, { domain: "Example.com", reports: ["feature"] });
    expect(run.slug).toBe("example-com-2026-10-13");
    expect(await allEntries(run.paths.dir)).toEqual(
      [...RUN_SUBFOLDERS, "brief.md", "logs/events.jsonl"].sort(),
    );
    const { brief } = parseBrief(await readFile(run.paths.brief, "utf8"));
    expect(brief).toMatchObject({
      product: "example.com",
      url: "https://example.com",
      reports: ["feature"],
    });
    const events = (await readFile(run.paths.events, "utf8")).trim().split("\n");
    expect(events).toHaveLength(1);
    expect(JSON.parse(events[0]!)).toMatchObject({
      tool: "create_run",
      via: "cli",
      ok: true,
      run: run.slug,
    });
  });

  it("adds -2, -3 when the same product is analysed again on the same day", async () => {
    const ctx = await testContext();
    const slugs = [];
    for (let i = 0; i < 3; i++) slugs.push((await createRun(ctx, { domain: "example.com" })).slug);
    expect(slugs).toEqual([
      "example-com-2026-10-13",
      "example-com-2026-10-13-2",
      "example-com-2026-10-13-3",
    ]);
  });

  it("gives a clear error when the runs folder cannot be written", async () => {
    const blocker = join(await tempDir(), "a-file");
    await writeFile(blocker, "not a folder");
    const ctx = { ...(await testContext()), root: join(blocker, "runs") };
    const error = await createRun(ctx, { domain: "example.com" }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RebError);
    expect((error as RebError).problem).toContain("cannot write to the runs folder");
    expect((error as RebError).fix).toContain("REB_HOME");
  });

  it("rejects an unknown report type before creating anything", async () => {
    const ctx = await testContext();
    await expect(createRun(ctx, { domain: "example.com", reports: ["poems"] })).rejects.toThrow(
      RebError,
    );
    await expect(stat(ctx.root)).rejects.toMatchObject({ code: "ENOENT" });
  });
});

describe("finding runs", () => {
  it("gives a clear error when a run does not exist", async () => {
    const ctx = await testContext();
    await createRun(ctx, { domain: "example.com" });
    const error = (await getBrief(ctx, { run: "nope" }).catch((e: unknown) => e)) as RebError;
    expect(error).toBeInstanceOf(RebError);
    expect(error.problem).toContain('no run called "nope"');
    expect(error.fix).toContain("example-com-2026-10-13");
  });

  it("explains how to start when there are no runs", async () => {
    await expect(resolveRun(await testContext())).rejects.toMatchObject({
      fix: expect.stringContaining("reb new"),
    });
  });

  it("uses the most recently changed run when none is named", async () => {
    const ctx = await testContext();
    await createRun(ctx, { domain: "a.com" });
    await new Promise((r) => setTimeout(r, 20));
    await createRun(ctx, { domain: "b.com" });
    expect(await resolveRun(ctx)).toMatchObject({ slug: "b-com-2026-10-13", defaulted: true });
    expect((await listRuns(ctx)).map((r) => r.product)).toEqual(["b.com", "a.com"]);
  });
});

describe("brief", () => {
  it("updates values and keeps the analyst's notes", async () => {
    const ctx = await testContext();
    const run = await createRun(ctx, { domain: "example.com" });
    const original = await readFile(run.paths.brief, "utf8");
    await writeFile(run.paths.brief, original + "\nMy note.\n");
    await updateBrief(ctx, {
      run: run.slug,
      changes: { plan_tier: "Free trial", focus_questions: ["Who buys?"] },
    });
    const { brief, notes } = await getBrief(ctx, { run: run.slug });
    expect(brief).toMatchObject({
      product: "example.com",
      plan_tier: "Free trial",
      focus_questions: ["Who buys?"],
    });
    expect(notes).toContain("My note.");
  });
});
