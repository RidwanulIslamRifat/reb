import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { nodeIdFor, parseNode, renderNode } from "../../src/domain/node.js";

const NODES = "tests/fixtures/kb-sample/kb/nodes";

describe("node files", () => {
  it.each(readdirSync(NODES))("%s round-trips: read then write gives the same file", (file) => {
    const text = readFileSync(join(NODES, file), "utf8");
    expect(renderNode(parseNode(text))).toBe(text);
  });

  it("keeps extra front-matter fields and the body", () => {
    const text = renderNode({
      meta: {
        id: "feature-sso",
        type: "feature",
        name: "SSO: SAML",
        label: "documented",
        links: { uses: [], evidence: ["E-001"], has: [] },
        owner_note: "check again",
      },
      body: "\n# SSO\n\nSome text.\n",
    });
    expect(text).not.toContain("uses");
    const node = parseNode(text);
    expect(node.meta).toMatchObject({ name: "SSO: SAML", owner_note: "check again" });
    expect(node.body).toBe("\n# SSO\n\nSome text.\n");
    expect(renderNode(node)).toBe(text);
  });

  it("explains a missing field, a wrong id and broken front matter", () => {
    expect(() => parseNode("---\nid: feature-a\ntype: feature\nname: A\n---\n")).toThrow(/label/);
    expect(() =>
      parseNode("---\nid: product-a\ntype: feature\nname: A\nlabel: inferred\n---\n"),
    ).toThrow(/feature-<short-kebab-name>/);
    expect(() =>
      parseNode(
        "---\nid: feature-a\ntype: feature\nname: A\nlabel: inferred\nlinks:\n  likes: [x]\n---\n",
      ),
    ).toThrow(/links/);
    expect(() => parseNode("no front matter")).toThrow(/--- lines/);
    expect(() => parseNode("---\nname: [unclosed\n---\n")).toThrow(/not valid YAML/);
  });

  it("makes ids of the form <type>-<short-kebab-name>", () => {
    expect(nodeIdFor("feature", "CSV Export (beta)")).toBe("feature-csv-export-beta");
    expect(nodeIdFor("pricing_tier", "Pro")).toBe("pricing_tier-pro");
    expect(() => nodeIdFor("feature", "!!!")).toThrow();
  });
});
