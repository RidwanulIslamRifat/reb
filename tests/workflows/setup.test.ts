import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildProgram } from "../../src/adapters/cli/program.js";
import { RebError } from "../../src/domain/errors.js";
import { applySetup, planSetup } from "../../src/workflows/setup.js";
import { planUpdate } from "../../src/workflows/update.js";
import { fakeHome, testHost } from "../helpers.js";

const now = () => new Date("2026-10-13T09:00:00Z");
const input = (home: string, extra = {}) => ({
  agentEnv: { home, env: {} },
  host: testHost,
  now,
  ...extra,
});

/** Every file under `dir` with its text, to compare before and after. */
async function snapshot(dir: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const entry of await readdir(dir, { recursive: true, withFileTypes: true })) {
    if (entry.isFile()) {
      const path = join(entry.parentPath, entry.name);
      out[path] = await readFile(path, "utf8");
    }
  }
  return out;
}

async function cli(home: string, answer: string, ...args: string[]) {
  let output = "";
  await buildProgram({
    out: (t) => (output += t),
    env: {},
    home,
    host: testHost,
    ask: async () => answer,
  }).parseAsync(args, { from: "user" });
  return output;
}

describe("setup", () => {
  it("previews every change and changes nothing without approval", async () => {
    const home = await fakeHome();
    const before = await snapshot(home);
    const out = await cli(home, "n", "setup");
    expect(out).toContain("reb will make 6 change(s):");
    expect(out).toContain(
      `Update: Claude Code: register the reb MCP server in ${join(home, ".claude.json")}`,
    );
    expect(out).toContain("runs: /usr/local/bin/node /opt/reb/dist/cli.js mcp");
    expect(out).toContain("backup first:");
    expect(out).toContain("Nothing changed.");
    expect(await snapshot(home)).toEqual(before);
    expect(await cli(home, "", "setup", "--dry-run")).toContain("Dry run: nothing changed.");
    expect(await snapshot(home)).toEqual(before);
  });

  it("backs up, registers, installs the handbook, and a second run changes nothing", async () => {
    const home = await fakeHome();
    const original = await readFile(join(home, ".claude.json"), "utf8");
    const out = await cli(home, "y", "setup");
    expect(out).toContain("✓ Claude Code: register the reb MCP server");
    expect(out).toContain("Restart Claude Code, Cursor, Codex, Gemini CLI");

    const backupName = (await readdir(home)).find((n) => n.startsWith(".claude.json.reb-backup-"));
    expect(backupName).toMatch(/^\.claude\.json\.reb-backup-\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d$/);
    const backup = join(home, backupName!);
    expect(await readFile(backup, "utf8")).toBe(original);
    const claude = JSON.parse(await readFile(join(home, ".claude.json"), "utf8"));
    expect(claude.numStartups).toBe(12);
    expect(claude.mcpServers["other-tool"].command).toBe("other-tool");
    expect(claude.mcpServers.reb.args).toEqual(["/opt/reb/dist/cli.js", "mcp"]);
    const codex = await readFile(join(home, ".codex", "config.toml"), "utf8");
    expect(codex).toContain('[mcp_servers.other.env]\nTOKEN_FILE = "~/.other/token"');
    expect(codex).toContain("[mcp_servers.reb]");
    const skill = await readFile(join(home, ".claude", "skills", "reb", "SKILL.md"), "utf8");
    expect(skill).toBe(await readFile("handbook/SKILL.md", "utf8"));
    expect(await readdir(join(home, ".agents", "skills", "reb", "roles"))).toHaveLength(11);

    const after = await snapshot(home);
    const again = await cli(home, "y", "setup");
    expect(again).toContain("Everything is already up to date. Nothing changed.");
    expect(await snapshot(home)).toEqual(after);
  });

  it("only touches the agents asked for, and rejects unknown ones", async () => {
    const home = await fakeHome();
    const plan = await planSetup(input(home, { agents: ["codex"] }));
    expect(plan.changes.map((c) => c.agents)).toEqual([["Codex"], ["Codex"]]);
    await expect(planSetup(input(home, { agents: ["vim"] }))).rejects.toThrow(RebError);
  });

  it("skips agents that are not installed", async () => {
    const home = await fakeHome();
    const plan = await planSetup(input(join(home, "empty-home")));
    expect(plan.selected).toEqual([]);
    expect(plan.changes).toEqual([]);
  });

  it("leaves a config it cannot read alone and says how to fix it", async () => {
    const home = await fakeHome();
    await writeFile(join(home, ".cursor", "mcp.json"), "{ broken");
    const plan = await planSetup(input(home));
    expect(plan.changes.some((c) => c.agents.includes("Cursor") && c.kind === "register")).toBe(
      false,
    );
    expect(plan.skipped[0]).toMatch(/^Cursor: .*mcp\.json cannot be read: it is not valid JSON/);
  });

  it("does not overwrite another skill called reb", async () => {
    const home = await fakeHome();
    await mkdir(join(home, ".claude", "skills", "reb"), { recursive: true });
    await writeFile(
      join(home, ".claude", "skills", "reb", "SKILL.md"),
      "---\nname: something-else\n---\n",
    );
    const plan = await planSetup(input(home, { agents: ["claude_code"] }));
    expect(plan.changes.map((c) => c.kind)).toEqual(["register"]);
    expect(plan.skipped.join()).toContain("holds another skill");
  });

  it("backs up changed handbook files outside the skills folder", async () => {
    const home = await fakeHome();
    await applySetup(await planSetup(input(home, { agents: ["claude_code"] })));
    const installed = join(home, ".claude", "skills", "reb", "roles", "planner.md");
    await writeFile(installed, "---\nrole: planner\n---\nmy own edits\n");
    const plan = await planSetup(input(home, { agents: ["claude_code"] }));
    expect(plan.changes).toHaveLength(1);
    const { backups } = await applySetup(plan);
    expect(backups).toEqual([
      join(
        home,
        "reb",
        "backups",
        "2026-10-13T09-00-00",
        "claude_code",
        "reb",
        "roles",
        "planner.md",
      ),
    ]);
    expect(await readFile(backups[0]!, "utf8")).toContain("my own edits");
  });

  it("stops when a file changed after the preview", async () => {
    const home = await fakeHome();
    const plan = await planSetup(input(home, { agents: ["gemini_cli"] }));
    await writeFile(join(home, ".gemini", "settings.json"), "{}");
    await expect(applySetup(plan)).rejects.toThrow(/changed after the preview/);
  });

  it("registers npx @ridwanul/reb@latest when asked for the npx command", async () => {
    const home = await fakeHome();
    const plan = await planSetup(input(home, { mode: "npx", agents: ["cursor"] }));
    expect(plan.command).toEqual({ command: "npx", args: ["-y", "@ridwanul/reb@latest", "mcp"] });
  });
});

describe("update", () => {
  it("refreshes only agents that already have reb", async () => {
    const home = await fakeHome();
    expect((await planUpdate(input(home))).selected).toEqual([]);
    await applySetup(await planSetup(input(home, { agents: ["cursor"] })));
    const plan = await planUpdate(input(home, { mode: "npx" }));
    expect(plan.selected).toEqual(["cursor"]);
    expect(plan.changes.map((c) => c.kind)).toEqual(["register"]);
  });
});
