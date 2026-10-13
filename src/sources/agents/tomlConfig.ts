import { SERVER_NAME, type ServerCommand } from "../../domain/registration.js";
import { ConfigError } from "./types.js";

/**
 * Codex keeps MCP servers in TOML tables like `[mcp_servers.reb]`. Instead of a full TOML library,
 * reb edits only its own table's `command` and `args` lines and leaves every other line as it was.
 */
const header = (name: string) =>
  new RegExp(`^\\s*\\[\\s*mcp_servers\\s*\\.\\s*(?:${name}|"${name}")\\s*\\]\\s*(?:#.*)?$`);
const ANY_HEADER = /^\s*\[/;
const KEY = (key: string) => new RegExp(`^\\s*${key}\\s*=\\s*(.*?)\\s*(?:#[^"\\]]*)?$`);

function lines(text: string | null): string[] {
  if (text === null || text === "") return [];
  return text.replace(/\r\n/g, "\n").replace(/\n$/, "").split("\n");
}

/** Index range [start, end) of the `[mcp_servers.reb]` table body, or null. */
function findTable(all: string[], name = SERVER_NAME): { header: number; end: number } | null {
  const headers = all.flatMap((l, i) => (header(name).test(l) ? [i] : []));
  if (headers.length > 1) throw new ConfigError(`it has more than one [mcp_servers.${name}] table`);
  const start = headers[0];
  if (start === undefined) return null;
  let end = start + 1;
  while (end < all.length && !ANY_HEADER.test(all[end]!)) end++;
  return { header: start, end };
}

function readValue(body: string[], key: string): unknown {
  for (const line of body) {
    const match = KEY(key).exec(line);
    if (!match) continue;
    try {
      return JSON.parse(match[1]!);
    } catch {
      return undefined; // a TOML form reb does not read (for example 'single quotes'); it is rewritten
    }
  }
  return undefined;
}

export function readTomlEntry(text: string | null, name = SERVER_NAME): ServerCommand | null {
  const all = lines(text);
  const table = findTable(all, name);
  if (!table) return null;
  const body = all.slice(table.header + 1, table.end);
  const command = readValue(body, "command");
  const args = readValue(body, "args");
  if (typeof command !== "string") return null;
  return {
    command,
    args: Array.isArray(args) ? args.filter((a): a is string => typeof a === "string") : [],
  };
}

/** TOML basic strings use the same escapes as JSON for the characters reb writes. */
const toml = (value: string | string[]) => JSON.stringify(value);

export function registerToml(text: string | null, command: ServerCommand): string {
  const all = lines(text);
  const ours = [`command = ${toml(command.command)}`, `args = ${toml(command.args)}`];
  const table = findTable(all);
  let result: string[];
  if (!table) {
    const gap = all.length && all[all.length - 1]!.trim() !== "" ? [""] : [];
    result = [...all, ...gap, `[mcp_servers.${SERVER_NAME}]`, ...ours];
  } else {
    const kept = all
      .slice(table.header + 1, table.end)
      .filter((l) => !KEY("command").test(l) && !KEY("args").test(l));
    result = [...all.slice(0, table.header + 1), ...ours, ...kept, ...all.slice(table.end)];
  }
  return result.join("\n") + "\n";
}
