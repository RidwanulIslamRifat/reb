import { readdir, readFile, writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { RebError } from "../../src/domain/errors.js";
import { getPlan, nextTask, savePlan, updateTaskStatus } from "../../src/workflows/plan.js";
import { createRun } from "../../src/workflows/runs.js";
import { samplePlan, testContext } from "../helpers.js";

async function setup() {
  const ctx = await testContext();
  const run = await createRun(ctx, { domain: "example.com" });
  return { ctx, run, slug: run.slug };
}

describe("plan versioning", () => {
  it("saving twice leaves plan-v1.json in history and version 2 in plan.json", async () => {
    const { ctx, run, slug } = await setup();
    await savePlan(ctx, { run: slug, plan: samplePlan, reason: "first plan" });
    const v1 = await readFile(run.paths.plan, "utf8");
    await savePlan(ctx, {
      run: slug,
      plan: { ...samplePlan, pipeline: "developer-tool" },
      reason: "better fit",
    });

    expect(await readdir(run.paths.history)).toEqual(["plan-v1.json"]);
    expect(await readFile(run.paths.planVersion(1), "utf8")).toBe(v1);
    const current = JSON.parse(await readFile(run.paths.plan, "utf8"));
    expect(current).toMatchObject({ version: 2, pipeline: "developer-tool" });
  });

  it("never overwrites history: every earlier version stays byte for byte", async () => {
    const { ctx, run, slug } = await setup();
    const snapshots: string[] = [];
    for (let i = 0; i < 4; i++) {
      await savePlan(ctx, {
        run: slug,
        plan: { ...samplePlan, pipeline: `p${i}` },
        reason: `round ${i}`,
      });
      snapshots.push(await readFile(run.paths.plan, "utf8"));
    }
    await updateTaskStatus(ctx, { run: slug, task: "t1", status: "done" });

    expect((await readdir(run.paths.history)).sort()).toEqual([
      "plan-v1.json",
      "plan-v2.json",
      "plan-v3.json",
      "plan-v4.json",
    ]);
    for (let v = 1; v <= 4; v++) {
      expect(await readFile(run.paths.planVersion(v), "utf8")).toBe(snapshots[v - 1]);
    }
    expect(JSON.parse(await readFile(run.paths.plan, "utf8")).version).toBe(5);
  });

  it("refuses to save rather than overwrite an existing history file", async () => {
    const { ctx, run, slug } = await setup();
    await savePlan(ctx, { run: slug, plan: samplePlan, reason: "first" });
    await writeFile(run.paths.planVersion(1), "keep me");
    await expect(savePlan(ctx, { run: slug, plan: samplePlan, reason: "second" })).rejects.toThrow(
      /would overwrite an earlier version/,
    );
    expect(await readFile(run.paths.planVersion(1), "utf8")).toBe("keep me");
    expect(JSON.parse(await readFile(run.paths.plan, "utf8")).version).toBe(1);
  });

  it("marks new tasks with the version that added them", async () => {
    const { ctx, slug } = await setup();
    await savePlan(ctx, { run: slug, plan: samplePlan, reason: "first" });
    const extra = {
      ...samplePlan,
      tasks: [...samplePlan.tasks, { id: "t4", title: "New", role: "architect" }],
    };
    const { plan } = await savePlan(ctx, { run: slug, plan: extra, reason: "add t4" });
    expect(plan.tasks.map((t) => t.added_in)).toEqual([2, 2, 2, 2]);
  });

  it("rejects an invalid plan with a readable reason and writes nothing", async () => {
    const { ctx, run, slug } = await setup();
    const bad = { ...samplePlan, tasks: [{ id: "t1", title: "x", role: "wizard" }] };
    await expect(savePlan(ctx, { run: slug, plan: bad, reason: "x" })).rejects.toThrow(
      /tasks\.0\.role/,
    );
    expect(await readdir(`${run.paths.dir}/plan`)).toEqual(["history"]);
  });

  it("requires a reason", async () => {
    const { ctx, slug } = await setup();
    await expect(savePlan(ctx, { run: slug, plan: samplePlan, reason: " " })).rejects.toThrow(
      /needs a reason/,
    );
  });
});

describe("task status", () => {
  it("changes status as a new plan version and writes a decision line", async () => {
    const { ctx, run, slug } = await setup();
    await savePlan(ctx, { run: slug, plan: samplePlan, reason: "first plan" });
    const result = await updateTaskStatus(ctx, {
      run: slug,
      task: "t1",
      status: "done",
      reason: "home page read",
    });
    expect(result).toMatchObject({ changed: true, plan: { version: 2 }, task: { status: "done" } });

    const decisions = (await readFile(run.paths.decisions, "utf8")).trim().split("\n");
    expect(decisions).toHaveLength(2);
    expect(decisions[0]).toMatch(/plan v1 \| plan saved with 3 tasks \| reason: first plan$/);
    expect(decisions[1]).toMatch(/plan v2 \| task t1: pending -> done \| reason: home page read$/);
  });

  it("does nothing when the status is already set", async () => {
    const { ctx, slug } = await setup();
    await savePlan(ctx, { run: slug, plan: samplePlan, reason: "first" });
    const result = await updateTaskStatus(ctx, { run: slug, task: "t1", status: "pending" });
    expect(result).toMatchObject({ changed: false, plan: { version: 1 } });
  });

  it("explains an unknown task or status", async () => {
    const { ctx, slug } = await setup();
    await savePlan(ctx, { run: slug, plan: samplePlan, reason: "first" });
    await expect(
      updateTaskStatus(ctx, { run: slug, task: "t9", status: "done" }),
    ).rejects.toMatchObject({
      fix: expect.stringContaining("t1, t2, t3"),
    });
    await expect(
      updateTaskStatus(ctx, { run: slug, task: "t1", status: "finished" }),
    ).rejects.toThrow(RebError);
  });

  it("next_task follows dependencies", async () => {
    const { ctx, slug } = await setup();
    await savePlan(ctx, { run: slug, plan: samplePlan, reason: "first" });
    expect((await nextTask(ctx, { run: slug })).task?.id).toBe("t1");
    await updateTaskStatus(ctx, { run: slug, task: "t1", status: "running" });
    expect((await nextTask(ctx, { run: slug })).task?.id).toBe("t3");
    await updateTaskStatus(ctx, { run: slug, task: "t1", status: "done" });
    expect((await nextTask(ctx, { run: slug })).task?.id).toBe("t2");
  });

  it("get_plan returns null before a plan exists", async () => {
    const { ctx, slug } = await setup();
    expect((await getPlan(ctx, { run: slug })).plan).toBeNull();
  });
});
