import { cp, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildProgram } from "../../src/adapters/cli/program.js";
import { readJsonLines } from "../../src/storage/jsonl.js";
import { tempDir } from "../helpers.js";

/**
 * M10 end-to-end test: one whole analysis of a made-up product (Tidyhive, tidyhive.example), done the
 * way a person or their agent would, through reb's own commands only: new run, plan, evidence, graph,
 * audit, re-plan, a second audit and the report. Nothing touches the internet; every source is
 * recorded with a fixed fingerprint instead of being read.
 *
 * Set REB_E2E_KEEP=<folder> to keep a copy of the finished run (this is how examples/ was made).
 */

const SHA = "0".repeat(64);
const RUN_PREFIX = "tidyhive-example-";

// What the desk research "found": [type, name, source, finding]. Ids are <type>-<name in kebab case>.
const FIRST_ROUND: Array<[string, string, string, string]> = [
  ["company", "Tidyhive Labs", "S-001", "Tidyhive Labs makes Tidyhive, says the site footer."],
  ["product", "Tidyhive", "S-001", "Tidyhive is a shared task board for small teams."],
  ["module", "Boards", "S-001", "The home page groups the board features under Boards."],
  ["module", "Admin", "S-004", "The help center has an Admin section for workspace owners."],
  ["feature", "Kanban board", "S-001", "Tasks move between columns on a board."],
  ["feature", "Recurring tasks", "S-004", "A task can repeat daily, weekly or monthly."],
  ["feature", "CSV export", "S-004", "A board can be exported as a CSV file."],
  ["feature", "Single sign-on", "S-002", "Single sign-on is listed on the Team plan only."],
  [
    "feature",
    "Audit log",
    "S-002",
    "An audit log of workspace changes is listed on the Team plan.",
  ],
  ["pricing_tier", "Free", "S-002", "Free costs nothing, for up to 3 people."],
  ["pricing_tier", "Team", "S-002", "Team costs 6 USD per person per month."],
];

// Found only after the first audit pointed at the gaps.
const SECOND_ROUND: Array<[string, string, string, string]> = [
  ["integration", "Slack", "S-003", "Board changes can be posted to a Slack channel."],
  ["persona", "Team lead", "S-004", "The getting-started guide is written for a team lead."],
  [
    "journey",
    "Set up a board",
    "S-004",
    "The guide's first steps: create a board, add columns, add tasks.",
  ],
  [
    "journey",
    "Invite a teammate",
    "S-004",
    "Teammates are invited by email from the Admin module.",
  ],
];

const LINKS: Array<[string, string, string]> = [
  ["company-tidyhive-labs", "makes", "product-tidyhive"],
  ["product-tidyhive", "has", "module-boards"],
  ["product-tidyhive", "has", "module-admin"],
  ["module-boards", "has", "feature-kanban-board"],
  ["module-boards", "has", "feature-recurring-tasks"],
  ["module-boards", "has", "feature-csv-export"],
  ["module-admin", "has", "feature-single-sign-on"],
  ["module-admin", "has", "feature-audit-log"],
  ["feature-single-sign-on", "gated_by", "pricing_tier-team"],
  ["feature-audit-log", "gated_by", "pricing_tier-team"],
];

const DRAFT = `# Feature report draft

Tidyhive is a shared task board for small teams [product-tidyhive, E-002], made by Tidyhive Labs
[company-tidyhive-labs, E-001].

## Product and modules

The product has two modules: Boards for everyday work and Admin for workspace owners
[module-boards, module-admin].

## Features

- Boards hold the core work: a kanban board, recurring tasks and CSV export [feature-kanban-board,
  feature-recurring-tasks, feature-csv-export].
- Single sign-on and the audit log are Team plan features [feature-single-sign-on, E-008, E-009].

## Key journeys

A team lead sets up a board and then invites teammates [persona-team-lead, journey-set-up-a-board,
journey-invite-a-teammate].

## What each plan includes

Free is for up to 3 people; Team adds single sign-on and the audit log [pricing_tier-free, E-010,
pricing_tier-team, E-011].

## Integrations

Slack is the only integration found so far [integration-slack, E-012].
`;

