import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RebError } from "../../src/domain/errors.js";
import { runAudit } from "../../src/workflows/audit.js";
import { createPlan } from "../../src/workflows/createPlan.js";
import { checkGate } from "../../src/workflows/gate.js";
import { getNode } from "../../src/workflows/graph.js";
import { getPlan, nextTask, savePlan } from "../../src/workflows/plan.js";
import { applyReplan } from "../../src/workflows/replan.js";
import { createRun } from "../../src/workflows/runs.js";
import { addNodes, samplePlan, testContext } from "../helpers.js";

type RunInput = Parameters<typeof createRun>[1];

async function setup(input: Partial<RunInput> = {}) {
  const ctx = await testContext();
  const run = await createRun(ctx, {
    domain: "example.com",
    category: "b2b-saas",
    reports: ["feature"],
    ...input,
  });
  return { ctx, run, slug: run.slug };
}

/** Every node type the feature report spec needs, at its minimum, with evidence. */
async function completeFeatureGraph(ctx: Awaited<ReturnType<typeof setup>>["ctx"], slug: string) {
  await addNodes(ctx, slug, "product", 1);
  await addNodes(ctx, slug, "module", 2);
  await addNodes(ctx, slug, "feature", 5);
  await addNodes(ctx, slug, "journey", 2);
  await addNodes(ctx, slug, "persona", 1);
  await addNodes(ctx, slug, "pricing_tier", 1);
  await addNodes(ctx, slug, "integration", 1);
}

describe("create_plan", () => {
  it("builds the first plan from the brief's pipeline and logs the decision", async () => {
    const { ctx, run, slug } = await setup({ reports: ["business", "feature"] });
    const { plan } = await createPlan(ctx, { run: slug });
    expect(plan).toMatchObject({
      version: 1,
      pipeline: "b2b-saas",
      reports: ["business", "feature"],
    });
    expect(plan.tasks[0]).toMatchObject({ id: "company", status: "pending", added_in: 1 });
    expect(plan.tasks.map((t) => t.id)).toEqual(
      expect.arrayContaining(["market", "business-model", "report-business", "report-feature"]),
    );
    expect(plan.tasks.every((t) => t.done_when.length > 0)).toBe(true);
    const decisions = await readFile(run.paths.decisions, "utf8");
    expect(decisions).toContain("plan created from pipeline b2b-saas");
    expect((await nextTask(ctx, { run: slug })).task!.id).toBe("company");
  });

  it("gives different plans for different categories and report lists", async () => {
    const plans = [];
    for (const input of [
      { category: "b2b-saas", reports: ["feature"] },
      { category: "b2b-saas", reports: ["market"] },
      { category: "consumer-app", reports: ["feature"] },
    ] as const) {
      const { ctx, slug } = await setup({ ...input, reports: [...input.reports] });
      plans.push((await createPlan(ctx, { run: slug })).plan.tasks.map((t) => t.id).join());
    }
    expect(new Set(plans).size).toBe(3);
  });

  it("refuses without a known category, without reports, or when a plan exists", async () => {
    const none = await setup({ category: "" });
    await expect(createPlan(none.ctx, { run: none.slug })).rejects.toThrow(/has no category/);
    const odd = await setup({ category: "fintech" });
    await expect(createPlan(odd.ctx, { run: odd.slug })).rejects.toThrow(
      /no pipeline for .*fintech/,
    );
    const empty = await setup({ reports: [] });
    await expect(createPlan(empty.ctx, { run: empty.slug })).rejects.toThrow(/no reports/);
    const twice = await setup();
    await createPlan(twice.ctx, { run: twice.slug });
    const error = await createPlan(twice.ctx, { run: twice.slug }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RebError);
    expect((error as RebError).fix).toMatch(/apply_replan/);
  });
});

