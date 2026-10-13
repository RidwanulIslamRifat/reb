import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildProgram, PLANNED_COMMANDS } from "../src/adapters/cli/program.js";
import { RebError } from "../src/domain/errors.js";

// Runs the CLI in-process and returns what it printed instead of exiting.
async function run(...args: string[]): Promise<string> {
  let output = "";
  const program = buildProgram()
    .exitOverride()
    .configureOutput({
      writeOut: (text) => (output += text),
      writeErr: (text) => (output += text),
    });
  try {
    await program.parseAsync(args, { from: "user" });
  } catch (error) {
    if (!(error instanceof Error && "code" in error)) throw error;
  }
  return output;
}

describe("reb CLI", () => {
  it("prints the version from package.json", async () => {
    const { version } = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };
    expect((await run("--version")).trim()).toBe(version);
  });

  it("lists every planned command as not yet available in --help", async () => {
    const help = await run("--help");
    expect(help).toContain("Usage: reb");
    for (const { name } of PLANNED_COMMANDS) {
      expect(help).toMatch(new RegExp(`^\\s+${name}\\b.*\\(not yet available\\)`, "m"));
    }
    expect(PLANNED_COMMANDS.map((c) => c.name)).toEqual([
      "new",
      "plan",
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
