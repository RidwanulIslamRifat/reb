import { describe, expect, it } from "vitest";
import {
  evaluateGate,
  isSafeRunPath,
  parseGateRule,
  type GateFacts,
} from "../../src/domain/gate.js";
import type { NodeMeta } from "../../src/domain/node.js";

const node = (id: string, type: NodeMeta["type"], links: NodeMeta["links"] = {}): NodeMeta => ({
  id,
  type,
  name: id,
  label: "documented",
  links,
});

const facts = (over: Partial<GateFacts> = {}): GateFacts => ({
  nodes: [],
  records: [],
  problems: [],
  files: new Set(),
  latestAuditActedOn: null,
  ...over,
});

describe("done_when rules", () => {
  it("reads each rule form and leaves other text as a checklist item", () => {
    expect(parseGateRule("At least 3 feature nodes")).toEqual({
      kind: "node_count",
      type: "feature",
      min: 3,
    });
    expect(parseGateRule("at least 1 company node.")).toMatchObject({ min: 1, type: "company" });
    expect(parseGateRule("every pricing_tier node has evidence")).toEqual({
      kind: "nodes_have_evidence",
      type: "pricing_tier",
    });
    expect(parseGateRule("every feature node has a gated_by link")).toMatchObject({
      link: "gated_by",
    });
    expect(parseGateRule("every hypothesis node has an explains link")).toMatchObject({
      link: "explains",
    });
    expect(parseGateRule("at least 2 sources")).toEqual({
      kind: "ledger_count",
      what: "source",
      min: 2,
    });
    expect(parseGateRule("validate_graph is clean")).toEqual({ kind: "graph_clean" });
    expect(parseGateRule("validate_graph has no broken_link problems")).toEqual({
      kind: "graph_clean",
      rule: "broken_link",
    });
    expect(parseGateRule("file notes/focus-1.md exists")).toEqual({
      kind: "file_exists",
      path: "notes/focus-1.md",
    });
    expect(parseGateRule("the latest audit is acted on")).toEqual({ kind: "audit_acted_on" });
    expect(parseGateRule("the user finished their session")).toBeNull();
    expect(parseGateRule("at least 2 widget nodes")).toBeNull();
  });

  it("never checks a file outside the run folder", () => {
    expect(parseGateRule("file ../secret.txt exists")).toBeNull();
    expect(parseGateRule("file /etc/passwd exists")).toBeNull();
    expect(isSafeRunPath("notes/a.md")).toBe(true);
    expect(isSafeRunPath("notes/../../a.md")).toBe(false);
    expect(isSafeRunPath("C:/a.md")).toBe(false);
  });

  it("passes and fails on a small graph, and returns the rest as a checklist", () => {
    const doneWhen = [
      "at least 2 feature nodes",
      "every feature node has a gated_by link",
      "every feature node has evidence",
      "file notes/x.md exists",
      "explain the result to the user",
    ];
    const thin = evaluateGate(doneWhen, facts({ nodes: [node("feature-a", "feature")] }));
    expect(thin.passed).toBe(false);
    expect(thin.checks.map((c) => c.status)).toEqual(["fail", "fail", "fail", "fail"]);
    expect(thin.checks[0]!.detail).toBe("found 1 feature node, need 2");
    expect(thin.checklist).toEqual(["explain the result to the user"]);

    const full = evaluateGate(
      doneWhen,
      facts({
        nodes: [
          node("feature-a", "feature", { gated_by: ["pricing_tier-pro"], evidence: ["E-001"] }),
          node("feature-b", "feature", { gated_by: ["pricing_tier-pro"], evidence: ["E-002"] }),
        ],
        files: new Set(["notes/x.md"]),
      }),
    );
    expect(full.passed).toBe(true);
    expect(full.checks.every((c) => c.status === "pass")).toBe(true);
  });

  it("checks the latest audit was acted on", () => {
    const rule = ["the latest audit is acted on"];
    expect(evaluateGate(rule, facts()).passed).toBe(false);
    expect(evaluateGate(rule, facts({ latestAuditActedOn: false })).passed).toBe(false);
    expect(evaluateGate(rule, facts({ latestAuditActedOn: true })).passed).toBe(true);
  });
});
