import { readdir, readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { BriefSchema } from "../../src/domain/brief.js";
import { parseGateRule } from "../../src/domain/gate.js";
import {
  adaptPipeline,
  CATEGORIES,
  findCycle,
  focusHint,
  parsePipeline,
  PipelineSchema,
  type Pipeline,
} from "../../src/domain/pipeline.js";
import { PlanSchema } from "../../src/domain/plan.js";
import { parseReportSpec } from "../../src/domain/reportSpec.js";
import { REPORT_TYPES } from "../../src/domain/brief.js";

async function pipeline(id: string): Promise<Pipeline> {
  return parsePipeline(JSON.parse(await readFile(`pipelines/${id}.json`, "utf8")), id);
}

const brief = (over: Partial<ReturnType<typeof BriefSchema.parse>> = {}) =>
  BriefSchema.parse({ product: "example.com", url: "https://example.com", ...over });

/** Checks the plan create_plan would save is a valid plan.json. */
const asPlan = (tasks: ReturnType<typeof adaptPipeline>) =>
  PlanSchema.parse({
    version: 1,
    product: "example.com",
    tasks: tasks.map((t) => ({ ...t, added_in: 1 })),
  });

describe("pipeline files", () => {
  it("has exactly one valid pipeline per category, with no dependency cycles", async () => {
    const files = (await readdir("pipelines")).filter((f) => f.endsWith(".json")).sort();
    expect(files).toEqual([...CATEGORIES].map((c) => `${c}.json`).sort());
    for (const id of CATEGORIES) {
      const p = await pipeline(id);
      expect(p.id).toBe(id);
      expect(findCycle(p.tasks), id).toBeNull();
      for (const t of p.tasks) {
        expect(t.done_when.length, `${id}/${t.id}`).toBeGreaterThan(0);
        expect(t.inputs.length + t.outputs.length, `${id}/${t.id}`).toBeGreaterThan(0);
      }
      // Every pipeline ends with cleaning, an audit and the report tasks.
      expect(p.tasks.map((t) => t.id).slice(-3)).toEqual(["curate", "audit", "report"]);
    }
  });

  it("writes done_when rules check_gate can check for almost every task", async () => {
    for (const id of CATEGORIES) {
      for (const t of (await pipeline(id)).tasks) {
        if (t.role === "walkthrough_coach") continue; // the user's own session is checked by hand
        expect(
          t.done_when.some((d) => parseGateRule(d) !== null),
          `${id}/${t.id}`,
        ).toBe(true);
      }
    }
  });

  it("has a valid report spec for every report type", async () => {
    for (const r of REPORT_TYPES) {
      const spec = parseReportSpec(
        JSON.parse(await readFile(`reports/specs/${r}.json`, "utf8")),
        r,
      );
      expect(spec.report).toBe(r);
      expect(spec.sections.length).toBeGreaterThan(2);
    }
  });

  it("rejects a pipeline with a dependency cycle or an unknown dependency", () => {
    const base = {
      id: "b2b-saas",
      title: "x",
      description: "x",
      focus: { after: [], before: [] },
    };
    const task = (id: string, depends_on: string[]) => ({
      id,
      title: id,
      role: "desk_researcher",
      depends_on,
      done_when: ["at least 1 company node"],
    });
    const cyclic = PipelineSchema.safeParse({
      ...base,
      tasks: [task("a", ["c"]), task("b", ["a"]), task("c", ["b"])],
    });
    expect(cyclic.success).toBe(false);
    expect(cyclic.error!.issues[0]!.message).toMatch(/cycle: a -> c -> b -> a/);
    expect(PipelineSchema.safeParse({ ...base, tasks: [task("a", ["zz"])] }).success).toBe(false);
  });
});

describe("adaptPipeline", () => {
  it("gives different plans for different categories", async () => {
    const b = brief({ reports: ["business", "feature"] });
    const saas = adaptPipeline(await pipeline("b2b-saas"), b).map((t) => t.id);
    const market = adaptPipeline(await pipeline("marketplace"), b).map((t) => t.id);
    const ai = adaptPipeline(await pipeline("ai-tool"), b).map((t) => t.id);
    expect(saas).toContain("integrations");
    expect(market).toContain("sides");
    expect(ai).toContain("models-data");
    expect(new Set([saas.join(), market.join(), ai.join()]).size).toBe(3);
  });

  it("keeps only the tasks the requested reports need, and one report task per report", async () => {
    const p = await pipeline("b2b-saas");
    const feature = adaptPipeline(p, brief({ reports: ["feature"] }));
    const ids = feature.map((t) => t.id);
    expect(ids).not.toContain("market");
    expect(ids).not.toContain("tech");
    expect(ids).not.toContain("architecture");
    expect(ids).not.toContain("business-model");
    expect(ids).toContain("personas");
    expect(ids.filter((id) => id.startsWith("report"))).toEqual(["report-feature"]);
    // curate still waits for every research task that stayed in.
    expect(feature.find((t) => t.id === "curate")!.depends_on).toEqual([
      "company",
      "pricing",
      "features",
      "integrations",
      "walkthrough",
      "personas",
    ]);
    asPlan(feature);

    const all = adaptPipeline(p, brief({ reports: ["business", "feature", "market", "build"] }));
    expect(all.map((t) => t.id)).toEqual(
      expect.arrayContaining(["market", "tech", "architecture"]),
    );
    const report = all.find((t) => t.id === "report-build")!;
    expect(report.title).toBe("Write the build report");
    expect(report.done_when).toContain("file reports/build.md exists");
    asPlan(all);
  });

  it("adds one task per focus question, before the graph is cleaned", async () => {
    const tasks = adaptPipeline(
      await pipeline("developer-tool"),
      brief({
        reports: ["business"],
        focus_questions: ["How much does it cost per seat?", "Who are the main competitors?"],
      }),
    );
    const f1 = tasks.find((t) => t.id === "focus-1")!;
    expect(f1).toMatchObject({ role: "desk_researcher", outputs: ["notes/focus-1.md"] });
    expect(f1.done_when).toContain("at least 1 pricing_tier node");
    expect(f1.depends_on).toEqual(["features"]);
    expect(tasks.find((t) => t.id === "focus-2")!.role).toBe("market_researcher");
    expect(tasks.find((t) => t.id === "curate")!.depends_on).toEqual(
      expect.arrayContaining(["focus-1", "focus-2"]),
    );
    const order = tasks.map((t) => t.id);
    expect(order.indexOf("focus-2")).toBeLessThan(order.indexOf("curate"));
    asPlan(tasks);
  });

  it("guesses node types and a role from the words of a focus question", () => {
    expect(focusHint("Which integrations does it offer?")).toEqual({
      types: ["integration"],
      role: "architect",
    });
    expect(focusHint("Why do people like it?").role).toBe("business_analyst");
  });
});
