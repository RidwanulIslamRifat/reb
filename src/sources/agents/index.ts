import { join } from "node:path";
import { readJsonEntry, registerJson } from "./jsonConfig.js";
import { readTomlEntry, registerToml } from "./tomlConfig.js";
import { AGENT_IDS, type AgentAdapter, type AgentEnv, type AgentId } from "./types.js";

export { AGENT_IDS, ConfigError, type AgentAdapter, type AgentEnv, type AgentId } from "./types.js";

/** An environment variable that is set and not blank, or undefined. */
const envDir = (e: AgentEnv, name: string) => e.env[name]?.trim() || undefined;

// Locations follow each agent's documentation and REA's setup (github.com/morluto/rea).
// Agents without their own skills folder share ~/.agents/skills, as REA does.

export const claudeCode: AgentAdapter = {
  id: "claude_code",
  name: "Claude Code",
  markerPath: (e) => envDir(e, "CLAUDE_CONFIG_DIR") ?? join(e.home, ".claude"),
  configPath: (e) => join(envDir(e, "CLAUDE_CONFIG_DIR") ?? e.home, ".claude.json"),
  skillsDir: (e) => join(envDir(e, "CLAUDE_CONFIG_DIR") ?? join(e.home, ".claude"), "skills"),
  readEntry: readJsonEntry,
  register: (text, command) => registerJson(text, command, { type: "stdio" }),
};

export const cursor: AgentAdapter = {
  id: "cursor",
  name: "Cursor",
  markerPath: (e) => join(e.home, ".cursor"),
  configPath: (e) => join(e.home, ".cursor", "mcp.json"),
  skillsDir: (e) => join(e.home, ".agents", "skills"),
  readEntry: readJsonEntry,
  register: (text, command) => registerJson(text, command),
};

export const codex: AgentAdapter = {
  id: "codex",
  name: "Codex",
  markerPath: (e) => envDir(e, "CODEX_HOME") ?? join(e.home, ".codex"),
  configPath: (e) => join(envDir(e, "CODEX_HOME") ?? join(e.home, ".codex"), "config.toml"),
  skillsDir: (e) => join(e.home, ".agents", "skills"),
  readEntry: readTomlEntry,
  register: registerToml,
};

const geminiHome = (e: AgentEnv) => envDir(e, "GEMINI_CLI_HOME") ?? e.home;

export const geminiCli: AgentAdapter = {
  id: "gemini_cli",
  name: "Gemini CLI",
  markerPath: (e) => join(geminiHome(e), ".gemini"),
  configPath: (e) => join(geminiHome(e), ".gemini", "settings.json"),
  skillsDir: (e) => join(geminiHome(e), ".agents", "skills"),
  readEntry: readJsonEntry,
  register: (text, command) => registerJson(text, command),
};

export const AGENTS: readonly AgentAdapter[] = [claudeCode, cursor, codex, geminiCli];

export function isAgentId(value: string): value is AgentId {
  return (AGENT_IDS as readonly string[]).includes(value);
}
