import { readFile, writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { getBrief, updateBrief, createRun } from "../../src/workflows/runs.js";
import { getPlan, nextTask, savePlan, updateTaskStatus } from "../../src/workflows/plan.js";
import { logRoleWork, tailEvents } from "../../src/workflows/logs.js";
import { redact, REDACTED } from "../../src/workflows/redact.js";
import { samplePlan, testContext } from "../helpers.js";

describe("logs/events.jsonl", () => {
  it("gets one appended line per workflow call, and earlier lines never change", async () => {
    const ctx = await testContext();
    const { slug, paths } = await createRun(ctx, { domain: "example.com" });
    const snapshots = [await readFile(paths.events, "utf8")];
    const calls = [
      () => getBrief(ctx, { run: slug }),
      () => updateBrief(ctx, { run: slug, changes: { plan_tier: "Free" } }),
      () => savePlan(ctx, { run: slug, plan: samplePlan, reason: "first" }),
      () => getPlan(ctx, { run: slug }),
      () => nextTask(ctx, { run: slug }),
      () => updateTaskStatus(ctx, { run: slug, task: "t1", status: "done" }),
      () => logRoleWork(ctx, { run: slug, role: "planner", summary: "Planned." }),
    ];
    for (const call of calls) {
      await call();
      snapshots.push(await readFile(paths.events, "utf8"));
    }
    for (let i = 1; i < snapshots.length; i++) {
      expect(snapshots[i]!.startsWith(snapshots[i - 1]!)).toBe(true);
      expect(snapshots[i]!.trim().split("\n")).toHaveLength(i + 1);
    }
    const tools = (await tailEvents(ctx, { run: slug, count: 100 })).events.map((e) => e.tool);
    expect(tools).toEqual([
      "create_run",
      "get_brief",
      "update_brief",
      "save_plan",
      "get_plan",
      "next_task",
      "update_task_status",
      "log_role_work",
    ]);
  });

  it("records failed calls too, without changing earlier lines", async () => {
    const ctx = await testContext();
    const { slug, paths } = await createRun(ctx, { domain: "example.com" });
    const before = await readFile(paths.events, "utf8");
    await expect(nextTask(ctx, { run: slug })).rejects.toThrow(/no plan yet/);
    const after = await readFile(paths.events, "utf8");
    expect(after.startsWith(before)).toBe(true);
    const last = JSON.parse(after.trim().split("\n").at(-1)!);
    expect(last).toMatchObject({ tool: "next_task", ok: false });
    expect(last.error).toContain("no plan yet");
  });

  it("keeps lines added by hand or by another process", async () => {
    const ctx = await testContext();
    const { slug, paths } = await createRun(ctx, { domain: "example.com" });
    const hand = (await readFile(paths.events, "utf8")) + '{"marker":true}\n';
    await writeFile(paths.events, hand);
    await getBrief(ctx, { run: slug });
    expect((await readFile(paths.events, "utf8")).startsWith(hand)).toBe(true);
  });

  it("tailing the log does not add to it", async () => {
    const ctx = await testContext();
    const { slug, paths } = await createRun(ctx, { domain: "example.com" });
    const before = await readFile(paths.events, "utf8");
    await tailEvents(ctx, { run: slug });
    expect(await readFile(paths.events, "utf8")).toBe(before);
  });

  it("redacts secrets before writing", async () => {
    const ctx = await testContext();
    const { slug, paths } = await createRun(ctx, { domain: "example.com" });
    await updateBrief(ctx, {
      run: slug,
      changes: { deadline: "Bearer FAKE-SECRET-123456 and https://x.com/?api_key=FAKE-SECRET-KEY" },
    });
    const text = await readFile(paths.events, "utf8");
    expect(text).not.toContain("FAKE-SECRET");
    expect(text).toContain(REDACTED);
  });
});

describe("redact", () => {
  it("removes Authorization, Cookie, Set-Cookie, tokens and API keys", () => {
    const input = {
      headers: [
        { name: "Authorization", value: "Basic FAKE-SECRET-1" },
        { name: "Accept", value: "text/html" },
      ],
      Cookie: "sid=FAKE-SECRET-2",
      "set-cookie": "sid=FAKE-SECRET-3",
      accessToken: "FAKE-SECRET-4",
      api_key: "FAKE-SECRET-5",
      nested: { note: "token=FAKE-SECRET-6&page=2", jwt: "eyJhbGciOi.eyJzdWIiOi.FAKESECRET7" },
      key: "sk-FAKESECRET8abc",
      plain: "nothing to hide",
    };
    const out = redact(input);
    expect(JSON.stringify(out)).not.toMatch(/FAKE-?SECRET/);
    expect(out.headers[1]).toEqual({ name: "Accept", value: "text/html" });
    expect(out.nested.note).toBe(`token=${REDACTED}&page=2`);
    expect(out.plain).toBe("nothing to hide");
    expect(input.Cookie).toBe("sid=FAKE-SECRET-2");
  });
});

describe("log_role_work", () => {
  it("appends entries to logs/roles/<role>.md", async () => {
    const ctx = await testContext();
    const { slug, paths } = await createRun(ctx, { domain: "example.com" });
    await logRoleWork(ctx, {
      run: slug,
      role: "desk_researcher",
      summary: "Read the pricing page.",
      task: "t1",
    });
    await logRoleWork(ctx, { run: slug, role: "desk_researcher", summary: "Read the docs." });
    const text = await readFile(paths.role("desk_researcher"), "utf8");
    expect(text).toMatch(/\(task t1\)\n\nRead the pricing page\.[\s\S]*Read the docs\./);
  });

  it("rejects an unknown role", async () => {
    const ctx = await testContext();
    const { slug } = await createRun(ctx, { domain: "example.com" });
    await expect(
      logRoleWork(ctx, { run: slug, role: "wizard", summary: "x" }),
    ).rejects.toMatchObject({ fix: expect.stringContaining("planner, auditor") });
  });
});
