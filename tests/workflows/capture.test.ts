import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { PageSnapshot } from "../../src/domain/capture.js";
import type { CaptureBrowser } from "../../src/sources/browser.js";
import { captureProduct } from "../../src/workflows/capture.js";
import { createRun } from "../../src/workflows/runs.js";
import { loadGraph } from "../../src/workflows/graph.js";
import { testContext } from "../helpers.js";

const ORIGIN = "https://app.ledgerly.example";
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

// A tiny made-up product: path -> what the screen shows.
const SITE: Record<string, Omit<PageSnapshot, "url">> = {
  "/dashboard": {
    title: "Dashboard | Ledgerly",
    headings: ["Dashboard", "Unpaid invoices"],
    links: [
      { href: `${ORIGIN}/invoices`, text: "Invoices" },
      { href: `${ORIGIN}/settings/team`, text: "Team" },
      { href: `${ORIGIN}/logout`, text: "Sign out" },
      { href: `${ORIGIN}/api/v1/me`, text: "" },
      { href: "https://help.ledgerly.example", text: "Help" },
    ],
    buttons: ["New invoice"],
    fields: [],
    columns: [],
  },
  "/invoices": {
    title: "Invoices | Ledgerly",
    headings: ["Invoices"],
    links: [
      { href: `${ORIGIN}/invoices/101?ref=list`, text: "INV-101 for jane@acme.com" },
      { href: `${ORIGIN}/invoices/102`, text: "INV-102" },
      { href: `${ORIGIN}/invoices/101/delete`, text: "Delete" },
      { href: `${ORIGIN}/dashboard`, text: "Home" },
    ],
    buttons: ["New invoice", "Filter"],
    fields: ["Search"],
    columns: ["Number", "Client", "Total", "Status"],
  },
  "/invoices/101": {
    title: "INV-101 | Ledgerly",
    headings: ["Invoice INV-101"],
    links: [{ href: `${ORIGIN}/invoices`, text: "Back" }],
    buttons: ["Send", "Mark as paid"],
    fields: [],
    columns: [],
  },
  "/settings/team": {
    title: "Team | Ledgerly",
    headings: ["Team members"],
    links: [{ href: `${ORIGIN}/billing/upgrade`, text: "Upgrade to Pro" }],
    buttons: ["Invite member"],
    fields: [],
    columns: ["Name", "Role"],
  },
};

function fakeBrowser() {
  const visited: string[] = [];
  let here = `${ORIGIN}/login`;
  let closed = false;
  const browser: CaptureBrowser = {
    open: async (url) => void (here = url),
    // The person logged in and landed on the dashboard.
    currentUrl: async () => (here.endsWith("/login") ? `${ORIGIN}/dashboard` : here),
    goto: async (url) => {
      visited.push(url);
      here = url;
      return { ok: new URL(url).pathname in SITE, url };
    },
    snapshot: async () => {
      const path = new URL(here.endsWith("/login") ? `${ORIGIN}/dashboard` : here).pathname;
      return { url: here, ...SITE[path]! };
    },
    screenshot: async () => PNG,
    close: async () => void (closed = true),
  };
  return { browser, visited, isClosed: () => closed };
}

async function setup() {
  const ctx = await testContext();
  const run = await createRun(ctx, {
    domain: "ledgerly.example",
    category: "fintech",
    reports: ["rebuild"],
  });
  return { ctx, run };
}

describe("reb capture (after the person agreed and logged in)", () => {
  it("opens only safe links, saves screenshots and adds screen nodes with observed evidence", async () => {
    const { ctx, run } = await setup();
    const fake = fakeBrowser();
    let waited = 0;
    const result = await captureProduct(
      ctx,
      { run: run.slug, url: `${ORIGIN}/login` },
      {
        launch: async () => fake.browser,
        waitForUser: async () => void waited++,
        sleep: async () => undefined,
      },
    );
    expect(waited).toBe(1);
    expect(fake.isClosed()).toBe(true);
    expect(fake.visited.every((u) => !/logout|delete|upgrade|api|help\./.test(u))).toBe(true);
    // Query strings are never opened; /invoices/102 is the same screen as /invoices/101.
    expect(fake.visited).toEqual([
      `${ORIGIN}/invoices`,
      `${ORIGIN}/settings/team`,
      `${ORIGIN}/invoices/101`,
    ]);
    expect(result.screens.map((s) => s.id)).toEqual([
      "screen-dashboard",
      "screen-invoices",
      "screen-settings-team",
      "screen-invoices-detail",
    ]);
    expect(result.session).toBe("session-01");

    const graph = await loadGraph(run.paths);
    const invoices = graph.nodes.find((n) => n.meta.id === "screen-invoices")!;
    expect(invoices.meta.label).toBe("observed");
    expect((invoices.meta as Record<string, unknown>).path).toBe("/invoices");
    expect(invoices.meta.links.navigates_to).toEqual([
      "screen-invoices-detail",
      "screen-dashboard",
    ]);
    const evidence = graph.records.filter(
      (r) =>
        r.kind === "evidence" && r.subject === "screen-invoices" && r.confidence === "observed",
    );
    expect(evidence.length).toBeGreaterThan(0);

    const notes = await readFile(join(run.paths.dir, "notes", "capture-session-01.md"), "utf8");
    expect(notes).toContain("## Sitemap");
    expect(notes).toContain("Table columns: Number; Client; Total; Status");
    expect(notes).toContain("Suggests a **user_role** node");
    expect(notes).toMatch(/- risky: \d+/);
    expect(notes).not.toContain("jane@acme.com");
    const png = await readFile(join(run.paths.inboxSession("session-01"), "screen-invoices.png"));
    expect([...png]).toEqual([...PNG]);
  });

  it("closes the browser even when the capture fails", async () => {
    const { ctx, run } = await setup();
    const fake = fakeBrowser();
    fake.browser.snapshot = async () => {
      throw new Error("page crashed");
    };
    await expect(
      captureProduct(
        ctx,
        { run: run.slug },
        { launch: async () => fake.browser, waitForUser: async () => undefined },
      ),
    ).rejects.toThrow("page crashed");
    expect(fake.isClosed()).toBe(true);
  });

  it("refuses a start address that is not a web page", async () => {
    const { ctx, run } = await setup();
    const fake = fakeBrowser();
    await expect(
      captureProduct(
        ctx,
        { run: run.slug, url: "file:///etc/passwd" },
        { launch: async () => fake.browser, waitForUser: async () => undefined },
      ),
    ).rejects.toThrow("is not a web address");
  });
});
