import { readFile, writeFile, appendFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RebError } from "../../src/domain/errors.js";
import { listEvidence } from "../../src/workflows/evidence.js";
import { importInbox, makeTestDataset, makeTestPlan } from "../../src/workflows/handsOn.js";
import { readJsonLines } from "../../src/storage/jsonl.js";
import { filesUnder, sampleRun, testContext } from "../helpers.js";

const HAR = "evidence/inbox/session-01/network.har";

async function setup() {
  const ctx = await testContext();
  const run = await sampleRun();
  return { ctx, run };
}

/** Every planted fake secret in the fixture HAR contains this text. */
const FAKE = "FAKE-SECRET";

describe("make_test_plan", () => {
  it("covers every journey node and every question node, and says what to capture", async () => {
    const { ctx, run } = await setup();
    const result = await makeTestPlan(ctx, { run });
    const covered = new Set(result.steps.flatMap((s) => s.covers));
    for (const id of ["journey-export-notes", "question-export-formats"]) {
      expect(covered, id).toContain(id);
    }
    const journey = result.steps.find((s) => s.kind === "journey")!;
    expect(journey.do.join(" ")).toContain("Act as Team lead");
    expect(journey.capture.map((c) => c.as)).toEqual([
      "feature-search--1.png",
      "feature-export--2.png",
      "journey-export-notes--end.png",
      "- [journey-export-notes] how it went, in one or two sentences",
    ]);
    // A feature above the user's plan gets a warning, never a way around it.
    const other = result.steps.find((s) => s.kind === "feature")!;
    expect(other.do[0]).toContain("may need Business");
    expect(result.steps[0]!.do.join(" ")).toContain("never log in or click for you");
  });

  it("writes the checklist to notes/ and makes the next empty inbox session", async () => {
    const { ctx, run } = await setup();
    const result = await makeTestPlan(ctx, { run });
    // session-01 already has captures, so the plan is for session-02.
    expect(result.session).toBe("session-02");
    expect(result.file).toBe("notes/test-plan-session-02.md");
    const text = await readFile(join(run, result.file), "utf8");
    expect(text).toContain("## 2. Journey: Export notes");
    expect(text).toContain('- [ ] Step 2: use "Export".');
    expect(await filesUnder(join(run, "evidence/inbox"))).not.toContain("session-02");
    // Asking again reuses the still-empty session-02.
    expect((await makeTestPlan(ctx, { run })).session).toBe("session-02");
  });

  it("warns when the graph has no journeys or questions", async () => {
    const ctx = await testContext();
    const { createRun } = await import("../../src/workflows/runs.js");
    const { slug } = await createRun(ctx, { domain: "example.com" });
    const result = await makeTestPlan(ctx, { run: slug });
    expect(result.session).toBe("session-01");
    expect(result.warnings[0]).toContain("no journey or question nodes");
  });

  it("refuses a bad session name", async () => {
    const { ctx, run } = await setup();
    await expect(makeTestPlan(ctx, { run, session: "../x" })).rejects.toThrow(RebError);
  });
});

describe("make_test_dataset", () => {
  it("writes fake CSV files for the category and the graph's data objects", async () => {
    const { ctx, run } = await setup();
    const result = await makeTestDataset(ctx, { run, rows: 3 });
    expect(result.category).toBe("b2b-saas");
    expect(result.files).toEqual([
      "notes/test-data/users.csv",
      "notes/test-data/companies.csv",
      "notes/test-data/projects.csv",
      "notes/test-data/note.csv",
    ]);
    const users = await readFile(join(run, "notes/test-data/users.csv"), "utf8");
    expect(users.split("\n")[1]).toBe("Test User 01,test.user01@example.com,admin,Test Team 01");
  });

  it("writes JSON when asked", async () => {
    const { ctx, run } = await setup();
    await makeTestDataset(ctx, { run, format: "json", rows: 1 });
    const rows = JSON.parse(await readFile(join(run, "notes/test-data/note.json"), "utf8"));
    expect(rows).toEqual([
      { name: "Test Note 01", created_by: "test.user01@example.com", created_on: "2026-01-01" },
    ]);
  });
});

