import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Browser } from "playwright-core";
import { build } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startDashboardServer } from "../../src/dashboard/server.js";
import { openRunFolder } from "../../src/storage/runFolder.js";
import type { DashboardHandle } from "../../src/workflows/context.js";

/**
 * Finds a Chromium to drive: REB_CHROMIUM, the one Playwright installed
 * (npx playwright-core install chromium), or the one preinstalled in some cloud sandboxes.
 */
function findChromium(): string | null {
  const candidates = [
    process.env.REB_CHROMIUM,
    (() => {
      try {
        return chromium.executablePath();
      } catch {
        return undefined;
      }
    })(),
    "/opt/pw-browsers/chromium",
  ];
  return candidates.find((p): p is string => !!p && existsSync(p)) ?? null;
}

const executablePath = findChromium();
if (!executablePath) {
  console.warn(
    "Skipping the dashboard browser smoke test: no Chromium found. " +
      "Install one with: npx playwright-core install chromium",
  );
}

describe.skipIf(!executablePath)("dashboard pages in a headless browser", () => {
  let browser: Browser;
  let handle: DashboardHandle;
  // Not tempDir(): that is emptied after every test, and the built page must last for all of them.
  let dir: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "reb-dashboard-"));
    const appDir = join(dir, "public");
    await build({
      configFile: "src/dashboard/app/vite.config.ts",
      build: { outDir: appDir, emptyOutDir: true },
      logLevel: "silent",
    });
    const run = await openRunFolder("unused", "tests/fixtures/dashboard-sample");
    handle = await startDashboardServer({
      scope: { root: join(dir, "runs"), pinned: [run] },
      appDir,
      port: 0,
    });
    browser = await chromium.launch({ executablePath: executablePath! });
  }, 120_000);

  afterAll(async () => {
    await browser?.close();
    await handle?.close();
    await rm(dir, { recursive: true, force: true });
  });

  const pages: Array<[string, string, string]> = [
    ["runs list", "#/", ".run-card"],
    ["plan board", "#/run/dashboard-sample/plan", ".column .task"],
    ["knowledge graph", "#/run/dashboard-sample/graph", "[data-testid=graph] canvas"],
    ["evidence table", "#/run/dashboard-sample/evidence", "table tbody tr"],
    ["activity log", "#/run/dashboard-sample/logs", ".event"],
    ["reports viewer", "#/run/dashboard-sample/reports", ".markdown h1"],
  ];

  for (const scheme of ["light", "dark"] as const) {
    it.each(pages)(
      `renders the %s without errors (${scheme})`,
      { timeout: 30_000 },
      async (_name, hash, selector) => {
        const context = await browser.newContext({ colorScheme: scheme });
        const page = await context.newPage();
        const errors: string[] = [];
        page.on("pageerror", (e) => errors.push(e.message));
        page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
        await page.goto(`${handle.url}${hash}`);
        await page.waitForSelector(selector, { timeout: 15_000 });
        expect(await page.locator("[role=alert]").count()).toBe(0);
        expect(errors).toEqual([]);
        await context.close();
      },
    );
  }

  it(
    "shows a node card with its evidence when a node is picked, and a path between two nodes",
    { timeout: 30_000 },
    async () => {
      const page = await browser.newPage();
      await page.goto(`${handle.url}#/run/dashboard-sample/graph`);
      await page.waitForSelector("[data-testid=graph] canvas");
      await page.getByPlaceholder(/Name of a feature/).fill("export");
      await page.getByRole("button", { name: "Export", exact: true }).click();
      const card = page.getByTestId("node-card");
      await expect(card.getByRole("heading", { name: "Export" }).textContent()).resolves.toBe(
        "Export",
      );
      await card.getByText("E-009", { exact: true }).waitFor();
      await page.locator("select[aria-label=From]").selectOption("persona-writer");
      await page.locator("select[aria-label=To]").selectOption("feature-export");
      await page.getByRole("button", { name: "Show connection" }).click();
      const steps = page.getByRole("list", { name: "Connection" }).locator("li");
      await steps.first().waitFor();
      expect(await steps.count()).toBe(3);
      await page.close();
    },
  );
});
