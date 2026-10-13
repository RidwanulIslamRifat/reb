import { SERVER_NAME, type ServerCommand } from "../../domain/registration.js";
import { ConfigError } from "./types.js";

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parse(text: string | null): Json {
  if (text === null || text.trim() === "") return {};
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new ConfigError(`it is not valid JSON (${(error as Error).message})`);
  }
  if (!isObject(data)) throw new ConfigError("it does not hold a JSON object");
  if (data.mcpServers !== undefined && !isObject(data.mcpServers)) {
    throw new ConfigError('its "mcpServers" value is not an object');
  }
  return data;
}

/** Reads `mcpServers.<name>` from JSON configs (Claude Code, Cursor, Gemini CLI). */
export function readJsonEntry(text: string | null, name = SERVER_NAME): ServerCommand | null {
  const entry = (parse(text).mcpServers as Json | undefined)?.[name];
  if (!isObject(entry) || typeof entry.command !== "string") return null;
  const args = Array.isArray(entry.args) ? entry.args.filter((a) => typeof a === "string") : [];
  return { command: entry.command, args };
}

/**
 * Sets `mcpServers.reb` to the command, keeping every other key and any extra fields
 * (for example `env`) already in the reb entry. `extra` adds fixed fields such as `type`.
 */
export function registerJson(
  text: string | null,
  command: ServerCommand,
  extra: Json = {},
): string {
  const data = parse(text);
  const servers = (data.mcpServers as Json | undefined) ?? {};
  const old = isObject(servers[SERVER_NAME]) ? (servers[SERVER_NAME] as Json) : {};
  const entry = { ...extra, ...old, command: command.command, args: command.args };
  return (
    JSON.stringify({ ...data, mcpServers: { ...servers, [SERVER_NAME]: entry } }, null, 2) + "\n"
  );
}