describe("import_inbox", () => {
  it("dry run lists 1 screenshot, 2 notes and 1 HAR, all observed, and writes no evidence", async () => {
    const { ctx, run } = await setup();
    const before = await filesUnder(run);
    const result = await importInbox(ctx, { run, session: "session-01", dry_run: true });
    expect(result.summary).toBe("Would import 4 items: 1 screenshot, 2 notes, 1 HAR.");
    expect(result.items.every((i) => i.confidence === "observed" && i.status === "new")).toBe(true);
    // Only the call's own event line is added: no ledger, no summary.
    const added = (await filesUnder(run)).filter((f) => !before.includes(f));
    expect(added.filter((f) => f !== "logs/events.jsonl")).toEqual([]);
  });

  it("creates one observed evidence record per item, linked to the named nodes", async () => {
    const { ctx, run } = await setup();
    const result = await importInbox(ctx, { run, session: "session-01" });
    expect(result.summary).toBe("Imported 4 items: 1 screenshot, 2 notes, 1 HAR.");
    const { records } = await listEvidence(ctx, { run, kind: "evidence" });
    expect(records).toHaveLength(4);
    expect(records.every((r) => r.kind === "evidence" && r.confidence === "observed")).toBe(true);
    const bySubject = Object.fromEntries(
      records.map((r) => [r.kind === "evidence" ? r.subject : "", r]),
    );
    expect(bySubject["question-export-formats"]).toMatchObject({
      finding: "Only CSV and Markdown are offered; there is no PDF option.",
      links: ["feature-export"],
      role: "walkthrough_coach",
      operation: "import_inbox",
    });
    // The screenshot is named after its node; its caption comes from the note that mentions it.
    expect(bySubject["feature-export"]!).toMatchObject({
      finding: expect.stringContaining("Exporting took three clicks"),
    });
    // The HAR names no node, so it goes to the only product node.
    expect(bySubject["product-acme-notes"]).toMatchObject({
      role: "tech_observer",
      finding: expect.stringContaining("Polling: GET /api/v1/exports/status every 5 s"),
    });
    expect(bySubject["product-acme-notes"]!.finding).toContain(
      "server-sent events at /api/v1/events",
    );
    // Each file is one source record pointing at the inbox file.
    const sources = await listEvidence(ctx, { run, kind: "source" });
    expect(sources.records.map((s) => (s.kind === "source" ? s.url : ""))).toEqual([
      "evidence/inbox/session-01/notes.md",
      "evidence/inbox/session-01/feature-export--1.png",
      HAR,
    ]);
  });

  it("never stores a HAR secret: not in the ledger, the summary, the log or any other file", async () => {
    const { ctx, run } = await setup();
    const raw = await readFile(join(run, HAR), "utf8");
    expect(raw.split(FAKE).length - 1).toBeGreaterThan(20); // the fixture really holds secrets
    await importInbox(ctx, { run, session: "session-01" });
    const summary = await readFile(
      join(run, "evidence/imports/session-01/network.har.summary.json"),
      "utf8",
    );
    expect(summary).toContain("/api/v1/share/:id");
    expect(summary).toContain("access_token=[REDACTED]");
    expect(summary).toContain('"max_ms": 640');
    for (const file of await filesUnder(run)) {
      if (file === HAR) continue;
      expect(await readFile(join(run, file), "utf8"), file).not.toContain(FAKE);
    }
  });

  it("can delete the raw HAR after import, and warns while it is still there", async () => {
    const { ctx, run } = await setup();
    const first = await importInbox(ctx, { run, session: "session-01" });
    expect(first.warnings.join(" ")).toContain(`${HAR} still holds cookies and tokens`);
    const second = await importInbox(ctx, { run, session: "session-01", delete_raw_har: true });
    expect(second.deleted).toEqual([HAR]);
    expect(await filesUnder(join(run, "evidence/inbox/session-01"))).toEqual([
      "feature-export--1.png",
      "notes.md",
    ]);
    for (const file of await filesUnder(run)) {
      expect(await readFile(join(run, file), "latin1"), file).not.toContain(FAKE);
    }
  });

  it("importing the same session twice does not create duplicates; a new note adds one record", async () => {
    const { ctx, run } = await setup();
    await importInbox(ctx, { run, session: "session-01" });
    const again = await importInbox(ctx, { run, session: "session-01" });
    expect(again.summary).toBe("Imported 0 items: nothing.");
    expect(again.items.every((i) => i.status === "already imported")).toBe(true);
    await appendFile(
      join(run, "evidence/inbox/session-01/notes.md"),
      "- [feature-search] Search finds words inside notes.\n",
    );
    const third = await importInbox(ctx, { run, session: "session-01" });
    expect(third.summary).toBe("Imported 1 item: 1 note.");
    const { records } = await listEvidence(ctx, { run, kind: "evidence" });
    expect(records).toHaveLength(5);
  });

  it("skips items that name no node and files it does not import", async () => {
    const { ctx, run } = await setup();
    await writeFile(
      join(run, "evidence/inbox/session-01/extra.txt"),
      "- a finding without a node\n",
    );
    await writeFile(join(run, "evidence/inbox/session-01/clip.mp4"), "not a video");
    // Two product nodes: no default subject any more.
    await writeFile(
      join(run, "kb/nodes/product-acme-docs.md"),
      "---\nid: product-acme-docs\ntype: product\nname: Acme Docs\nlabel: inferred\n---\n",
    );
    const result = await importInbox(ctx, { run, session: "session-01", dry_run: true });
    const skipped = result.items.filter((i) => i.status === "skipped");
    expect(skipped.map((i) => i.file).sort()).toEqual([
      "evidence/inbox/session-01/clip.mp4",
      "evidence/inbox/session-01/extra.txt",
      HAR,
    ]);
    expect(skipped.find((i) => i.file.endsWith("extra.txt"))!.reason).toContain("[node-id]");
    const withSubject = await importInbox(ctx, {
      run,
      session: "session-01",
      subject: "product-acme-notes",
      dry_run: true,
    });
    expect(withSubject.summary).toBe("Would import 5 items: 1 screenshot, 3 notes, 1 HAR.");
  });

  it("skips a file that is not a HAR instead of stopping the import", async () => {
    const { ctx, run } = await setup();
    await writeFile(join(run, "evidence/inbox/session-01/broken.har"), "{ not json");
    const result = await importInbox(ctx, { run, session: "session-01" });
    expect(result.summary).toBe("Imported 4 items: 1 screenshot, 2 notes, 1 HAR.");
    const broken = result.items.find((i) => i.file.endsWith("broken.har"))!;
    expect(broken).toMatchObject({
      status: "skipped",
      reason: "This file is not a HAR: it is not JSON.",
    });
  });

  it("redacts secrets the user typed into a note", async () => {
    const { ctx, run } = await setup();
    await writeFile(
      join(run, "evidence/inbox/session-01/notes.md"),
      "- [feature-export] The export link was https://app.acme-notes.example/x?token=FAKE-SECRET-TYPED\n",
    );
    await importInbox(ctx, { run, session: "session-01" });
    const ledger = await readFile(join(run, "evidence/ledger.jsonl"), "utf8");
    expect(ledger).toContain("token=[REDACTED]");
    expect(ledger).not.toContain(FAKE);
  });

  it("gives a clear error for a missing session and logs only safe arguments", async () => {
    const { ctx, run } = await setup();
    await expect(importInbox(ctx, { run, session: "session-09" })).rejects.toThrow(
      "There is no inbox folder evidence/inbox/session-09",
    );
    await importInbox(ctx, { run, session: "session-01" });
    const events = (await readJsonLines(join(run, "logs/events.jsonl"))) as Array<{
      tool: string;
      args: unknown;
    }>;
    expect(events.map((e) => e.tool)).toEqual(["import_inbox", "import_inbox"]);
    expect(events[1]!.args).toEqual({ session: "session-01" });
  });
});
