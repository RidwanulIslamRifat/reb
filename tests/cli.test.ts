import { cp, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildProgram, PLANNED_COMMANDS } from "../src/adapters/cli/program.js";
import { RebError } from "../src/domain/errors.js";
import { reportSampleRun, samplePlan, sampleRun, tempDir } from "./helpers.js";

// Runs the CLI in-process with REB_HOME set to `home` and returns what it printed.
async function cli(home: string, ...args: string[]): Promise<string> {
  let output = "";
  const program = buildProgram({ out: (text) => (output += text), env: { REB_HOME: home } })
    .exitOverride()
    .configureOutput({
      writeOut: (text) => (output += text),
      writeErr: (text) => (output += text),
      getOutHelpWidth: () => 200,
    });
  try {
    await program.parseAsync(args, { from: "user" });
  } catch (error) {
    if (!(error instanceof Error && "code" in error)) throw error;
  }
  return output;
}

const run = (...args: string[]) => cli("unused", ...args);

describe("reb CLI", () => {
  it("prints the version from package.json", async () => {
    const { version } = JSON.parse(await readFile("package.json", "utf8")) as { version: string };
    expect((await run("--version")).trim()).toBe(version);
  });

  it("lists the real commands and every planned one as not yet available in --help", async () => {
    const help = await run("--help");
    expect(help).toContain("Usage: reb");
    for (const name of [
      "new",
      "list",
      "plan",
      "log",
      "evidence",
      "kb",
      "audit",
      "setup",
      "update",
      "doctor",
      "mcp",
      "dashboard",
    ]) {
      expect(help).toMatch(new RegExp(`^\\s+${name}\\b`, "m"));
    }
    for (const { name } of PLANNED_COMMANDS) {
      expect(help).toMatch(new RegExp(`^\\s+${name}\\b.*\\(not yet available\\)`, "m"));
    }
    expect(PLANNED_COMMANDS).toEqual([]);
    expect(help).toMatch(/^\s+report\b/m);
  });
});

describe("runs, plans and logs from the CLI", () => {
  it("new, list, plan save/show/next/set-status and log tail work together", async () => {
    const home = join(await tempDir(), "runs");
    expect(await cli(home, "new", "example.com", "--reports", "business,feature")).toMatch(
      /^Created run example-com-\d{4}-\d{2}-\d{2}\n/,
    );
    const [slug] = await readdir(home);
    expect(await cli(home, "list")).toContain(`${slug}  example.com  (no plan)`);

    const file = join(home, "..", "plan.json");
    await writeFile(file, JSON.stringify(samplePlan));
    expect(await cli(home, "plan", "save", file, "--reason", "first plan")).toContain(
      "Saved plan v1 with 3 tasks.",
    );
    const show = await cli(home, "plan", "show");
    expect(show).toContain(`Using run ${slug}`);
    expect(show).toContain("1. [pending] t1  Read the home page  (desk_researcher)");
    expect(show).toContain("after: t1");

    expect(await cli(home, "plan", "set-status", "t1", "done", "--run", slug!)).toBe(
      "Task t1 is now done. Plan is now v2.\n",
    );
    expect(await cli(home, "plan", "next", "--run", slug!)).toContain("[pending] t2");

    const tail = await cli(home, "log", "tail", "--run", slug!, "-n", "2");
    expect(tail.trim().split("\n")).toHaveLength(2);
    expect(tail).toMatch(/cli {2}update_task_status {2}ok\n.*cli {2}next_task {2}ok\n$/);
  });

  it("shows a clear problem and fix for a missing run", async () => {
    const home = join(await tempDir(), "runs");
    const error = (await cli(home, "plan", "show", "--run", "nope").catch(
      (e: unknown) => e,
    )) as RebError;
    expect(error.format()).toMatch(/^Problem: .*\nFix: /);
  });
});

