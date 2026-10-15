import { describe, expect, it } from "vitest";
import {
  captureNotes,
  maskPersonal,
  normalizeUrl,
  screenHints,
  screenId,
  screenName,
  screenPattern,
  skipReason,
} from "../../src/domain/capture.js";

const ORIGIN = "https://app.ledgerly.example";

describe("capture rules", () => {
  it("opens only the product's own, harmless links", () => {
    for (const href of [
      "/invoices",
      "/settings/billing",
      "/clients/42",
      "#/reports",
      "/payments",
    ]) {
      expect(skipReason(href, ORIGIN), href).toBeNull();
    }
    const expected: Array<[string, string]> = [
      ["/logout", "risky"],
      ["/users/sign_out", "risky"],
      ["/invoices/42/delete", "risky"],
      ["/billing/upgrade", "risky"],
      ["/checkout?plan=pro", "risky"],
      ["/invoices/export", "risky"],
      ["/invite/accept", "risky"],
      ["/settings?action=delete", "risky"],
      ["/files/report.pdf", "file"],
      ["/api/v1/invoices", "private api"],
      ["/graphql", "private api"],
      ["https://help.ledgerly.example/docs", "other site"],
      ["https://evil.example/", "other site"],
      ["mailto:help@ledgerly.example", "not a web page"],
      ["javascript:void(0)", "not a web page"],
    ];
    for (const [href, reason] of expected) expect(skipReason(href, ORIGIN), href).toBe(reason);
  });

  it("drops query strings, and treats record ids as one screen", () => {
    expect(normalizeUrl("/invoices/?token=abc#top", ORIGIN)).toBe(`${ORIGIN}/invoices`);
    expect(normalizeUrl("/#/settings/team", ORIGIN)).toBe(`${ORIGIN}/#/settings/team`);
    expect(screenPattern(`${ORIGIN}/invoices/123`)).toBe("/invoices/:id");
    expect(screenPattern(`${ORIGIN}/c/3f2a9c1e-2b7d-4e0a-9d1c-0a1b2c3d4e5f/edit`)).toBe(
      "/c/:id/edit",
    );
    expect(screenPattern(`${ORIGIN}/#/settings/Team`)).toBe("/settings/team");
    expect(screenId("/")).toBe("screen-home");
    expect(screenId("/invoices/:id")).toBe("screen-invoices-detail");
  });

  it("masks emails and long numbers, and names screens from headings or titles", () => {
    expect(maskPersonal("Owner: jane@acme.com, +44 20 7946 0000")).toBe("Owner: [email], [number]");
    expect(screenName({ title: "Invoices | Ledgerly", headings: [], pattern: "/invoices" })).toBe(
      "Invoices",
    );
    expect(screenName({ title: "", headings: ["Team members"], pattern: "/team" })).toBe(
      "Team members",
    );
    expect(screenName({ title: "", headings: [], pattern: "/settings/billing" })).toBe(
      "settings billing",
    );
  });

  it("suggests node types from what a screen shows", () => {
    const page = {
      id: "screen-settings-team",
      name: "Team",
      url: "/settings/team",
      pattern: "/settings/team",
      depth: 1,
      file: "screen-settings-team.png",
      title: "Team",
      headings: ["Team members"],
      buttons: ["Invite member"],
      fields: [],
      columns: ["Name", "Role", "Last active"],
    };
    const types = screenHints(page).map((h) => h.type);
    expect(types).toEqual(expect.arrayContaining(["user_role", "data_object", "feature"]));
    const md = captureNotes({
      product: "ledgerly.example",
      session: "session-02",
      start: ORIGIN,
      screens: [{ ...page, links_to: [], hints: screenHints(page) }],
      skipped: [{ url: "/logout", reason: "risky" }],
    });
    expect(md).toContain("- **Team** `/settings/team` [screen-settings-team]");
    expect(md).toContain("Suggests a **user_role** node");
    expect(md).toContain("- risky: 1");
  });
});
