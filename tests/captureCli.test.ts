import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildProgram } from "../src/adapters/cli/program.js";
import { writeRunFile } from "../src/storage/inbox.js";
import { crmScreens } from "./domain/crmScreens.js";
import { tempDir } from "./helpers.js";

describe("reb capture in the terminal", () => {
  it("explains what it will do and opens nothing without a yes", async () => {
    let output = "";
    const questions: string[] = [];
    const program = buildProgram({
      out: (text) => (output += text),
      env: { REB_HOME: await tempDir() },
      ask: async (q) => {
        questions.push(q);
        return "";
      },
    }).exitOverride();
    await program.parseAsync(["capture", "https://app.example.com/login"], { from: "user" });
    expect(output).toContain("never click buttons, type, submit forms, download files");
    expect(output).toContain("YOU log in to the product yourself");
    expect(questions).toEqual(["Start the capture? [y/N] "]);
    expect(output).toContain("Nothing was opened.");
  });
});

describe("reb analyse in the terminal", () => {
  it("turns a capture into the feature model, and previews with --dry-run", async () => {
    const home = await tempDir();
    let output = "";
    const program = () =>
      buildProgram({ out: (text) => (output += text), env: { REB_HOME: home } }).exitOverride();
    await program().parseAsync(["new", "acme-crm.example", "--reports", "requirements"], {
      from: "user",
    });
    const dir = /Folder: (.+)/.exec(output)?.[1]?.trim() ?? "";
    expect(dir).not.toBe("");
    await writeRunFile(
      join(dir, "evidence", "imports", "session-01", "capture.json"),
      JSON.stringify({ screens: crmScreens() }),
    );
    output = "";
    await program().parseAsync(["analyse", "--dry-run"], { from: "user" });
    expect(output).toContain("From session-01: 6 modules,");
    expect(output).toContain("Dry run: nothing was written.");
    output = "";
    await program().parseAsync(["analyze", "session-01"], { from: "user" });
    expect(output).toMatch(/Added \d+ inferred nodes/);
    expect(output).toContain("notes/feature-model-session-01.md");
  });
});
