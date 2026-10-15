import { createRequire } from "node:module";
import { Command } from "commander";
import { RebError } from "../../domain/errors.js";
import { registerAudit } from "./commands/audit.js";
import { registerCapture } from "./commands/capture.js";
import { registerCompare } from "./commands/compare.js";
import { registerDashboard } from "./commands/dashboard.js";
import { registerEvidence } from "./commands/evidence.js";
import { registerKb } from "./commands/kb.js";
import { registerList } from "./commands/list.js";
import { registerLog } from "./commands/log.js";
import { registerNew } from "./commands/new.js";
import { registerPlan } from "./commands/plan.js";
import { registerReport } from "./commands/report.js";
import { registerSetup } from "./commands/setup.js";
import { defaultIo, type CliIo } from "./output.js";

const require = createRequire(import.meta.url);
const { version } = require("../../../package.json") as { version: string };

export const VERSION = version;

/** Commands from SPEC 3 and ROADMAP that are not built yet. Each milestone removes the ones it adds. */
export const PLANNED_COMMANDS: ReadonlyArray<{ name: string; description: string }> = [];

export function buildProgram(io: CliIo = defaultIo): Command {
  const program = new Command("reb")
    .description("Evidence-backed analysis of SaaS products.")
    .version(VERSION, "-v, --version", "Print the reb version");

  registerNew(program, io);
  registerList(program, io);
  registerPlan(program, io);
  registerLog(program, io);
  registerEvidence(program, io);
  registerKb(program, io);
  registerAudit(program, io);
  registerReport(program, io);
  registerCompare(program, io);
  registerCapture(program, io);
  registerDashboard(program, io);
  registerSetup(program, io);

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
