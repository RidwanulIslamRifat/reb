import { describe, expect, it } from "vitest";
import { nextRunnableTask, PlanSchema, type Plan, type Task } from "../../src/domain/plan.js";
import { normalizeDomain, runSlug } from "../../src/domain/run.js";
import { RebError } from "../../src/domain/errors.js";

function task(id: string, status: Task["status"], depends_on: string[] = []): Task {
  return {
    id,
    title: id,
    role: "planner",
    depends_on,
    inputs: [],
    outputs: [],
    done_when: [],
    status,
    added_in: 1,
    reason: "",
  };
}

function plan(tasks: Task[]): Plan {
  return { version: 1, product: "x.com", pipeline: "", reports: [], tasks };
}

describe("nextRunnableTask", () => {
  it("returns the first pending task whose dependencies are done", () => {
    const p = plan([task("a", "done"), task("b", "pending", ["c"]), task("c", "pending", ["a"])]);
    expect(nextRunnableTask(p)?.id).toBe("c");
  });

  it("skips done, dropped, blocked, running and needs_human tasks", () => {
    const p = plan([
      task("a", "done"),
      task("b", "dropped"),
      task("c", "blocked"),
      task("d", "running"),
      task("e", "needs_human"),
      task("f", "pending", ["a"]),
    ]);
    expect(nextRunnableTask(p)?.id).toBe("f");
  });

  it("does not treat a dropped or blocked dependency as done", () => {
    const p = plan([task("a", "dropped"), task("b", "blocked"), task("c", "pending", ["a", "b"])]);
    expect(nextRunnableTask(p)).toBeNull();
  });
});

describe("PlanSchema", () => {
  it("rejects duplicate task ids and unknown dependencies", () => {
    const result = PlanSchema.safeParse(plan([task("a", "pending"), task("a", "pending", ["zz"])]));
    expect(result.success).toBe(false);
    const messages = result.error!.issues.map((i) => i.message).join("\n");
    expect(messages).toContain('Duplicate task id "a"');
    expect(messages).toContain('depends on unknown "zz"');
  });

  it("rejects an unknown status", () => {
    expect(
      PlanSchema.safeParse(plan([{ ...task("a", "pending"), status: "finished" as never }]))
        .success,
    ).toBe(false);
  });
});

describe("run names", () => {
  it("normalises what people type into a domain", () => {
    expect(normalizeDomain("https://www.Example.com/pricing?x=1")).toBe("example.com");
    expect(normalizeDomain("app.example.co.uk")).toBe("app.example.co.uk");
  });

  it("rejects something that is not a domain", () => {
    expect(() => normalizeDomain("not a domain")).toThrow(RebError);
    expect(() => normalizeDomain("localhost")).toThrow(RebError);
  });

  it("builds <slug>-<local date>", () => {
    expect(runSlug("example.com", new Date(2026, 0, 5, 23, 59))).toBe("example-com-2026-01-05");
  });
});
