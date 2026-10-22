import { RebError } from "../domain/errors.js";
import type { PageSnapshot } from "../domain/capture.js";

/**
 * The browser behind `reb capture` (SPEC 2.3 exception, ROADMAP decision 23). It opens one visible
 * window with a fresh profile, so the person's own cookies and saved passwords are never touched,
 * and everything (including the login) is thrown away when the window closes. reb only opens
 * addresses, reads visible labels and takes screenshots: there is no clicking, typing, form
 * submitting or downloading anywhere in this file, and a test checks that stays so.
 */
export interface CaptureBrowser {
  /** Opens the first address and shows the window to the person. */
  open(url: string): Promise<void>;
  /** The address the window shows now (after the person logged in). */
  currentUrl(): Promise<string>;
  /** Opens an address. `url` is where the window ended up (redirects included). */
  goto(url: string): Promise<{ ok: boolean; url: string }>;
  /** Visible labels of the current screen: title, headings, links, buttons, field labels, columns. */
  snapshot(): Promise<PageSnapshot>;
  /** PNG screenshot of the whole current screen. */
  screenshot(): Promise<Uint8Array>;
  close(): Promise<void>;
}

export type BrowserLauncher = (options: { headless?: boolean }) => Promise<CaptureBrowser>;

// Runs inside the page. Reads labels only; what is typed into an input is never read. Select
// choices and short values of kind columns (Status, Stage ...) are read as raw text and filtered
// in domain/productModel.ts (cleanScreenDetail), which drops people's names and long lists.
const SNAPSHOT_SCRIPT = `(() => {
  const text = (el) => (el.innerText || el.textContent || "").replace(/\\s+/g, " ").trim();
  const visible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  const all = (selector) => [...document.querySelectorAll(selector)].filter(visible);
  const list = (selector, max, read = text) =>
    [...new Set(all(selector).map(read).filter(Boolean))]
      .map((t) => t.slice(0, 80))
      .slice(0, max);
  const label = (el) =>
    (el.labels && el.labels[0] && text(el.labels[0])) ||
    el.getAttribute("aria-label") || el.getAttribute("placeholder") || el.getAttribute("name") || "";
  const inputs = "input:not([type=hidden]):not([type=submit]):not([type=button]), select, textarea";
  const formFields = all(inputs).slice(0, 40).map((el) => ({
    label: label(el).slice(0, 80),
    kind: el.tagName === "SELECT" ? "select" : el.tagName === "TEXTAREA" ? "textarea" : (el.getAttribute("type") || "text").toLowerCase(),
    required: el.required === true || el.getAttribute("aria-required") === "true",
    options: el.tagName === "SELECT" ? [...el.options].slice(0, 40).map((o) => text(o).slice(0, 40)) : [],
  })).filter((f) => f.label);
  const tableValues = [];
  for (const table of all("table, [role=grid], [role=table]").slice(0, 3)) {
    const heads = [...table.querySelectorAll("th, [role=columnheader]")].map(text);
    const rows = [...table.querySelectorAll("tbody tr, [role=row]")].slice(0, 50);
    heads.forEach((column, i) => {
      if (!column) return;
      const values = rows
        .map((row) => row.querySelectorAll("td, [role=cell], [role=gridcell]")[i])
        .filter(Boolean)
        .map((c) => text(c).slice(0, 40))
        .filter(Boolean);
      if (values.length) tableValues.push({ column: column.slice(0, 60), values });
    });
  }
  const controls = [];
  const has = (selector) => all(selector).length > 0;
  const words = (re) => all("button, [role=button], a, label, [role=tab]").some((el) => re.test(text(el)) || re.test(el.getAttribute("aria-label") || ""));
  if (has("input[type=search], [role=search], input[placeholder*=earch i]")) controls.push("search");
  if (words(/^filters?\\b|add filter|advanced filter/i)) controls.push("filter");
  if (has("[aria-sort]") || words(/^sort\\b/i)) controls.push("sort");
  if (has("[aria-label*=agination i], .pagination, nav[aria-label*=page i]") || words(/^(next|previous|prev)$|\\bof \\d+\\b/i)) controls.push("pagination");
  if (has("thead input[type=checkbox], [role=columnheader] input[type=checkbox]")) controls.push("bulk_select");
  if (words(/date range|last \\d+ days|this (month|quarter|year)/i)) controls.push("date_range");
  if (words(/^(all|my) [a-z]+$|saved views?|create view|add view/i)) controls.push("views");
  return {
    url: location.href,
    title: document.title || "",
    headings: list("h1, h2, h3", 12),
    links: [...document.querySelectorAll("a[href]")]
      .slice(0, 400)
      .map((a) => ({ href: a.href, text: text(a).slice(0, 80) })),
    buttons: list("button, [role=button], input[type=submit], input[type=button]", 30,
      (el) => text(el) || el.getAttribute("aria-label") || el.value || ""),
    fields: list(inputs, 20, label),
    columns: list("th, [role=columnheader]", 20),
    form_fields: formFields,
    nav: list("nav a, nav [role=menuitem], aside a, [role=navigation] a, [role=menubar] [role=menuitem]", 40),
    tabs: list("[role=tab]", 15),
    values: tableValues,
    charts: all("canvas, svg.highcharts-root, .recharts-wrapper, .apexcharts-canvas, [class*=chart i] svg, [data-testid*=chart i]").length,
    controls,
    notices: list("[role=alert], [role=status], [class*=banner i], [class*=upgrade i], [class*=quota i], [class*=usage i]", 8),
    breadcrumbs: list("[aria-label*=readcrumb i] a, [aria-label*=readcrumb i] li, .breadcrumb li", 6),
  };
})()`;

