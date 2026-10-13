import type { Command } from "commander";
import { RebError } from "../../../domain/errors.js";
import { createContext } from "../../../workflows/context.js";
import { runDoctor } from "../../../workflows/doctor.js";
import { applySetup, planSetup, type SetupPlan } from "../../../workflows/setup.js";
import { planUpdate } from "../../../workflows/update.js";
import { hostOf, line, type CliIo } from "../output.js";

type ApplyOptions = { yes?: boolean; dryRun?: boolean; command: string };

function checkMode(mode: string): "auto" | "npx" | "local" {
  if (mode === "auto" || mode === "npx" || mode === "local") return mode;
  throw new RebError(`"${mode}" is not a command choice.`, "Use auto, npx or local.");
}

function printPlan(io: CliIo, plan: SetupPlan): void {
  line(io, "AI agents on this computer:");
  for (const a of plan.agents) {
    const state = !a.detected
      ? "not found"
      : a.registered
        ? "found, reb registered"
        : "found, reb not registered";
    line(io, `  ${plan.selected.includes(a.id) ? "*" : " "} ${a.name}: ${state}`);
  }
  line(io, `Agents will start reb with: ${[plan.command.command, ...plan.command.args].join(" ")}`);
  for (const note of plan.skipped) line(io, `Skipped: ${note}`);
  if (plan.changes.length === 0) return;
  line(io);
  line(io, `reb will make ${plan.changes.length} change(s):`);
  plan.changes.forEach((c, i) => {
    line(io, `${i + 1}. ${c.operation === "create" ? "Create" : "Update"}: ${c.summary}`);
    for (const d of c.details) line(io, `     ${d}`);
    if (c.backups.length) {
      const more = c.backups.length > 1 ? ` (and ${c.backups.length - 1} more)` : "";
      line(io, `     backup first: ${c.backups[0]}${more}`);
    }
  });
}

/** Shared by setup and update: preview, ask, back up and apply. */
async function previewAndApply(io: CliIo, plan: SetupPlan, options: ApplyOptions, verb: string) {
  printPlan(io, plan);
  if (plan.selected.length === 0) {
    line(io);
    line(
      io,
      verb === "update"
        ? 'reb is not registered in any agent yet. Run "reb setup" first.'
        : "No supported agent was found. Install Claude Code, Cursor, Codex or Gemini CLI, or name one with --agent.",
    );
    return;
  }
  if (plan.changes.length === 0) {
    line(io);
    line(io, "Everything is already up to date. Nothing changed.");
    return;
  }
  line(io);
  if (options.dryRun) {
    line(io, "Dry run: nothing changed.");
    return;
  }
  if (!options.yes) {
    const answer = (await hostOf(io).ask("Apply these changes? [y/N] ")).trim().toLowerCase();
    if (answer !== "y" && answer !== "yes") {
      line(io, "Nothing changed. Run again and answer y to apply, or add --yes.");
      return;
    }
  }
  const result = await applySetup(plan);
  for (const change of plan.changes) line(io, `✓ ${change.summary}`);
  line(io, `Wrote ${result.written.length} file(s).`);
  for (const backup of result.backups) line(io, `Backup: ${backup}`);
  const names = [...new Set(plan.changes.flatMap((c) => c.agents))];
  line(
    io,
    `Done. Restart ${names.join(", ")} so it loads reb, then ask: "Analyse <domain>; reports: feature".`,
  );
}

export function registerSetup(program: Command, io: CliIo): void {
  program
    .command("setup")
    .description("Register reb with your AI agents and install the handbook skill")
    .option("--agent <ids...>", "only these agents: claude_code, cursor, codex, gemini_cli")
    .option("--command <mode>", "how agents start reb: auto, npx or local", "auto")
    .option("-y, --yes", "apply without asking")
    .option("--dry-run", "only show what would change")
    .action(async (options: ApplyOptions & { agent?: string[] }) => {
      const h = hostOf(io);
      const plan = await planSetup({
        agentEnv: { home: h.home, env: io.env },
        host: h.host,
        mode: checkMode(options.command),
        agents: options.agent,
      });
      await previewAndApply(io, plan, options, "setup");
    });

  program
    .command("update")
    .description("Refresh reb's registration and handbook in every agent that has reb")
    .option("--command <mode>", "how agents start reb: auto, npx or local", "auto")
    .option("-y, --yes", "apply without asking")
    .option("--dry-run", "only show what would change")
    .action(async (options: ApplyOptions) => {
      const h = hostOf(io);
      const plan = await planUpdate({
        agentEnv: { home: h.home, env: io.env },
        host: h.host,
        mode: checkMode(options.command),
      });
      await previewAndApply(io, plan, options, "update");
      line(
        io,
        "If you installed reb with npm install -g, also run: npm install -g @rifat/reb@latest",
      );
    });

  program
    .command("doctor")
    .description("Check that reb is set up correctly")
    .action(async () => {
      const h = hostOf(io);
      const result = await runDoctor(createContext("cli", io.env), {
        agentEnv: { home: h.home, env: io.env },
        nodeVersion: h.nodeVersion,
        platform: h.host.platform,
      });
      for (const c of result.checks) {
        const mark = c.status === "pass" ? "✓" : c.status === "fail" ? "✗" : "-";
        line(io, `${mark} ${c.name}: ${c.detail}`);
        if (c.fix) line(io, `    Fix: ${c.fix}`);
      }
      const failed = result.checks.filter((c) => c.status === "fail").length;
      line(io, failed === 0 ? "All checks passed." : `${failed} check(s) failed.`);
      if (failed) process.exitCode = 1;
    });

  program
    .command("mcp")
    .description("Start the MCP server for AI agents (stdio; agents run this for you)")
    .action(async () => {
      const { startMcpServer } = await import("../../mcp/server.js");
      const { VERSION } = await import("../program.js");
      await startMcpServer(VERSION, { dashboard: io.dashboard, openBrowser: io.openBrowser });
    });
}
