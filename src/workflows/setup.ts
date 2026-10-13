import { join } from "node:path";
import { RebError } from "../domain/errors.js";
import { isRebSkill, SKILL_NAME } from "../domain/handbook.js";
import {
  chooseMode,
  describeCommand,
  sameCommand,
  serverCommand,
  type CommandMode,
  type Host,
  type ServerCommand,
} from "../domain/registration.js";
import {
  AGENT_IDS,
  AGENTS,
  ConfigError,
  isAgentId,
  type AgentAdapter,
  type AgentEnv,
} from "../sources/agents/index.js";
import { readTextIfExists } from "../storage/jsonl.js";
import { backupFile, pathExists, writeHostFile } from "../storage/hostFiles.js";
import { handbookBundle } from "./handbook.js";

export interface SetupInput {
  agentEnv: AgentEnv;
  host: Host;
  mode?: CommandMode | "auto";
  /** Agent ids to set up. Default: every agent found on this computer. */
  agents?: string[];
  /** Only agents that already have reb registered (used by update). */
  onlyRegistered?: boolean;
  now?: () => Date;
}

/** What reb found for one supported agent. */
export interface AgentState {
  id: AgentAdapter["id"];
  name: string;
  detected: boolean;
  configPath: string;
  skillDir: string;
  registered: ServerCommand | null;
  /** Why reb cannot change this agent's config, if it cannot. */
  problem?: string;
}

interface FileChange {
  path: string;
  /** The text reb read while planning; null when the file did not exist. */
  before: string | null;
  after: string;
  backup?: string;
}

/** One change shown to the person before they approve it (SPEC 12: preview, approve, back up). */
export interface PlannedChange {
  kind: "register" | "handbook";
  agents: string[];
  target: string;
  operation: "create" | "update";
  summary: string;
  details: string[];
  backups: string[];
  files: FileChange[];
}

export interface SetupPlan {
  mode: CommandMode;
  command: ServerCommand;
  agents: AgentState[];
  /** Agents set up by this plan (ids). */
  selected: string[];
  changes: PlannedChange[];
  /** Plain-language notes about agents or folders reb leaves alone, each with a fix. */
  skipped: string[];
}

/** Reads every supported agent's state without changing anything. */
export async function inspectAgents(agentEnv: AgentEnv): Promise<AgentState[]> {
  return Promise.all(
    AGENTS.map(async (agent) => {
      const configPath = agent.configPath(agentEnv);
      const state: AgentState = {
        id: agent.id,
        name: agent.name,
        detected: await pathExists(agent.markerPath(agentEnv)),
        configPath,
        skillDir: join(agent.skillsDir(agentEnv), SKILL_NAME),
        registered: null,
      };
      try {
        state.registered = agent.readEntry(await readTextIfExists(configPath));
      } catch (error) {
        if (!(error instanceof ConfigError)) throw error;
        state.problem = `${configPath} cannot be read: ${error.message}.`;
      }
      return state;
    }),
  );
}

/** "2026-10-13T09-00-00": a timestamp that is safe in file names. */
function stamp(now: Date): string {
  return now.toISOString().slice(0, 19).replace(/:/g, "-");
}

function selectAgents(input: SetupInput, states: AgentState[]): AgentState[] {
  if (input.agents?.length) {
    const unknown = input.agents.filter((id) => !isAgentId(id));
    if (unknown.length) {
      throw new RebError(
        `reb does not know the agent "${unknown.join('", "')}".`,
        `Use one or more of: ${AGENT_IDS.join(", ")}.`,
      );
    }
    return states.filter((s) => input.agents!.includes(s.id));
  }
  return states.filter((s) => (input.onlyRegistered ? s.registered !== null : s.detected));
}

/**
 * Works out every change setup would make, without changing anything:
 * register the MCP server in each agent's config, and install the handbook as a skill.
 * Running it again after the changes were applied gives no changes (setup is safe to re-run).
 */
