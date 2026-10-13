import { isAbsolute, join } from "node:path";
import { describeCommand, nodeVersionOk, type ServerCommand } from "../domain/registration.js";
import { AGENTS, type AgentEnv } from "../sources/agents/index.js";
import { readTextIfExists } from "../storage/jsonl.js";
import { checkWritable, findOnPath, pathExists } from "../storage/hostFiles.js";
import type { Context } from "./context.js";
import { handbookBundle } from "./handbook.js";
import { inspectAgents } from "./setup.js";

/** One line of the doctor checklist. "info" is shown but never counts as a failure. */
export interface Check {
  name: string;
  status: "pass" | "fail" | "info";
  detail: string;
  fix?: string;
}

export interface DoctorInput {
  agentEnv: AgentEnv;
  nodeVersion: string;
  platform: NodeJS.Platform;
}

/** A registered command whose script file is gone (for example a deleted checkout). */
async function missingScript(command: ServerCommand): Promise<string | null> {
  const script = command.args.find((a) => /\.(c|m)?js$/.test(a));
  if (!script || !isAbsolute(script)) return null;
  return (await pathExists(script)) ? null : script;
}

/**
 * reb doctor (SPEC 12): Node version, runs root writable, MCP registration and handbook per agent,
 * and whether REA is present (optional). Changes nothing except a probe file in the runs root.
 */
export async function runDoctor(
  ctx: Context,
  input: DoctorInput,
): Promise<{ checks: Check[]; ok: boolean }> {
  const checks: Check[] = [];
  checks.push(
    nodeVersionOk(input.nodeVersion)
      ? { name: "Node.js version", status: "pass", detail: input.nodeVersion }
      : {
          name: "Node.js version",
          status: "fail",
          detail: `${input.nodeVersion} is too old`,
          fix: "Install Node.js 22.12 or newer from https://nodejs.org/",
        },
  );

  const writeError = await checkWritable(ctx.root);
  checks.push(
    writeError === null
      ? { name: "Runs folder writable", status: "pass", detail: ctx.root }
      : {
          name: "Runs folder writable",
          status: "fail",
          detail: `${ctx.root} (${writeError})`,
          fix: "Set REB_HOME to a folder you can write to, for example REB_HOME=~/reb/runs",
        },
  );

  const bundle = await handbookBundle();
  const states = await inspectAgents(input.agentEnv);
  if (!states.some((s) => s.detected || s.registered)) {
    checks.push({
      name: "AI agents",
      status: "fail",
      detail: "none of Claude Code, Cursor, Codex or Gemini CLI was found",
      fix: "Install one of them, then run: reb setup",
    });
  }
  for (const state of states) {
    if (!state.detected && !state.registered) {
      checks.push({
        name: state.name,
        status: "info",
        detail: "not found on this computer (skipped)",
      });
      continue;
    }
    if (state.problem) {
      checks.push({
        name: `${state.name} MCP registration`,
        status: "fail",
        detail: state.problem,
        fix: "Fix the file (a backup may sit next to it), then run: reb setup",
      });
    } else if (!state.registered) {
      checks.push({
        name: `${state.name} MCP registration`,
        status: "fail",
        detail: `reb is not registered in ${state.configPath}`,
        fix: "Run: reb setup",
      });
    } else {
      const missing = await missingScript(state.registered);
      checks.push(
        missing
          ? {
              name: `${state.name} MCP registration`,
              status: "fail",
              detail: `registered, but ${missing} does not exist`,
              fix: "Run reb setup again from your current reb copy",
            }
          : {
              name: `${state.name} MCP registration`,
              status: "pass",
              detail: describeCommand(state.registered),
            },
      );
    }
    let missingFiles = 0;
    let oldFiles = 0;
    for (const { path, text } of bundle) {
      const installed = await readTextIfExists(join(state.skillDir, ...path.split("/")));
      if (installed === null) missingFiles++;
      else if (installed !== text) oldFiles++;
    }
    checks.push(
      missingFiles === bundle.length
        ? {
            name: `${state.name} handbook`,
            status: "fail",
            detail: `not installed in ${state.skillDir}`,
            fix: "Run: reb setup",
          }
        : missingFiles + oldFiles > 0
          ? {
              name: `${state.name} handbook`,
              status: "fail",
              detail: `${missingFiles} missing and ${oldFiles} outdated file(s) in ${state.skillDir}`,
              fix: "Run: reb update",
            }
          : { name: `${state.name} handbook`, status: "pass", detail: state.skillDir },
    );
  }

  checks.push(await reaCheck(input));
  return { checks, ok: checks.every((c) => c.status !== "fail") };
}

/** REA is optional (ROADMAP decision 14): look for the rea command or an MCP server named "rea". */
async function reaCheck(input: DoctorInput): Promise<Check> {
  const onPath = await findOnPath("rea", input.agentEnv.env, input.platform);
  if (onPath) return { name: "REA (optional)", status: "info", detail: `found at ${onPath}` };
  for (const agent of AGENTS) {
    try {
      if (agent.readEntry(await readTextIfExists(agent.configPath(input.agentEnv)), "rea")) {
        return { name: "REA (optional)", status: "info", detail: `registered in ${agent.name}` };
      }
    } catch {
      // an unreadable config is reported by the registration check
    }
  }
  return {
    name: "REA (optional)",
    status: "info",
    detail: "not found; reb works without it (see github.com/morluto/rea)",
  };
}
