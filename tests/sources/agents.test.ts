import { describe, expect, it } from "vitest";
import {
  AGENTS,
  ConfigError,
  claudeCode,
  codex,
  cursor,
  geminiCli,
} from "../../src/sources/agents/index.js";
import { readTomlEntry, registerToml } from "../../src/sources/agents/tomlConfig.js";

const cmd = { command: "/usr/bin/node", args: ["/opt/reb/dist/cli.js", "mcp"] };
const e = { home: "/home/ana", env: {} };

describe("agent locations", () => {
  it("follows each agent's default folders", () => {
    expect(claudeCode.configPath(e)).toBe("/home/ana/.claude.json");
    expect(claudeCode.skillsDir(e)).toBe("/home/ana/.claude/skills");
    expect(cursor.configPath(e)).toBe("/home/ana/.cursor/mcp.json");
    expect(codex.configPath(e)).toBe("/home/ana/.codex/config.toml");
    expect(geminiCli.configPath(e)).toBe("/home/ana/.gemini/settings.json");
    expect(new Set(AGENTS.map((a) => a.skillsDir(e)))).toEqual(
      new Set(["/home/ana/.claude/skills", "/home/ana/.agents/skills"]),
    );
  });

  it("honours CLAUDE_CONFIG_DIR, CODEX_HOME and GEMINI_CLI_HOME", () => {
    const env = {
      CLAUDE_CONFIG_DIR: "/cfg/claude",
      CODEX_HOME: "/cfg/codex",
      GEMINI_CLI_HOME: "/cfg/g",
    };
    expect(claudeCode.configPath({ ...e, env })).toBe("/cfg/claude/.claude.json");
    expect(codex.configPath({ ...e, env })).toBe("/cfg/codex/config.toml");
    expect(geminiCli.configPath({ ...e, env })).toBe("/cfg/g/.gemini/settings.json");
  });
});

describe("JSON configs", () => {
  it("adds reb and keeps every other setting", () => {
    const before = JSON.stringify({ theme: "dark", mcpServers: { other: { command: "x" } } });
    const after = JSON.parse(claudeCode.register(before, cmd));
    expect(after.theme).toBe("dark");
    expect(after.mcpServers.other).toEqual({ command: "x" });
    expect(after.mcpServers.reb).toEqual({ type: "stdio", ...cmd });
    expect(claudeCode.readEntry(JSON.stringify(after))).toEqual(cmd);
  });

  it("creates a config when there is none, and keeps extra fields on an old reb entry", () => {
    expect(JSON.parse(cursor.register(null, cmd))).toEqual({ mcpServers: { reb: cmd } });
    const old = JSON.stringify({
      mcpServers: { reb: { command: "npx", args: [], env: { A: "1" } } },
    });
    expect(JSON.parse(cursor.register(old, cmd)).mcpServers.reb).toEqual({
      ...cmd,
      env: { A: "1" },
    });
  });

  it("refuses a file that is not valid JSON", () => {
    expect(() => geminiCli.register("{ not json", cmd)).toThrow(ConfigError);
    expect(() => geminiCli.readEntry("[1]")).toThrow(ConfigError);
  });
});

describe("Codex TOML config", () => {
  const before = [
    "# my settings",
    'model = "gpt-5"',
    "",
    "[mcp_servers.other]",
    'command = "other"',
    "",
    "[mcp_servers.other.env]",
    'TOKEN = "x"',
    "",
  ].join("\n");

  it("appends a [mcp_servers.reb] table and leaves the rest untouched", () => {
    const after = registerToml(before, cmd);
    expect(after.startsWith(before)).toBe(true);
    expect(after).toContain(
      '[mcp_servers.reb]\ncommand = "/usr/bin/node"\nargs = ["/opt/reb/dist/cli.js","mcp"]\n',
    );
    expect(readTomlEntry(after)).toEqual(cmd);
    expect(registerToml(after, cmd)).toBe(after);
  });

  it("replaces only command and args in an existing reb table", () => {
    const old =
      '[mcp_servers.reb]\ncommand = "npx"\nargs = ["old"]\nstartup_timeout_sec = 20\n\n[other]\nx = 1\n';
    const after = registerToml(old, cmd);
    expect(after).toContain("startup_timeout_sec = 20");
    expect(after).toContain("[other]\nx = 1");
    expect(after).not.toContain('"npx"');
    expect(readTomlEntry(after)).toEqual(cmd);
    expect(readTomlEntry(after, "other")).toBeNull();
  });

  it("refuses a file with two reb tables", () => {
    expect(() => readTomlEntry("[mcp_servers.reb]\n[mcp_servers.reb]\n")).toThrow(ConfigError);
  });
});