export async function planSetup(input: SetupInput): Promise<SetupPlan> {
  const now = (input.now ?? (() => new Date()))();
  const mode = chooseMode(input.mode ?? "auto", input.host);
  const command = serverCommand(mode, input.host);
  const agents = await inspectAgents(input.agentEnv);
  const selected = selectAgents(input, agents);
  const changes: PlannedChange[] = [];
  const skipped: string[] = [];

  for (const state of selected) {
    const adapter = AGENTS.find((a) => a.id === state.id)!;
    if (state.problem) {
      skipped.push(
        `${state.name}: ${state.problem} Fix the file (or move it away), then run setup again.`,
      );
      continue;
    }
    if (sameCommand(state.registered, command)) continue;
    const before = await readTextIfExists(state.configPath);
    const backup = before === null ? undefined : `${state.configPath}.reb-backup-${stamp(now)}`;
    changes.push({
      kind: "register",
      agents: [state.name],
      target: state.configPath,
      operation: before === null ? "create" : "update",
      summary: `${state.name}: register the reb MCP server in ${state.configPath}`,
      details: [
        ...(state.registered ? [`was: ${describeCommand(state.registered)}`] : []),
        `runs: ${describeCommand(command)}`,
      ],
      backups: backup ? [backup] : [],
      files: [{ path: state.configPath, before, after: adapter.register(before, command), backup }],
    });
  }

  const bundle = await handbookBundle();
  const byDir = new Map<string, AgentState[]>();
  for (const state of selected.filter((s) => !s.problem)) {
    byDir.set(state.skillDir, [...(byDir.get(state.skillDir) ?? []), state]);
  }
  for (const [dir, owners] of byDir) {
    const names = owners.map((o) => o.name);
    const existingSkill = await readTextIfExists(join(dir, "SKILL.md"));
    if (existingSkill !== null && !isRebSkill(existingSkill)) {
      skipped.push(
        `Handbook for ${names.join(", ")}: ${dir} holds another skill, so reb leaves it alone. ` +
          `Rename or remove that folder, then run setup again.`,
      );
      continue;
    }
    const files: FileChange[] = [];
    for (const { path, text } of bundle) {
      const target = join(dir, ...path.split("/"));
      const before = await readTextIfExists(target);
      if (before === text) continue;
      const backup =
        before === null
          ? undefined
          : join(
              input.agentEnv.home,
              "reb",
              "backups",
              stamp(now),
              owners[0]!.id,
              SKILL_NAME,
              path,
            );
      files.push({ path: target, before, after: text, backup });
    }
    if (files.length === 0) continue;
    const created = files.filter((f) => f.before === null).length;
    changes.push({
      kind: "handbook",
      agents: names,
      target: dir,
      operation: created === bundle.length ? "create" : "update",
      summary: `${names.join(", ")}: install the reb handbook skill in ${dir}`,
      details: [`${created} new file(s), ${files.length - created} updated file(s)`],
      backups: files.flatMap((f) => (f.backup ? [f.backup] : [])),
      files,
    });
  }
  return { mode, command, agents, selected: selected.map((s) => s.id), changes, skipped };
}

/**
 * Applies the approved plan. Each file that already exists is first copied to its backup.
 * If a file changed after the preview, nothing more is written and the person is asked to re-run.
 */
export async function applySetup(
  plan: SetupPlan,
): Promise<{ written: string[]; backups: string[] }> {
  const written: string[] = [];
  const backups: string[] = [];
  for (const change of plan.changes) {
    for (const file of change.files) {
      if ((await readTextIfExists(file.path)) !== file.before) {
        throw new RebError(
          `${file.path} changed after the preview, so reb stopped${written.length ? ` (already written: ${written.join(", ")})` : ""}.`,
          "Close the agent if it is running, then run setup again to see a fresh preview.",
        );
      }
      if (file.before !== null && file.backup) {
        backups.push(await backupFile(file.path, file.backup));
      }
      await writeHostFile(file.path, file.after);
      written.push(file.path);
    }
  }
  return { written, backups };
}
