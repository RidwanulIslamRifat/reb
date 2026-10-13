import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { TOOLS } from "../src/adapters/mcp/server.js";
import { isRebSkill, parseRoleFile, splitFrontMatter } from "../src/domain/handbook.js";
import { ROLES } from "../src/domain/plan.js";
import { listHandbookFiles, readHandbookFile } from "../src/storage/handbook.js";

const toolNames = new Set(TOOLS.map((t) => t.name));

describe("handbook", () => {
  it("has a SKILL.md named reb with a description and working links", async () => {
    const text = (await readHandbookFile("SKILL.md"))!;
    expect(isRebSkill(text)).toBe(true);
    const { data, body } = splitFrontMatter(text);
    expect((data as { description: string }).description.length).toBeGreaterThan(50);
    for (const [, link] of body.matchAll(/\]\(([^)]+\.md)\)/g)) {
      expect(await readHandbookFile(link!), link).not.toBeNull();
    }
  });

  it("has one role file for every role in SPEC 7, naming only tools that exist", async () => {
    const files = await listHandbookFiles();
    expect(files.filter((f) => f.startsWith("roles/")).sort()).toEqual(
      ROLES.map((r) => `roles/${r}.md`).sort(),
    );
    for (const role of ROLES) {
      const file = parseRoleFile((await readHandbookFile(`roles/${role}.md`))!);
      expect(file.role).toBe(role);
      for (const tool of file.tools) expect(toolNames, `${role}: ${tool}`).toContain(tool);
      expect(file.tools, role).toContain("log_role_work");
      // Tools named in the prose as `tool_name` must exist too.
      for (const [, name] of file.body.matchAll(/`([a-z]+_[a-z_]+)`/g)) {
        if (
          /^(needs_human|plan_tier|role_prompt|done_when|depends_on|data_object|pricing_tier|market_segment|gated_by|also_offers|belongs_to|reads_writes|connects_to|focus_questions|dry_run|delete_raw_har)$/.test(
            name!,
          )
        )
          continue;
        if (file.optional_tools.includes(name as never)) continue;
        expect(toolNames, `${role} mentions ${name}`).toContain(name);
      }
    }
  });

  it("has the evidence protocol and graph format references", async () => {
    const files = await listHandbookFiles();
    expect(files).toContain("references/evidence-protocol.md");
    expect(files).toContain("references/graph-format.md");
  });

  it("lists the same 12 link types in graph-format.md as the domain", async () => {
    const text = await readFile("handbook/references/graph-format.md", "utf8");
    const { LINK_TYPES } = await import("../src/domain/links.js");
    for (const link of LINK_TYPES) expect(text).toMatch(new RegExp(`\\| ${link} +\\|`));
  });
});
