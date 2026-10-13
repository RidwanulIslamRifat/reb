import { createRequire } from "node:module";
import { Command } from "commander";
import { RebError } from "../../domain/errors.js";

const require = createRequire(import.meta.url);
const { version } = require("../../../package.json") as { version: string };

export const VERSION = version;

/** Commands from SPEC 3 and ROADMAP. Each milestone replaces a placeholder with the real command. */
export const PLANNED_COMMANDS: ReadonlyArray<{ name: string; description: string }> = [
  { name: "new", description: "Create a run for a product domain" },
  { name: "plan", description: "Show and update the analysis plan" },
  { name: "kb", description: "Work with the knowledge graph" },
  { name: "evidence", description: "Record and list evidence" },
  { name: "audit", description: "Check the analysis for gaps" },
  { name: "report", description: "Render the requested reports" },
  { name: "dashboard", description: "Open the local read-only dashboard" },
  { name: "doctor", description: "Check that reb is set up correctly" },
  { name: "update", description: "Update reb and refresh agent registrations" },
  { name: "setup", description: "Register reb with your AI agents" },
  { name: "mcp", description: "Start the MCP server for AI agents" },
];

export function buildProgram(): Command {
  const program = new Command("reb")
    .description("Evidence-backed analysis of SaaS products.")
    .version(VERSION, "-v, --version", "Print the reb version");

  for (const { name, description } of PLANNED_COMMANDS) {
    program
      .command(name)
      .description(`${description} (not yet available)`)
      .allowUnknownOption()
      .allowExcessArguments()
      .action(() => {
        throw new RebError(
          `The "${name}" command is not yet available in reb ${VERSION}.`,
          "Update reb later, or see docs/ROADMAP.md for when it is planned.",
        );
      });
  }

  return program;
}