// Runs the CLI in-process with REB_HOME set to `home` and returns what it printed.
// A failing command throws, so the test stops at the step that went wrong.
async function cli(home: string, ...args: string[]): Promise<string> {
  let output = "";
  const program = buildProgram({ out: (text) => (output += text), env: { REB_HOME: home } })
    .exitOverride()
    .configureOutput({
      writeOut: (text) => (output += text),
      writeErr: (text) => (output += text),
      getOutHelpWidth: () => 200,
    });
  await program.parseAsync(args, { from: "user" });
  return output;
}

describe("end to end: one whole analysis from the CLI, with fixtures only", () => {
  it("goes from a new run to a cited report through plan, evidence, graph, audit and re-plan", async () => {
    const home = await tempDir();
    const reb = (...args: string[]) => cli(home, ...args);

    // 1. New run, and the brief the person fills in.
    expect(
      await reb("new", "tidyhive.example", "--category", "b2b-saas", "--reports", "feature"),
    ).toMatch(/Created run tidyhive-example-\d{4}-\d{2}-\d{2}/);
    const [slug] = (await readdir(home)).filter((name) => name.startsWith(RUN_PREFIX));
    const dir = join(home, slug!);
    const brief = (await readFile(join(dir, "brief.md"), "utf8"))
      .replace('plan_tier: ""', 'plan_tier: "Free"')
      .replace(
        /\n# Brief\n[\s\S]*$/,
        "\n# Brief\n\nMade-up sample product for the reb examples.\n",
      );
    await writeFile(join(dir, "brief.md"), brief);
    const r = ["--run", slug!];

    // 2. Plan.
    expect(await reb("plan", "create", ...r)).toContain("Created plan v1 from pipeline b2b-saas.");
    expect(await reb("plan", "next", ...r)).toContain("[pending] company");

    // 3. Evidence and graph, first round.
    for (const [url, title] of [
      ["https://tidyhive.example", "Tidyhive home page"],
      ["https://tidyhive.example/pricing", "Tidyhive pricing"],
      ["https://tidyhive.example/integrations", "Tidyhive integrations"],
      ["https://help.tidyhive.example", "Tidyhive help center"],
    ]) {
      await reb(
        "evidence",
        "source",
        url!,
        "--title",
        title!,
        "--publisher",
        "Tidyhive Labs",
        "--published",
        "2026-09-01",
        "--sha256",
        SHA,
        ...r,
      );
    }
    const research = async (rows: typeof FIRST_ROUND) => {
      for (const [type, name, source, finding] of rows) {
        const id = `${type}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
        await reb("kb", "add", type, name, "--label", "documented", ...r);
        const out = await reb(
          "evidence",
          "add",
          finding,
          "--subject",
          id,
          "--role",
          "desk_researcher",
          "--source",
          source,
          "--confidence",
          "documented",
          "--operation",
          "read_public_page",
          ...r,
        );
        const evidence = /Recorded (E-\d+)/.exec(out)![1]!;
        await reb("kb", "link", id, "evidence", evidence, ...r);
      }
    };
    await research(FIRST_ROUND);
    for (const [from, type, to] of LINKS) await reb("kb", "link", from, type, to, ...r);
    await reb("log", "role", "desk_researcher", "Read the home, pricing and help pages.", ...r);
    for (const task of [
      "company",
      "pricing",
      "features",
      "integrations",
      "walkthrough",
      "personas",
      "curate",
    ]) {
      await reb("plan", "set-status", task, "done", "--reason", "research round 1 finished", ...r);
    }

    // 4. Audit finds what is missing; re-plan adds a task for each gap.
    const audit1 = await reb("audit", ...r);
    expect(audit1).toContain("Audit 1: 3 gaps (1 blocking, 2 major, 0 minor)");
    expect(audit1).toContain("No journey nodes, but the reports need at least 2");
    await reb("plan", "set-status", "audit", "done", "--reason", "audit 1 written", ...r);
    const replan = await reb("plan", "replan", ...r);
    expect(replan).toMatch(/a1-journey/);
    expect(replan).toMatch(/a1-persona/);
    expect(replan).toMatch(/a1-integration/);
    expect(replan).toMatch(/audit-r1/);
    const decisions = await readFile(join(dir, "logs", "decisions.md"), "utf8");
    expect(decisions).toContain("audit 1 item 1");

    // 5. Second round of research closes the gaps; the second audit says stop.
    await research(SECOND_ROUND);
    await reb("kb", "link", "persona-team-lead", "does", "journey-set-up-a-board", ...r);
    await reb("kb", "link", "persona-team-lead", "does", "journey-invite-a-teammate", ...r);
    await reb("kb", "link", "journey-set-up-a-board", "uses", "feature-kanban-board", ...r);
    await reb("kb", "link", "feature-kanban-board", "connects_to", "integration-slack", ...r);
    for (const task of ["a1-journey", "a1-persona", "a1-integration"]) {
      await reb("plan", "set-status", task, "done", "--reason", "research round 2 finished", ...r);
    }
    const audit2 = await reb("audit", ...r);
    expect(audit2).toContain("Audit 2: 0 gaps");
    expect(audit2).toMatch(/no blocking gaps/);
    await reb("plan", "set-status", "audit-r1", "done", "--reason", "audit 2 found no gaps", ...r);
    expect(await reb("kb", "validate", ...r)).toMatch(/no problems/i);
    await reb("kb", "stats", ...r);

    // 6. Report, with the report writer's draft.
    await writeFile(join(dir, "notes", "report-feature.md"), DRAFT);
    const report = await reb("report", "feature", "--docx", ...r);
    expect(report).toMatch(/feature\.md/);
    await reb("plan", "set-status", "report-feature", "done", "--reason", "report written", ...r);
    await reb("log", "role", "report_writer", "Wrote the feature report from the graph.", ...r);

    const text = await readFile(join(dir, "reports", "feature.md"), "utf8");
    expect(text.startsWith("# Feature report: tidyhive.example\n")).toBe(true);
    for (const heading of [
      "Product and modules",
      "Features",
      "Key journeys",
      "What each plan includes",
      "Integrations",
      "Sources",
      "Open questions",
    ]) {
      expect(text).toContain(`## ${heading}`);
    }
    expect(text).toContain("[integration-slack, E-012]");
    expect((await readFile(join(dir, "reports", "feature.docx"))).subarray(0, 2).toString()).toBe(
      "PK",
    );

    // Every step is in the activity log, made through the CLI, and none failed.
    const events = (await readJsonLines(join(dir, "logs", "events.jsonl"))) as Array<{
      tool: string;
      via: string;
      ok: boolean;
    }>;
    expect(events.every((e) => e.via === "cli" && e.ok)).toBe(true);
    expect(new Set(events.map((e) => e.tool))).toEqual(
      new Set([
        "create_run",
        "create_plan",
        "next_task",
        "record_source",
        "upsert_node",
        "record_evidence",
        "link_nodes",
        "log_role_work",
        "update_task_status",
        "run_audit",
        "apply_replan",
        "validate_graph",
        "build_graph",
        "render_report",
      ]),
    );
    const plan = JSON.parse(await readFile(join(dir, "plan", "plan.json"), "utf8")) as {
      version: number;
      tasks: Array<{ status: string }>;
    };
    expect(plan.version).toBeGreaterThan(10);
    expect(plan.tasks.filter((t) => t.status !== "done")).toEqual([]);

    if (process.env.REB_E2E_KEEP) {
      await cp(dir, process.env.REB_E2E_KEEP, { recursive: true });
    }
  });
});