describe("evidence and knowledge graph from the CLI", () => {
  it("evidence source/add/list and kb add/link/show/query/stats/validate work together", async () => {
    const home = join(await tempDir(), "runs");
    await cli(home, "new", "example.com");
    const page = join(home, "..", "pricing.html");
    await writeFile(page, "<h1>Pricing</h1>");

    expect(
      await cli(
        home,
        "kb",
        "add",
        "feature",
        "Single",
        "sign-on",
        "--label",
        "documented",
        "--id",
        "feature-sso",
      ),
    ).toContain("Created node feature-sso");
    await cli(home, "kb", "add", "pricing_tier", "Pro", "--label", "documented");
    await cli(home, "kb", "add", "persona", "Admin", "--label", "inferred");
    expect(
      await cli(
        home,
        "evidence",
        "source",
        "https://example.com/pricing",
        "--title",
        "Pricing",
        "--published",
        "2026-09-01",
        "--file",
        page,
      ),
    ).toContain("Recorded S-001: Pricing");
    const add = (...extra: string[]) =>
      cli(
        home,
        "evidence",
        "add",
        "SSO is on the Pro plan",
        "--subject",
        "feature-sso",
        "--role",
        "desk_researcher",
        "--source",
        "S-001",
        "--confidence",
        "documented",
        "--operation",
        "read_public_page",
        ...extra,
      );
    expect(await add("--limitation", "Pricing pages change often")).toContain(
      "Recorded E-001 about feature-sso.",
    );
    expect(await add("--corrects", "E-001")).toContain(
      "Recorded E-002 about feature-sso (corrects E-001).",
    );
    expect(await cli(home, "kb", "link", "feature-sso", "gated_by", "pricing_tier-pro")).toContain(
      "Linked feature-sso gated_by pricing_tier-pro.",
    );
    await expect(cli(home, "kb", "link", "persona-admin", "makes", "feature-sso")).rejects.toThrow(
      RebError,
    );

    const list = await cli(home, "evidence", "list");
    expect(list).toContain("S-001  Pricing  https://example.com/pricing  (published 2026-09-01)");
    expect(list).toContain(
      'E-001  documented  feature-sso  "SSO is on the Pro plan"  (source S-001)  [corrected by E-002]',
    );

    const show = await cli(home, "kb", "show", "feature-sso");
    expect(show).toContain("feature-sso  Single sign-on  (feature, documented)");
    expect(show).toContain("gated_by pricing_tier-pro  Pro");
    expect(await cli(home, "kb", "query", "--type", "persona")).toContain(
      "persona-admin  Admin  (persona, inferred)",
    );
    const stats = await cli(home, "kb", "stats");
    expect(stats).toContain("Nodes: 3 (feature 1, persona 1, pricing_tier 1)");
    expect(stats).toContain("Features with evidence: 1 of 1");
    expect(await cli(home, "kb", "validate")).toContain("No problems found.");
  });

  it("validates the kb-sample fixture by folder path with a numbered list and a count", async () => {
    const copy = join(await tempDir(), "kb-sample");
    await cp("tests/fixtures/kb-sample", copy, { recursive: true });
    const output = await cli("unused", "kb", "validate", "--run", copy);
    expect(output).toMatch(/^1\. \[broken_link\] /);
    expect(output).toContain("feature-export has no evidence.");
    expect(output.trim().split("\n").at(-1)).toBe("6 problems found.");
  });
});

describe("research tools from the CLI", () => {
  it("evidence har prints endpoint patterns with counts and [REDACTED], never the fake secrets", async () => {
    const home = join(await tempDir(), "runs");
    const out = await cli(home, "evidence", "har", "tests/fixtures/har/sample.har");
    expect(out).toContain("15 requests to app.acme-notes.example");
    expect(out).toMatch(
      /\s6 {2}api +\d+\/\d+ +GET app\.acme-notes\.example\/api\/v1\/notifications\?/,
    );
    expect(out).toContain("polling every 10 s");
    expect(out).toContain("GET app.acme-notes.example/api/v1/users/:id");
    expect(out).toContain("[REDACTED]");
    expect(out).not.toContain("FAKE-SECRET");
  });

  it("evidence har refuses a file that is not a HAR", async () => {
    const home = join(await tempDir(), "runs");
    await expect(cli(home, "evidence", "har", "tests/fixtures/har/not-a-har.json")).rejects.toThrow(
      "This file is not a HAR",
    );
  });

  it("evidence read-page and stack refuse private addresses before reading anything", async () => {
    const home = join(await tempDir(), "runs");
    await cli(home, "new", "example.com");
    for (const command of ["read-page", "stack"]) {
      await expect(cli(home, "evidence", command, "http://192.168.0.1/")).rejects.toThrow(
        "local or private address",
      );
    }
  });
});

