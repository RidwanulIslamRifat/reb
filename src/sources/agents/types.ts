import type { ServerCommand } from "../../domain/registration.js";

/** Where the agent looks: the home folder and environment variables of this computer. */
export interface AgentEnv {
  home: string;
  env: NodeJS.ProcessEnv;
}

export const AGENT_IDS = ["claude_code", "cursor", "codex", "gemini_cli"] as const;
export type AgentId = (typeof AGENT_IDS)[number];

/**
 * One supported AI agent (SPEC 3): where its files live and how to register reb in its config.
 * Pure: callers read and write the files; these functions only work on text.
 */
export interface AgentAdapter {
  id: AgentId;
  name: string;
  /** A folder that exists when the agent is installed for this user. */
  markerPath(e: AgentEnv): string;
  /** The config file that lists MCP servers. */
  configPath(e: AgentEnv): string;
  /** The folder that holds skills; the handbook goes in `<skillsDir>/reb`. */
  skillsDir(e: AgentEnv): string;
  /**
   * The MCP server entry called `name` (default "reb") in the config, or null.
   * Throws ConfigError when the text cannot be read.
   */
  readEntry(text: string | null, name?: string): ServerCommand | null;
  /** The config text with reb registered; everything else is kept. Throws ConfigError. */
  register(text: string | null, command: ServerCommand): string;
}

/** A config file reb cannot read safely; setup leaves it alone. */
export class ConfigError extends Error {}
