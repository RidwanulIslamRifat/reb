import { existsSync } from "node:fs";
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
    `<h1>Invoices</h1><table><tr><th>Number</th><th>Total</th></tr></table>
     <a href="/app/invoices/7">INV-7</a> <a href="/app/invoices/7/delete">Delete</a>`,
  ),
  "/app/invoices/7": page("INV-7", `<h1>Invoice INV-7</h1><button>Send</button>`),
  "/app/team": page("Team", `<h1>Team members</h1><button>Invite member</button>`),
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
    expect(requests.some((r) => /logout|delete|\/api\//.test(r))).toBe(false);
  }, 60_000);
});
