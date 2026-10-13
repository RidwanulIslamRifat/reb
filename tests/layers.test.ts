import { readFileSync } from "node:fs";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

// Lints a fixture as if it lived at `pretendPath`, so the layer rules for that folder apply.
async function lintAs(fixture: string, pretendPath: string): Promise<string[]> {
  const code = readFileSync(`tests/fixtures/layers/${fixture}`, "utf8");
  const [result] = await new ESLint().lintText(code, { filePath: pretendPath });
  return (result?.messages ?? []).map((m) => `${m.ruleId}: ${m.message}`);
}

describe("layer import rule", () => {
  it("fails when domain imports storage", async () => {
    const messages = await lintAs("domain-imports-storage.ts", "src/domain/example.ts");
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatch(/^no-restricted-imports: .*domain layer must not import/);
  });

  it("fails when domain reads files", async () => {
    const messages = await lintAs("domain-reads-files.ts", "src/domain/example.ts");
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatch(/Only the storage layer touches files/);
  });

  it("passes when workflows import domain", async () => {
    expect(await lintAs("workflows-imports-domain.ts", "src/workflows/example.ts")).toEqual([]);
  });
});
