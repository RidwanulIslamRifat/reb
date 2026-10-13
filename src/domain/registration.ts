/** Published package name (ROADMAP decision 1). */
export const PACKAGE_NAME = "@rifat/reb";

/** Name of the MCP server entry written into each agent's config. */
export const SERVER_NAME = "reb";

/** The command an agent runs to start the reb MCP server. */
export interface ServerCommand {
  command: string;
  args: string[];
}

/**
 * How agents start reb:
 * - npx: `npx -y @rifat/reb@latest mcp`, always the newest release (ROADMAP decisions 2 and 18).
 * - local: this exact copy, `<node> <path to dist/cli.js> mcp`. Used when reb runs from a folder
 *   (for example a git checkout), so it works before reb is on npm.
 */
export type CommandMode = "npx" | "local";

export interface Host {
  /** Absolute path of the node program running reb. */
  execPath: string;
  /** Absolute path of the reb CLI script that is running (dist/cli.js). */
  cliPath: string;
  platform: NodeJS.Platform;
}

/** "auto" picks npx when reb itself was started by npx, else local. */
export function chooseMode(mode: CommandMode | "auto", host: Host): CommandMode {
  if (mode !== "auto") return mode;
  return /[\\/]_npx[\\/]/.test(host.cliPath) ? "npx" : "local";
}

export function serverCommand(mode: CommandMode, host: Host): ServerCommand {
  if (mode === "local") return { command: host.execPath, args: [host.cliPath, "mcp"] };
  const npx = ["-y", `${PACKAGE_NAME}@latest`, "mcp"];
  // On Windows, npx is a .cmd script that agents can only start through cmd.
  return host.platform === "win32"
    ? { command: "cmd", args: ["/c", "npx", ...npx] }
    : { command: "npx", args: npx };
}

export function sameCommand(a: ServerCommand | null, b: ServerCommand): boolean {
  return (
    a !== null &&
    a.command === b.command &&
    a.args.length === b.args.length &&
    a.args.every((arg, i) => arg === b.args[i])
  );
}

export function describeCommand(c: ServerCommand): string {
  return [c.command, ...c.args].map((p) => (/\s/.test(p) ? JSON.stringify(p) : p)).join(" ");
}

/** Lowest Node.js version reb supports (package.json engines). */
export const MIN_NODE = [22, 12, 0] as const;

export function nodeVersionOk(version: string): boolean {
  const parts = version.replace(/^v/, "").split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const have = parts[i] ?? 0;
    if (have !== MIN_NODE[i]) return have > MIN_NODE[i]!;
  }
  return true;
}
