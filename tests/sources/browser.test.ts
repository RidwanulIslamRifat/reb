import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { launchCaptureBrowser } from "../../src/sources/browser.js";
import { captureProduct } from "../../src/workflows/capture.js";
import { createRun } from "../../src/workflows/runs.js";
import { testContext } from "../helpers.js";

/**
 * reb capture against a tiny local product in a real (headless) browser. The product records every
 * request, so the test proves what capture never does: sign out, delete, submit or call the API.
 */
const CHROMIUM = process.env.REB_CHROMIUM ?? "/opt/pw-browsers/chromium";
const available = existsSync(CHROMIUM);

const page = (title: string, body: string) =>
  `<!doctype html><title>${title} | Ledgerly</title><body>${body}</body>`;
const PAGES: Record<string, string> = {
  "/app": page(
    "Dashboard",
    `<h1>Dashboard</h1><a href="/app/invoices">Invoices</a> <a href="/app/team">Team</a>
     <a href="/logout">Sign out</a> <a href="/api/me">me</a>
     <form method="post" action="/app/invoices"><input name="client" placeholder="Client"><button>Create</button></form>`,
  ),
  "/app/invoices": page(
    "Invoices",
    `<nav><a href="/app">Home</a> <a href="/app/invoices">Invoices</a> <a href="/app/team">Team</a></nav>
     <h1>Invoices</h1><input type="search" placeholder="Search invoices"><button>Filters</button>
     <table><thead><tr><th>Number</th><th>Client</th><th>Total</th><th>Status</th></tr></thead>
     <tbody><tr><td>INV-7</td><td>Jane Roe</td><td>$120</td><td>Paid</td></tr>
     <tr><td>INV-8</td><td>John Doe</td><td>$80</td><td>Overdue</td></tr></tbody></table>
     <form><label for="c">Client</label><select id="c" required><option>Jane Roe</option></select>
     <label for="d">Due date</label><input id="d" type="date" required>
     <label for="s">Status</label><select id="s"><option>Draft</option><option>Sent</option><option>Paid</option></select></form>
     <a href="/app/invoices/7">INV-7</a> <a href="/app/invoices/7/delete">Delete</a>`,
  ),
  "/app/invoices/7": page("INV-7", `<h1>Invoice INV-7</h1><button>Send</button>`),
  "/app/team": page(
    "Team",
    `<style>button{background:#4f46e5;color:#fff;border:0;border-radius:6px;height:32px}</style>
     <h1>Team members</h1><button>Invite member</button><p>Owner: jane.roe@acme.example</p>`,
  ),
};

describe.skipIf(!available)("reb capture in a real browser", () => {
  let server: Server;
  let base: string;
  const requests: string[] = [];

  beforeAll(async () => {
    server = createServer((req, res) => {
      requests.push(`${req.method} ${req.url}`);
      const html = PAGES[req.url ?? ""];
      res.writeHead(html ? 200 : 404, { "Content-Type": "text/html" });
      res.end(html ?? "not found");
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  it("captures the screens and never signs out, deletes, submits or calls the API", async () => {
    const before = process.env.REB_BROWSER;
    process.env.REB_BROWSER = CHROMIUM;
    const ctx = await testContext();
    const run = await createRun(ctx, { domain: "ledgerly.example", reports: ["rebuild"] });
    const result = await captureProduct(
      ctx,
      { run: run.slug, url: `${base}/app`, delay_ms: 500 },
      { launch: launchCaptureBrowser, headless: true, waitForUser: async () => undefined },
    ).finally(() => {
      if (before === undefined) delete process.env.REB_BROWSER;
      else process.env.REB_BROWSER = before;
    });
    expect(result.screens.map((s) => s.path).sort()).toEqual([
      "/app",
      "/app/invoices",
      "/app/invoices/:id",
      "/app/team",
    ]);
    expect(requests.every((r) => r.startsWith("GET "))).toBe(true);
    // The deeper reading: field kinds and choices, kind columns, menu and list controls.
    const map = JSON.parse(
      await readFile(join(run.paths.imports(result.session), "capture.json"), "utf8"),
    ) as { screens: Array<Record<string, unknown> & { pattern: string }> };
    const invoices = map.screens.find((s) => s.pattern === "/app/invoices")!;
    expect(invoices["form_fields"]).toEqual([
      { label: "Search invoices", kind: "search", required: false, options: [] },
      { label: "Client", kind: "select", required: true, options: [] },
      { label: "Due date", kind: "date", required: true, options: [] },
      { label: "Status", kind: "select", required: false, options: ["Draft", "Sent", "Paid"] },
    ]);
    expect(invoices["values"]).toEqual([{ column: "Status", values: ["Paid", "Overdue"] }]);
    expect(invoices["nav"]).toEqual(["Home", "Invoices", "Team"]);
    expect(invoices["controls"]).toEqual(expect.arrayContaining(["search", "filter"]));
    expect(JSON.stringify(map)).not.toContain("Jane Roe");
    expect(result.feature_model.entities).toBeGreaterThan(0);
    expect(requests.some((r) => /logout|delete|\/api\//.test(r))).toBe(false);

    // The visual design: measured from computed styles, turned into tokens and patterns.
    const team = map.screens.find((s) => s.pattern === "/app/team")!;
    const design = team["design"] as { viewport: { width: number }; components: unknown[] };
    expect(design.viewport.width).toBe(1440);
    expect(JSON.stringify(design)).toContain("#4f46e5");
    expect(JSON.stringify(design)).not.toContain("jane.roe");
    expect(result.feature_model.design_tokens).toBeGreaterThan(5);
    expect(result.feature_model.ux_patterns).toBeGreaterThan(0);
    const primary = await readFile(
      join(run.paths.dir, "kb", "nodes", "design_token-primary.md"),
      "utf8",
    );
    expect(primary).toContain('value: "#4f46e5"');
    expect(primary).toContain("label: observed");

    // Emails are covered in the screenshot: the mask paints them magenta (#ff00ff).
    const shot = await readFile(
      join(run.paths.inboxSession(result.session), "screen-app-team.png"),
    );
    const { chromium } = await import("playwright-core");
    const viewer = await chromium.launch({ executablePath: CHROMIUM });
    const tab = await viewer.newPage();
    // Counted inside the page (a string script: the test files are typed without DOM types).
    const src = `data:image/png;base64,${shot.toString("base64")}`;
    const magenta = (await tab.evaluate(`(async () => {
      const img = new Image();
      img.src = ${JSON.stringify(src)};
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const g = canvas.getContext("2d");
      g.drawImage(img, 0, 0);
      const px = g.getImageData(0, 0, img.width, img.height).data;
      let n = 0;
      for (let i = 0; i < px.length; i += 4) if (px[i] > 240 && px[i + 1] < 20 && px[i + 2] > 240) n++;
      return n;
    })()`)) as number;
    await viewer.close();
    expect(magenta).toBeGreaterThan(100);
  }, 60_000);
});