describe("check_gate", () => {
  it("fails on a thin graph and passes once the nodes and evidence are there", async () => {
    const { ctx, slug } = await setup();
    await createPlan(ctx, { run: slug });
    const thin = await checkGate(ctx, { run: slug, task: "company" });
    expect(thin.passed).toBe(false);
    expect(thin.checks.find((c) => c.rule === "at least 2 module nodes")!.detail).toBe(
      "found 0 module nodes, need 2",
    );

    await addNodes(ctx, slug, "company", 1);
    await addNodes(ctx, slug, "product", 1);
    await addNodes(ctx, slug, "module", 2, { evidence: false });
    const full = await checkGate(ctx, { run: slug, task: "company" });
    expect(full.checks.map((c) => c.status)).toEqual(["pass", "pass", "pass", "pass"]);
    expect(full.passed).toBe(true);
    expect(full.checklist).toEqual([]);
  });

  it("returns statements code cannot check as a checklist", async () => {
    const { ctx, slug } = await setup();
    await createPlan(ctx, { run: slug });
    const gate = await checkGate(ctx, { run: slug, task: "walkthrough" });
    expect(gate.checks).toEqual([]);
    expect(gate.passed).toBe(true);
    expect(gate.checklist[0]).toMatch(/the user finished their own session/);
  });
});

describe("run_audit", () => {
  it("finds blocking gaps on a thin graph and writes a numbered audit file", async () => {
    const { ctx, run, slug } = await setup({ focus_questions: ["Which integrations matter?"] });
    await createPlan(ctx, { run: slug });
    await addNodes(ctx, slug, "product", 1);
    await addNodes(ctx, slug, "feature", 2, { evidence: false });

    const { audit, file } = await runAudit(ctx, { run: slug });
    expect(audit.number).toBe(1);
    expect(audit.stop).toBe(false);
    expect(file).toBe(join(run.paths.dir, "logs", "audits", "audit-1.md"));
    expect(audit.gaps.map((g) => g.n)).toEqual(audit.gaps.map((_, i) => i + 1));
    const severities = audit.gaps.map((g) => g.severity);
    expect([...severities].sort()).toEqual(severities.slice().sort()); // grouped
    expect(severities[0]).toBe("blocking");
    const summaries = audit.gaps.map((g) => `${g.severity}: ${g.summary}`);
    expect(summaries).toEqual(
      expect.arrayContaining([
        "blocking: Focus question 1 has no answer yet",
        "blocking: No module nodes, but the reports need at least 2",
        "blocking: No pricing_tier nodes, but the reports need at least 1",
        "major: Only 2 of 5 feature nodes the reports need",
        "major: validate_graph: 2 feature without evidence problems",
      ]),
    );
    const text = await readFile(file, "utf8");
    expect(text).toMatch(/^1\. \*\*\[blocking\]\*\* /m);
    expect(text).toContain("Continue: ");
  });

  it("finds no gaps on a complete graph and stops without question nodes", async () => {
    const { ctx, slug } = await setup();
    await createPlan(ctx, { run: slug });
    await completeFeatureGraph(ctx, slug);
    const { audit } = await runAudit(ctx, { run: slug });
    expect(audit.gaps).toEqual([]);
    expect(audit).toMatchObject({ stop: true, stop_reason: "no blocking gaps", questions: [] });
    expect((await checkGate(ctx, { run: slug, task: "audit" })).passed).toBe(true);
  });

  it("needs a plan first", async () => {
    const { ctx, slug } = await setup();
    await expect(runAudit(ctx, { run: slug })).rejects.toThrow(/no plan yet/);
  });
});

