import { readdir, readFile, writeFile } from "node:fs/promises";
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
    for (const name of ["new", "list", "plan", "log"]) {
      expect(help).toMatch(new RegExp(`^\\s+${name}\\b`, "m"));
    }
    for (const { name } of PLANNED_COMMANDS) {
      expect(help).toMatch(new RegExp(`^\\s+${name}\\b.*\\(not yet available\\)`, "m"));
    }
    expect(PLANNED_COMMANDS.map((c) => c.name)).toEqual([
      "kb",
      "evidence",
      "audit",
      "report",
      "dashboard",
      "doctor",
      "update",
      "setup",
      "mcp",
    ]);
  });

  it("explains how to proceed when a planned command is used", async () => {
    await expect(run("doctor")).rejects.toThrow(RebError);
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
