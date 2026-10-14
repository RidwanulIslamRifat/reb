import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { TOOLS } from "../src/adapters/mcp/server.js";
import { isRebSkill, parseRoleFile, splitFrontMatter } from "../src/domain/handbook.js";
import { ROLES } from "../src/domain/plan.js";
import { FRAMEWORKS } from "../src/domain/frameworks.js";
import { LINK_TYPES, NODE_TYPES } from "../src/domain/links.js";
import { TYPE_FIELDS } from "../src/domain/nodeFields.js";
import { listHandbookFiles, readHandbookFile } from "../src/storage/handbook.js";

const toolNames = new Set(TOOLS.map((t) => t.name));

/** Backticked names in role prose that are not tools: node and link types, fields, frameworks. */
const NOT_TOOLS = new Set<string>([
  ...NODE_TYPES,
  ...LINK_TYPES,
  ...FRAMEWORKS,
  ...Object.values(TYPE_FIELDS).flatMap((fields) => fields!.map((f) => f.name)),
  ...Object.values(TYPE_FIELDS).flatMap((fields) => fields!.flatMap((f) => f.values ?? [])),
]);

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
          /^(needs_human|plan_tier|role_prompt|done_when|depends_on|focus_questions|dry_run|delete_raw_har)$/.test(
            name!,
          ) ||
          NOT_TOOLS.has(name!)
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

  it("lists every link type, node type and typed field in graph-format.md", async () => {
    const text = await readFile("handbook/references/graph-format.md", "utf8");
    for (const link of LINK_TYPES) expect(text, link).toMatch(new RegExp(`\\| ${link} +\\|`));
    for (const type of NODE_TYPES) expect(text, type).toContain(type);
    for (const [type, fields] of Object.entries(TYPE_FIELDS)) {
      for (const f of fields!)
        expect(text, `${type}.${f.name}`).toMatch(new RegExp(`\\| ${type} +\\| ${f.name}`));
    }
  });
});
