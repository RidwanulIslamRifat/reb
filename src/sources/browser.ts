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

// Runs inside the page. Reads labels and measured styles only; what is typed into an input is never read. Select
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
  // The visual design, measured from computed styles only: colours, fonts, sizes, spacing, corner
  // radius, shadows, the screen's regions and the look of each kind of component and its visible
  // states. No text, images, icons or code are read here.
  const design = () => {
    const vw = window.innerWidth, vh = window.innerHeight;
    const px = (v) => Math.round(parseFloat(v) || 0);
    const bump = (map, key, n = 1) => { if (key) map.set(key, (map.get(key) || 0) + n); };
    const top = (map, max) => [...map].sort((a, b) => b[1] - a[1]).slice(0, max).map(([value, count]) => ({ value, count }));
    const paint = (c) => (!c || c === "transparent" || /rgba\\([^)]*,\\s*0\\)$/.test(c) ? "" : c);
    const ownText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    const family = (cs) => cs.fontFamily.split(",")[0].replace(/["']/g, "").trim();
    const els = [...document.body.querySelectorAll("*")].filter(visible).slice(0, 2500);
    const colors = new Map(), fonts = new Map(), spacing = new Map(), radius = new Map(), shadows = new Map(), icons = new Map(), motion = new Map();
    for (const el of els) {
      const cs = getComputedStyle(el);
      if (ownText(el)) { bump(colors, "text " + paint(cs.color)); bump(fonts, family(cs)); }
      const bg = paint(cs.backgroundColor);
      if (bg) bump(colors, "background " + bg);
      if (px(cs.borderTopWidth) > 0 && cs.borderTopStyle !== "none") bump(colors, "border " + paint(cs.borderTopColor));
      for (const k of ["paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "marginTop", "marginBottom", "rowGap", "columnGap"]) {
        const v = px(cs[k]);
        if (v > 0 && v <= 96) bump(spacing, v + "px");
      }
      if (px(cs.borderTopLeftRadius) > 0) bump(radius, cs.borderTopLeftRadius.split(" ")[0]);
      if (cs.boxShadow && cs.boxShadow !== "none") bump(shadows, cs.boxShadow.slice(0, 120));
      if (parseFloat(cs.transitionDuration) > 0) bump(motion, cs.transitionDuration.split(",")[0] + " " + cs.transitionTimingFunction.split(",")[0]);
      if (el.tagName.toLowerCase() === "svg") {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.width <= 32) bump(icons, Math.round(r.width) + "px");
      }
    }
    const look = (el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const border = px(cs.borderTopWidth) > 0 && cs.borderTopStyle !== "none" ? px(cs.borderTopWidth) + "px " + cs.borderTopStyle + " " + cs.borderTopColor : "";
      return {
        width: Math.round(r.width), height: Math.round(r.height),
        padding: [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft].map(px).join(" "),
        radius: cs.borderTopLeftRadius.split(" ")[0], background: paint(cs.backgroundColor), color: cs.color, border,
        font: px(cs.fontSize) + "px/" + (cs.lineHeight === "normal" ? "normal" : px(cs.lineHeight) + "px") + " " + family(cs) + " " + cs.fontWeight,
        shadow: cs.boxShadow === "none" ? "" : cs.boxShadow.slice(0, 120), opacity: cs.opacity,
      };
    };
    const ROLES = { h1: "h1", h2: "h2", h3: "h3", h4: "h4", body: "p, li, td", small: "small, [class*=caption i], [class*=hint i], [class*=helper i]", label: "label", link: "a[href]", button: "button, [role=button]", input: "input, textarea, select", table_header: "th, [role=columnheader]" };
    const text_styles = [];
    for (const [role, selector] of Object.entries(ROLES)) {
      const seen = new Map();
      for (const el of all(selector).slice(0, 80)) {
        const cs = getComputedStyle(el);
        bump(seen, JSON.stringify({ size: px(cs.fontSize), line_height: cs.lineHeight === "normal" ? 0 : px(cs.lineHeight), weight: cs.fontWeight, family: family(cs), color: cs.color, letter_spacing: cs.letterSpacing === "normal" ? "" : cs.letterSpacing }));
      }
      const best = [...seen].sort((a, b) => b[1] - a[1])[0];
      if (best) text_styles.push({ role, count: best[1], ...JSON.parse(best[0]) });
    }
    const KINDS = {
      button: "button, [role=button], input[type=submit], input[type=button]",
      input: "input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=submit]):not([type=button]), textarea",
      select: "select, [role=combobox]",
      checkbox: "input[type=checkbox], [role=checkbox]",
      radio: "input[type=radio], [role=radio]",
      toggle: "[role=switch]",
      tab: "[role=tab]",
      table: "table, [role=grid], [role=table]",
      table_row: "tbody tr, [role=row]",
      nav_item: "nav a, aside a, [role=navigation] a, [role=menuitem]",
      badge: "[class*=badge i], [class*=chip i], [class*=pill i]",
      card: "[class*=card i]",
      dialog: "[role=dialog], dialog[open]",
      menu: "[role=menu], [role=listbox]",
      tooltip: "[role=tooltip]",
      alert: "[role=alert], [role=status], [class*=toast i], [class*=banner i]",
      avatar: "[class*=avatar i]",
    };
    const STATES = {
      disabled: "[disabled], [aria-disabled=true]",
      selected: "[aria-selected=true], [aria-current]:not([aria-current=false]), [data-state=active]",
      checked: ":checked, [aria-checked=true], [data-state=checked]",
      expanded: "[aria-expanded=true], [data-state=open]",
      loading: "[aria-busy=true]",
      invalid: "[aria-invalid=true]",
      read_only: "[readonly], [aria-readonly=true]",
      empty: ":placeholder-shown",
    };
    const components = [];
    for (const [kind, selector] of Object.entries(KINDS)) {
      const found = all(selector).slice(0, 60);
      if (!found.length) continue;
      const variants = new Map();
      for (const el of found) {
        const l = look(el);
        const key = JSON.stringify([l.background, l.color, l.border, l.radius, l.height, l.font]);
        const v = variants.get(key) || { count: 0, style: l };
        v.count++;
        variants.set(key, v);
      }
      const states = [];
      for (const [state, s] of Object.entries(STATES)) {
        const el = found.find((e) => e.matches(s));
        if (el) states.push({ state, style: look(el) });
      }
      components.push({ kind, count: found.length, variants: [...variants.values()].sort((a, b) => b.count - a.count).slice(0, 4), states });
    }
    const regions = [];
    const region = (name, el) => {
      const r = el.getBoundingClientRect();
      if (r.width < 40 || r.height < 20) return;
      const cs = getComputedStyle(el);
      regions.push({ name, x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height), background: paint(cs.backgroundColor), position: cs.position });
    };
    const firstOf = (selector) => all(selector).sort((a, b) => b.getBoundingClientRect().width * b.getBoundingClientRect().height - a.getBoundingClientRect().width * a.getBoundingClientRect().height)[0];
    for (const [name, selector] of [["top bar", "header, [role=banner]"], ["sidebar", "aside, nav[aria-label], [class*=sidebar i]"], ["navigation", "nav, [role=navigation]"], ["main", "main, [role=main]"], ["footer", "footer, [role=contentinfo]"], ["dialog", "[role=dialog], dialog[open]"]]) {
      const el = firstOf(selector);
      if (el) region(name, el);
    }
    if (!regions.some((r) => r.name === "sidebar")) {
      const side = els.find((el) => { const r = el.getBoundingClientRect(); return r.left <= 1 && r.top <= 80 && r.width >= 48 && r.width <= 400 && r.height >= vh * 0.8; });
      if (side) region("sidebar", side);
    }
    if (!regions.some((r) => r.name === "top bar")) {
      const bar = els.find((el) => { const r = el.getBoundingClientRect(); return r.top <= 1 && r.width >= vw * 0.6 && r.height >= 32 && r.height <= 120; });
      if (bar) region("top bar", bar);
    }
    const states = [];
    const mainText = text(document.querySelector("main, [role=main]") || document.body).slice(0, 4000);
    if (/\\bno [a-z ]{0,30}(yet|found)\\b|nothing (here|to show)|no results|get started|create your first/i.test(mainText)) states.push("empty");
    if (all("[aria-busy=true], [class*=skeleton i], [class*=spinner i], [role=progressbar]").length) states.push("loading");
    if (all("[role=alert]").some((el) => /error|failed|wrong|invalid/i.test(text(el)))) states.push("error");
    if (all("[role=dialog], dialog[open]").length) states.push("dialog open");
    if (all("[disabled], [aria-disabled=true]").length) states.push("has disabled controls");
    return {
      viewport: { width: vw, height: vh, page_height: document.documentElement.scrollHeight },
      colors: top(colors, 40),
      fonts: top(fonts, 6),
      text_styles,
      spacing: top(spacing, 16),
      radius: top(radius, 8),
      shadows: top(shadows, 6),
      icon_sizes: top(icons, 4),
      motion: top(motion, 4),
      regions,
      components,
      states,
    };
  };
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
    design: design(),
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
      // Email addresses and phone numbers are covered in the picture, so they are never stored.
      return await page.screenshot({
        fullPage: true,
        mask: [
          page.getByText(/[\w.+-]+@[\w-]+(\.[\w-]+)+/),
          page.locator(
            "input[type=email], input[type=tel], input[autocomplete*=email], input[name*=email i], input[name*=phone i]",
          ),
        ],
      });
    },
    async close() {
      await context.close().catch(() => undefined);
      await browser.close().catch(() => undefined);
    },
  };
};