describe("audit and re-plan when nodes are missing", () => {
  it("adds the right tasks, versions the plan and logs each change citing the audit item", async () => {
    const { ctx, run, slug } = await setup({ reports: ["feature", "market"] });
    await createPlan(ctx, { run: slug });
    // Research found the product and features, but no pricing tiers, competitors or segments.
    await addNodes(ctx, slug, "product", 1);
    await addNodes(ctx, slug, "module", 2);
    await addNodes(ctx, slug, "feature", 5);
    await addNodes(ctx, slug, "journey", 2);
    await addNodes(ctx, slug, "persona", 1);
    await addNodes(ctx, slug, "integration", 1);
    await addNodes(ctx, slug, "competitor", 1);

    const { audit } = await runAudit(ctx, { run: slug });
    const byType = Object.fromEntries(audit.gaps.map((g) => [g.suggested_task.id, g]));
    expect(Object.keys(byType).sort()).toEqual([
      "a1-competitor",
      "a1-market-segment",
      "a1-pricing-tier",
    ]);
    expect(byType["a1-pricing-tier"]!.severity).toBe("blocking");
    expect(byType["a1-market-segment"]!.severity).toBe("blocking");
    expect(byType["a1-competitor"]!.severity).toBe("major"); // 1 of 3 found

    const before = (await getPlan(ctx, { run: slug })).plan!;
    const result = await applyReplan(ctx, { run: slug });
    const plan = result.plan;
    expect(plan.version).toBe(before.version + 1);
    expect(await readdir(run.paths.history)).toContain(`plan-v${before.version}.json`);

    const added = plan.tasks.filter((t) => t.added_in === plan.version);
    expect(added.map((t) => [t.id, t.role])).toEqual([
      ...audit.gaps.map((g) => [g.suggested_task.id, g.suggested_task.role]),
      ["audit-r1", "auditor"],
    ]);
    expect(added.find((t) => t.id === "a1-pricing-tier")).toMatchObject({
      role: "desk_researcher",
      status: "pending",
      done_when: ["at least 1 pricing_tier node", "every pricing_tier node has evidence"],
    });
    expect(added.find((t) => t.id === "a1-market-segment")!.role).toBe("market_researcher");
    expect(added.find((t) => t.id === "a1-pricing-tier")!.reason).toMatch(
      /^audit 1 item \d \[blocking\]: No pricing_tier nodes/,
    );
    // The re-audit waits for the new tasks; the report tasks wait for the re-audit.
    expect(plan.tasks.find((t) => t.id === "audit-r1")!.depends_on.sort()).toEqual([
      "a1-competitor",
      "a1-market-segment",
      "a1-pricing-tier",
    ]);
    for (const id of ["report-feature", "report-market"]) {
      expect(plan.tasks.find((t) => t.id === id)!.depends_on).toContain("audit-r1");
    }

    const decisions = (await readFile(run.paths.decisions, "utf8")).trim().split("\n");
    const replanLines = decisions.filter((l) => l.includes(`plan v${plan.version} |`));
    expect(replanLines).toHaveLength(4);
    for (const gap of audit.gaps) {
      expect(replanLines.some((l) => l.includes(`audit 1 item ${gap.n} [${gap.severity}]`))).toBe(
        true,
      );
    }
    expect(result.audit.replanned_in).toBe(plan.version);
    expect(await readFile(join(run.paths.dir, "logs", "audits", "audit-1.json"), "utf8")).toContain(
      `"replanned_in": ${plan.version}`,
    );

    // Doing the new tasks closes the gaps: the next audit stops.
    await addNodes(ctx, slug, "pricing_tier", 1);
    await addNodes(ctx, slug, "market_segment", 2);
    await addNodes(ctx, slug, "competitor", 2, { prefix: "Other" });
    expect((await checkGate(ctx, { run: slug, task: "a1-pricing-tier" })).passed).toBe(true);
    const second = await runAudit(ctx, { run: slug });
    expect(second.audit).toMatchObject({ number: 2, rounds_before: 1, gaps: [], stop: true });
    expect((await checkGate(ctx, { run: slug, task: "audit-r1" })).passed).toBe(true);
  });

  it("re-plans with explicit split, reorder and drop changes", async () => {
    const { ctx, slug, run } = await setup();
    await createPlan(ctx, { run: slug });
    await runAudit(ctx, { run: slug });
    const { plan, decisions } = await applyReplan(ctx, {
      run: slug,
      changes: [
        {
          op: "split",
          gap: 1,
          task: "features",
          into: [
            { id: "features-core", title: "Core features" },
            { id: "features-admin", title: "Admin features" },
          ],
        },
        { op: "reorder", gap: 2, task: "integrations", depends_on: ["company"] },
        { op: "drop", gap: 3, task: "walkthrough" },
      ],
    });
    const get = (id: string) => plan.tasks.find((t) => t.id === id)!;
    expect(get("features").status).toBe("dropped");
    expect(get("features-core")).toMatchObject({
      role: "feature_analyst",
      depends_on: ["company", "pricing"],
    });
    expect(get("personas").depends_on).toEqual(["features-core", "features-admin"]);
    expect(get("integrations").depends_on).toEqual(["company"]);
    expect(get("walkthrough").status).toBe("dropped");
    expect(get("curate").depends_on).not.toContain("walkthrough");
    expect(decisions.map((d) => d.change)).toEqual([
      "split task features into features-core, features-admin",
      "task integrations now waits for company",
      "dropped task walkthrough",
      'added task audit-r1 "Audit again after re-plan round 1" (auditor); pending report tasks wait for it',
    ]);
    expect(await readFile(run.paths.decisions, "utf8")).toContain("audit 1 item 3");
  });

  it("refuses a gap number that is not in the audit, and a second re-plan of one audit", async () => {
    const { ctx, slug } = await setup();
    await createPlan(ctx, { run: slug });
    await runAudit(ctx, { run: slug });
    await expect(
      applyReplan(ctx, { run: slug, changes: [{ op: "add", gap: 99 }] }),
    ).rejects.toThrow(/no gap 99/);
    await expect(
      applyReplan(ctx, { run: slug, changes: [{ op: "drop", gap: 1, task: "nope" }] }),
    ).rejects.toThrow(/no task "nope"/);
    await applyReplan(ctx, { run: slug });
    await expect(applyReplan(ctx, { run: slug })).rejects.toThrow(/already re-planned/);
  });

  it("stops after 3 re-plan rounds and turns the remaining gaps into question nodes", async () => {
    const { ctx, slug, run } = await setup();
    await createPlan(ctx, { run: slug });
    for (let round = 1; round <= 3; round++) {
      const { audit } = await runAudit(ctx, { run: slug });
      expect(audit).toMatchObject({ number: round, stop: false, rounds_before: round - 1 });
      expect((await applyReplan(ctx, { run: slug })).round).toBe(round);
    }
    const { audit } = await runAudit(ctx, { run: slug });
    expect(audit).toMatchObject({
      number: 4,
      stop: true,
      stop_reason: "3 re-plan rounds are done",
    });
    expect(audit.questions).toHaveLength(audit.gaps.length);
    const question = await getNode(ctx, { run: slug, id: audit.questions[0]! });
    expect(question.node.meta).toMatchObject({ type: "question", label: "unknown" });
    expect(question.node.meta.name).toMatch(/^Audit 4 gap 1: /);
    await expect(applyReplan(ctx, { run: slug })).rejects.toThrow(/stop rule/);
    expect(await readFile(join(run.paths.dir, "logs", "audits", "audit-4.md"), "utf8")).toMatch(
      /Remaining gaps became question nodes: question-audit-4-gap-1/,
    );
    expect((await checkGate(ctx, { run: slug, task: "audit-r3" })).passed).toBe(true);
  });

  it("treats a written focus answer as a draft the audit can see", async () => {
    const { ctx, slug, run } = await setup({ focus_questions: ["What does it cost?"] });
    await createPlan(ctx, { run: slug });
    await completeFeatureGraph(ctx, slug);
    expect((await runAudit(ctx, { run: slug })).audit.gaps.map((g) => g.summary)).toEqual([
      "Focus question 1 has no answer yet",
    ]);
    await writeFile(join(run.paths.dir, "notes", "focus-1.md"), "Pro costs 10 [pricing_tier-x].\n");
    expect((await runAudit(ctx, { run: slug })).audit.gaps).toEqual([]);
    expect(
      (await checkGate(ctx, { run: slug, task: "focus-1" })).checks.map((c) => c.status),
    ).toEqual(["pass", "pass"]);
  });

  it("works on a hand-saved plan too", async () => {
    const { ctx, slug } = await setup();
    await savePlan(ctx, { run: slug, plan: samplePlan, reason: "custom plan" });
    await runAudit(ctx, { run: slug });
    const { plan } = await applyReplan(ctx, { run: slug });
    expect(plan.tasks.at(-1)!.id).toBe("audit-r1");
  });
});
