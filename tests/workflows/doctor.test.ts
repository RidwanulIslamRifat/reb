import { chmod, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildProgram } from "../../src/adapters/cli/program.js";
import { runDoctor } from "../../src/workflows/doctor.js";
import { applySetup, planSetup } from "../../src/workflows/setup.js";
import { fakeHome, tempDir, testContext } from "../helpers.js";

const doctorInput = (home: string, nodeVersion = "v22.12.0") => ({
  agentEnv: { home, env: { PATH: "" } },
  nodeVersion,
  platform: "linux" as NodeJS.Platform,
});

describe("doctor", () => {
  it("fails registration and handbook checks before setup, each with a fix", async () => {
    const home = await fakeHome();
    const { checks, ok } = await runDoctor(await testContext(), doctorInput(home));
    expect(ok).toBe(false);
    const claude = checks.find((c) => c.name === "Claude Code MCP registration")!;
    expect(claude.status).toBe("fail");
    expect(claude.fix).toBe("Run: reb setup");
    for (const c of checks.filter((c) => c.status === "fail")) expect(c.fix).toBeTruthy();
    expect(checks.find((c) => c.name === "REA (optional)")!.detail).toBe("registered in Cursor");
  });

  it("passes after setup when the registered script exists", async () => {
    const home = await fakeHome();
    const script = join(await tempDir(), "cli.js");
    await writeFile(script, "");
    const host = { execPath: "/usr/bin/node", cliPath: script, platform: "linux" as const };
    await applySetup(await planSetup({ agentEnv: { home, env: {} }, host }));
    const { checks, ok } = await runDoctor(await testContext(), doctorInput(home));
    expect(checks.filter((c) => c.status === "fail")).toEqual([]);
    expect(ok).toBe(true);
  });

  it("fails when the registered reb copy is gone, Node is too old or no agent exists", async () => {
    const home = await fakeHome();
    const host = {
      execPath: "/usr/bin/node",
      cliPath: "/gone/dist/cli.js",
      platform: "linux" as const,
    };
    await applySetup(await planSetup({ agentEnv: { home, env: {} }, host, agents: ["codex"] }));
    const { checks } = await runDoctor(await testContext(), doctorInput(home, "v20.1.0"));
    expect(checks.find((c) => c.name === "Codex MCP registration")!.detail).toContain(
      "/gone/dist/cli.js does not exist",
    );
    expect(checks.find((c) => c.name === "Node.js version")!.status).toBe("fail");

    const empty = await runDoctor(await testContext(), doctorInput(join(home, "nobody")));
    expect(empty.checks.find((c) => c.name === "AI agents")!.status).toBe("fail");
    expect(
      empty.checks.filter((c) => c.detail.includes("not found on this computer")),
    ).toHaveLength(4);
  });

  it.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
    "fails when the runs folder is not writable",
    async () => {
      const dir = await tempDir();
      await chmod(dir, 0o500);
      const ctx = { ...(await testContext()), root: join(dir, "runs") };
      const { checks } = await runDoctor(ctx, doctorInput(await fakeHome()));
      expect(checks.find((c) => c.name === "Runs folder writable")!.status).toBe("fail");
      await chmod(dir, 0o700);
    },
  );

  it("prints a checklist with ticks, crosses and fix hints", async () => {
    const home = await fakeHome();
    let out = "";
    await buildProgram({
      out: (t) => (out += t),
      env: { REB_HOME: join(home, "runs"), PATH: "" },
      home,
      nodeVersion: "v22.20.0",
    }).parseAsync(["doctor"], { from: "user" });
    expect(out).toContain("✓ Node.js version: v22.20.0");
    expect(out).toContain("✗ Claude Code MCP registration");
    expect(out).toContain("    Fix: Run: reb setup");
    expect(out).toMatch(/\d+ check\(s\) failed\.\n$/);
    process.exitCode = 0;
  });
});