/** Browsers tried in order: REB_BROWSER, Google Chrome, Microsoft Edge, Playwright's own Chromium. */
async function launchFirst(headless: boolean) {
  const { chromium } = await import("playwright-core");
  const attempts: Array<{ what: string; options: Record<string, unknown> }> = [];
  const custom = process.env.REB_BROWSER;
  if (custom) attempts.push({ what: custom, options: { executablePath: custom } });
  attempts.push({ what: "Google Chrome", options: { channel: "chrome" } });
  attempts.push({ what: "Microsoft Edge", options: { channel: "msedge" } });
  const bundled = (() => {
    try {
      return chromium.executablePath();
    } catch {
      return "";
    }
  })();
  for (const path of [bundled, "/opt/pw-browsers/chromium"]) {
    if (path) attempts.push({ what: path, options: { executablePath: path } });
  }
  const failures: string[] = [];
  for (const attempt of attempts) {
    try {
      return await chromium.launch({ headless, ...attempt.options });
    } catch (error) {
      failures.push(`${attempt.what}: ${(error as Error).message.split("\n")[0]}`);
    }
  }
  throw new RebError(
    `reb could not start a browser for the capture (${failures.join("; ")}).`,
    "Install Google Chrome or Microsoft Edge, or set REB_BROWSER to the path of a Chromium-based browser.",
  );
}

export const launchCaptureBrowser: BrowserLauncher = async ({ headless = false } = {}) => {
  const browser = await launchFirst(headless);
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    acceptDownloads: false,
  });
  const page = await context.newPage();
  // Dialogs (alert, confirm) are dismissed, so nothing is ever confirmed on the person's behalf.
  page.on("dialog", (dialog) => void dialog.dismiss().catch(() => undefined));
  return {
    async open(url) {
      await page.goto(url, { waitUntil: "domcontentloaded" });
    },
    async currentUrl() {
      return page.url();
    },
    async goto(url) {
      const response = await page
        .goto(url, { waitUntil: "load", timeout: 30_000 })
        .catch(() => null);
      await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);
      return { ok: response !== null && response.status() < 400, url: page.url() };
    },
    async snapshot() {
      return (await page.evaluate(SNAPSHOT_SCRIPT)) as PageSnapshot;
    },
    async screenshot() {
      return await page.screenshot({ fullPage: true });
    },
    async close() {
      await context.close().catch(() => undefined);
      await browser.close().catch(() => undefined);
    },
  };
};
