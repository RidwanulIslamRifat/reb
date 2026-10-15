import { describe, expect, it } from "vitest";
import { buildProgram } from "../src/adapters/cli/program.js";
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
