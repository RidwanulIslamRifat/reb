import { cp, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildProgram, PLANNED_COMMANDS } from "../src/adapters/cli/program.js";
import { RebError } from "../src/domain/errors.js";
import { samplePlan, tempDir } from "./helpers.js";

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
      "setup",
      "update",
      "doctor",
      "mcp",
    ]) {
      expect(help).toMatch(new RegExp(`^\\s+${name}\\b`, "m"));
    }
    for (const { name } of PLANNED_COMMANDS) {
      expect(help).toMatch(new RegExp(`^\\s+${name}\\b.*\\(not yet available\\)`, "m"));
    }
    expect(PLANNED_COMMANDS.map((c) => c.name)).toEqual(["audit", "report", "dashboard"]);
  });

  it("explains how to proceed when a planned command is used", async () => {
    await expect(run("audit")).rejects.toThrow(RebError);
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
    expect(out).toMatch(/\s6 {2}api +GET app\.acme-notes\.example\/api\/v1\/notifications\?/);
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