describe("planner and auditor from the CLI", () => {
  it("plan create, plan gate, audit and plan replan work together", async () => {
    const home = join(await tempDir(), "runs");
    await cli(
      home,
      "new",
      "example.com",
      "--category",
      "b2b-saas",
      "--reports",
      "business,feature",
    );
    const created = await cli(home, "plan", "create");
    expect(created).toContain("Created plan v1 from pipeline b2b-saas.");
    expect(created).toMatch(/^1\. \[pending\] company .*\(desk_researcher\)$/m);
    expect(created).toMatch(/\[pending\] pricing .*\(desk_researcher\) {2}after: company$/m);

    const gate = await cli(home, "plan", "gate", "company");
    expect(gate).toContain("[fail] at least 1 company node: found 0 company nodes, need 1");
    expect(gate).toContain("Not done yet");
    expect(await cli(home, "plan", "gate", "walkthrough")).toContain("[check yourself]");

    const audit = await cli(home, "audit");
    expect(audit).toMatch(/^Audit 1: \d+ gaps \(\d+ blocking/m);
    expect(audit).toMatch(/^1\. \[blocking\] No company nodes/m);
    expect(audit).toContain("Next: reb plan replan");
    const [slug] = await readdir(home);
    const file = join(home, slug!, "logs", "audits", "audit-1.md");
    expect(audit).toContain(`Written to ${file}`);

    // On a fresh plan every gap is covered by a pipeline task still to do: no duplicates.
    const replan = await cli(home, "plan", "replan");
    expect(replan).toContain(
      "No new tasks from audit 1: every gap is covered by a task already in the plan. Plan stays v1.",
    );
    expect(replan).toMatch(/- no new task: gap 1 is covered by existing task company /);
    expect(replan).toMatch(/Minor gap \d+ is not turned into tasks/);
    const decisions = await readFile(join(home, slug!, "logs", "decisions.md"), "utf8");
    expect(decisions).toContain("covered by existing task company");
    expect(audit).toContain("Warning: brief.md is still empty");
    expect(created).toContain("Warning: brief.md is still empty");
  });

  it("replan reads explicit changes from a file", async () => {
    const home = join(await tempDir(), "runs");
    await cli(home, "new", "example.com", "--category", "ai-tool", "--reports", "build");
    await cli(home, "plan", "create");
    await cli(home, "audit");
    const file = join(home, "..", "changes.json");
    await writeFile(file, JSON.stringify([{ op: "drop", gap: 1, task: "tech" }]));
    const out = await cli(home, "plan", "replan", "--changes", file, "--audit", "1");
    expect(out).toContain("- dropped task tech (audit 1 item 1");
  });
});

describe("hands-on tools from the CLI", () => {
  it("evidence import --dry-run lists what would be imported and imports nothing", async () => {
    const run = await sampleRun();
    const out = await cli("unused", "evidence", "import", "session-01", "--run", run, "--dry-run");
    expect(out).toContain("Would import 4 items: 1 screenshot, 2 notes, 1 HAR.");
    expect(out).toMatch(
      /har +observed +evidence\/inbox\/session-01\/network\.har -> product-acme-notes/,
    );
    expect(out).toContain("Dry run: nothing was imported.");
    expect(out).not.toContain("FAKE-SECRET");
    expect(await readdir(join(run, "evidence"))).not.toContain("ledger.jsonl");
  });

  it("evidence import, test-plan and dataset work on the sample run", async () => {
    const run = await sampleRun();
    const imported = await cli(
      "unused",
      "evidence",
      "import",
      "session-01",
      "--run",
      run,
      "--delete-har",
    );
    expect(imported).toContain("Imported 4 items");
    expect(imported).toContain("Deleted raw HAR evidence/inbox/session-01/network.har.");
    const plan = await cli("unused", "evidence", "test-plan", "--run", run);
    expect(plan).toContain("Test plan for session-02");
    expect(plan).toContain("Journey: Export notes");
    const data = await cli("unused", "evidence", "dataset", "--run", run, "--rows", "2");
    expect(data).toContain("notes/test-data/users.csv  (2 rows)");
    expect(data).toContain("All values are fictional.");
  });

  it("evidence rea stores a saved passive REA result and refuses other tools", async () => {
    const run = await sampleRun();
    const file = join(run, "rea-result.json");
    await writeFile(
      file,
      JSON.stringify({ scripts: ["https://js.stripe.example/v3?key=FAKE-SECRET-K"] }),
    );
    const args = [
      "--run",
      run,
      "--subject",
      "feature-export",
      "--source",
      "https://acme-notes.example/",
    ];
    const ok = await cli(
      "unused",
      "evidence",
      "rea",
      "analyze_web_bundle",
      file,
      ...args,
      "--finding",
      "Uses Stripe.",
    );
    expect(ok).toMatch(/Recorded E-001 about feature-export \(inferred\)/);
    await expect(
      cli("unused", "evidence", "rea", "browser_navigate", file, ...args, "--finding", "x"),
    ).rejects.toThrow("never used");
  });

  it("report writes the Markdown and, with --docx, the Word copy", async () => {
    const dir = await reportSampleRun();
    const output = await cli("unused", "report", "feature", "--docx", "--run", dir);
    expect(output).toMatch(
      /The feature report has 5 sections, \d+ cited ids, 4 sources and 1 open question\./,
    );
    expect(output).toContain(join(dir, "reports", "feature.md"));
    expect(output).toContain(join(dir, "reports", "feature.docx"));
    await expect(cli("unused", "report", "summary", "--run", dir)).rejects.toThrow(
      '"summary" is not a report type',
    );
  });
});
