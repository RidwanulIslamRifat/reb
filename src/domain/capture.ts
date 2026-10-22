import type { NodeType } from "./links.js";

/**
 * Opt-in product capture (`reb capture`, SPEC 2.3 exception, ROADMAP decision 23): after the person
 * agrees and logs in themselves in a visible browser, reb opens the product's own links one at a
 * time and saves a screenshot and a short text summary of each screen. This file holds the pure
 * rules: which links may be opened, how addresses become screen ids, and what each screen suggests
 * for the analysis. Opening links is the only thing capture does: it never clicks, types, submits
 * forms or downloads files.
 */

export const CAPTURE_LIMITS = {
  /** Screens captured when the person does not say. */
  pages: 25,
  /** Never more than this many screens in one capture. */
  maxPages: 100,
  /** Links followed away from the first screen. */
  depth: 3,
  /** Wait between two screens, in milliseconds, so the product is not rushed. */
  delayMs: 1500,
  minDelayMs: 500,
} as const;

/**
 * Words in an address that mean opening it may change something or leave the session: signing out,
 * deleting, paying, exporting, accepting or confirming. Capture never opens such a link.
 */
const RISKY =
  /(^|[/_.\-#?=])(log-?out|log_out|logoff|sign-?out|sign_out|signoff|delete|remove|destroy|erase|purge|unsubscribe|deactivate|disable|cancel|revoke|disconnect|uninstall|approve|reject|confirm|verify|accept|decline|archive|restore|reset|pay|payment-?method|checkout|purchase|buy|subscribe|upgrade|downgrade|trial|export|download|print|impersonate|switch-?account|leave|transfer|send|publish|submit|run|execute|sync|refresh|toggle|enable|activate|oauth|authorize|callback|sso|saml)([/_.\-#?=]|$)/i;

/** File types that are downloads rather than screens. */
const FILE =
  /\.(pdf|csv|zip|gz|tar|xlsx?|docx?|pptx?|json|xml|txt|png|jpe?g|gif|svg|webp|mp4|mov|mp3|exe|dmg|msi|apk)$/i;

/** Private interfaces of the product: never opened (SPEC 2.3). */
const PRIVATE_API = /(^|\/)(api|graphql|rpc|_next\/data|ajax|xhr|internal)(\/|$)/i;

/** Path parts that are record ids (numbers, uuids, long hex or random strings). */
const ID_PART =
  /^(\d+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{12,}|[A-Za-z0-9_-]{20,})$/i;

export type SkipReason =
  | "other site"
  | "risky"
  | "file"
  | "private api"
  | "not a web page"
  | "redirected"
  | "did not open";

/** Why a link must not be opened, or null when capture may open it. */
export function skipReason(href: string, origin: string): SkipReason | null {
  let url: URL;
  try {
    url = new URL(href, origin);
  } catch {
    return "not a web page";
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return "not a web page";
  if (url.origin !== origin) return "other site";
  const where = decodeURIComponent(url.pathname + url.hash);
  if (PRIVATE_API.test(url.pathname)) return "private api";
  if (FILE.test(url.pathname)) return "file";
  if (RISKY.test(where) || RISKY.test(url.search)) return "risky";
  return null;
}

/**
 * The address capture opens and records: same site, no query string (it can hold tokens or record
 * filters) and no fragment, except an app route like "#/settings".
 */
export function normalizeUrl(href: string, origin: string): string {
  const url = new URL(href, origin);
  const route = url.hash.startsWith("#/") ? url.hash : "";
  const path = url.pathname.replace(/\/+$/, "") || "/";
  return `${url.origin}${path}${route}`;
}

/**
 * The screen pattern of an address: record ids replaced by ":id", so /invoices/123 and
 * /invoices/456 are one screen and only the first is captured.
 */
export function screenPattern(url: string): string {
  const parsed = new URL(url);
  const parts = (parsed.pathname + parsed.hash.replace(/^#/, "")).split("/").filter(Boolean);
  return "/" + parts.map((p) => (ID_PART.test(p) ? ":id" : p.toLowerCase())).join("/");
}

/** The screen node id for a pattern: "/" is screen-home, "/settings/billing" screen-settings-billing. */
export function screenId(pattern: string): string {
  const slug = pattern
    .replace(/:id/g, "detail")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `screen-${slug || "home"}`;
}

/** Text that may belong to a real person (emails, long numbers) is masked before it is stored. */
export function maskPersonal(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[email]")
    .replace(/\+?\d[\d\s().-]{7,}\d/g, "[number]")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * One form field as the screen shows it: its label, the kind of input (text, email, date, select,
 * checkbox ...), whether it is marked required, and for a select the choices it offers. What the
 * person typed into a field is never read.
 */
export interface FormField {
  label: string;
  kind: string;
  required: boolean;
  options: string[];
}

/** The distinct short values shown in one table column whose header names a kind (Status, Stage). */
export interface ColumnValues {
  column: string;
  values: string[];
}

/**
 * What reb reads from one screen: visible labels, never what was typed into a field. The deeper
 * parts (form field details, menu, tabs, column kinds, charts, controls, notices) feed the feature
 * model (domain/productModel.ts); they are optional so older captures still read.
 */
export interface PageSnapshot {
  url: string;
  title: string;
  headings: string[];
  links: Array<{ href: string; text: string }>;
  buttons: string[];
  fields: string[];
  columns: string[];
  form_fields?: FormField[];
  /** Items of the main menu (nav, sidebar): usually the product's modules. */
  nav?: string[];
  tabs?: string[];
  /** Values of columns like Status, Stage, Type or Priority: the states records move through. */
  values?: ColumnValues[];
  /** Charts or graphs on the screen. */
  charts?: number;
  /** List controls seen: search, filter, sort, pagination, bulk_select, date_range, views. */
  controls?: string[];
  /** Short alerts and banners: limits, plan locks, usage ("3 of 5 seats used"). */
  notices?: string[];
  breadcrumbs?: string[];
}

/** Column headers whose values are kinds or states (Status, Stage, Type ...), not record data. */
const KIND_COLUMN =
  /\b(status|stage|state|phase|lifecycle|type|priority|category|source|health|severity|plan|tier|role|level|kind)\b/i;

/** Fields whose choices are usually people or records, never kept. */
const PERSONAL_FIELD =
  /\b(owner|assignee|assigned|user|member|contact|person|people|rep|name|email|customer|client|company|account|lead|recipient|from|to)\b/i;

/** Choices that are placeholders, not values. */
const PLACEHOLDER = /^(-+|select.*|choose.*|none|all|any|\.\.\.|—)$/i;

const shortValue = (v: string) =>
  v.length > 0 && v.length <= 30 && !/\d{3,}|@|[$€£¥]|^\d+([.,]\d+)?%?$/.test(v);

/**
 * The deeper parts of a snapshot, cleaned: masked, with placeholders dropped, people's names and
 * long lists left out. Column values are kept only for kind columns with at most 12 distinct short
 * values, so they are the product's states and types (New, Won, Lost), not the person's records.
 */
export function screenDetail(snap: PageSnapshot) {
  const mask = (t: string) => maskPersonal(t);
  const uniq = (items: string[] | undefined, max: number) =>
    [...new Set((items ?? []).map(mask).filter(Boolean))].slice(0, max);
  const form_fields: FormField[] = [];
  const seen = new Set<string>();
  for (const f of snap.form_fields ?? []) {
    const label = mask(f.label).slice(0, 80);
    if (!label || seen.has(label.toLowerCase())) continue;
    seen.add(label.toLowerCase());
    let options = [...new Set(f.options.map(mask).filter((o) => o && !PLACEHOLDER.test(o)))];
    if (
      (PERSONAL_FIELD.test(label) && !KIND_COLUMN.test(label)) ||
      options.length > 25 ||
      !options.every(shortValue)
    ) {
      options = [];
    }
    form_fields.push({
      label,
      kind: (f.kind || "text").toLowerCase(),
      required: !!f.required,
      options,
    });
  }
  const values: ColumnValues[] = [];
  for (const v of snap.values ?? []) {
    const column = mask(v.column);
    if (!KIND_COLUMN.test(column) || values.some((x) => x.column === column)) continue;
    const distinct = [...new Set(v.values.map(mask))].filter((x) => !PLACEHOLDER.test(x));
    if (distinct.length && distinct.length <= 12 && distinct.every(shortValue)) {
      values.push({ column, values: distinct });
    }
  }
  return {
    form_fields,
    values,
    nav: uniq(snap.nav, 40),
    tabs: uniq(snap.tabs, 15),
    charts: Math.max(0, Math.min(Number(snap.charts) || 0, 50)),
    controls: uniq(snap.controls, 10),
    notices: uniq(snap.notices, 8).map((n) => n.slice(0, 160)),
    breadcrumbs: uniq(snap.breadcrumbs, 6),
  };
}

export interface CapturedScreen {
  id: string;
  name: string;
  url: string;
  pattern: string;
  depth: number;
  file: string;
  title: string;
  headings: string[];
  buttons: string[];
  fields: string[];
  columns: string[];
  form_fields: FormField[];
  nav: string[];
  tabs: string[];
  values: ColumnValues[];
  charts: number;
  controls: string[];
  notices: string[];
  breadcrumbs: string[];
  /** Ids of captured screens this one links to. */
  links_to: string[];
  hints: ScreenHint[];
}

export interface ScreenHint {
  type: NodeType;
  why: string;
}

const HINT_RULES: Array<{ words: RegExp; type: NodeType; why: string }> = [
  {
    words: /\b(billing|plan|plans|subscription|pricing|invoice history|usage|quota|limit)s?\b/i,
    type: "pricing_tier",
    why: "plans, usage or limits are shown here",
  },
  {
    words: /\b(upgrade|pro plan|business plan|enterprise|premium|available on|locked)\b/i,
    type: "business_rule",
    why: "something is gated by plan (an upgrade prompt or a lock)",
  },
  {
    words: /\b(team|members?|users?|roles?|permissions?|invite|admins?|access)\b/i,
    type: "user_role",
    why: "people, roles or permissions are managed here",
  },
  {
    words: /\b(integrations?|apps?|connect(ed|ions?)?|marketplace|plugins?|webhooks?)\b/i,
    type: "integration",
    why: "outside tools are connected here",
  },
  {
    words: /\b(api keys?|developers?|tokens?)\b/i,
    type: "api_endpoint",
    why: "the product has a developer area; check its public API docs",
  },
  {
    words: /\b(reports?|analytics|insights|dashboard|charts?|metrics)\b/i,
    type: "feature",
    why: "a reporting or overview feature",
  },
];

/** Node types a screen suggests, from its address, headings, buttons and columns. */
export function screenHints(page: Omit<CapturedScreen, "hints" | "links_to">): ScreenHint[] {
  const text = [
    page.pattern.replace(/[/:-]/g, " "),
    page.title,
    ...page.headings,
    ...page.buttons,
  ].join(" ");
  const hints = HINT_RULES.filter((r) => r.words.test(text)).map(({ type, why }) => ({
    type,
    why,
  }));
  if (page.fields.length >= 2 || page.columns.length >= 2) {
    const names = (page.columns.length >= 2 ? page.columns : page.fields).slice(0, 8).join(", ");
    hints.push({ type: "data_object", why: `holds records with fields like ${names}` });
  }
  if (page.buttons.length) {
    hints.push({
      type: "feature",
      why: `actions offered: ${page.buttons.slice(0, 6).join(", ")}`,
    });
  }
  const seen = new Set<string>();
  return hints.filter((h) => !seen.has(h.type + h.why) && seen.add(h.type + h.why));
}

/** A readable name for a screen: its main heading, else the first part of the page title. */
export function screenName(page: { title: string; headings: string[]; pattern: string }): string {
  const fromTitle = page.title.split(/\s[|–—-]\s|\s·\s/)[0]?.trim() ?? "";
  const base = page.headings[0] || fromTitle;
  if (base) return base.slice(0, 60);
  return page.pattern === "/" ? "Home" : page.pattern.split("/").filter(Boolean).join(" ");
}

/** The capture as Markdown: a sitemap by path, then one section per screen with its hints. */
export function captureNotes(input: {
  product: string;
  session: string;
  start: string;
  screens: CapturedScreen[];
  skipped: Array<{ url: string; reason: SkipReason }>;
}): string {
  const { screens } = input;
  const byPattern = [...screens].sort((a, b) => a.pattern.localeCompare(b.pattern));
  const out = [
    `# Capture ${input.session}: ${input.product}`,
    "",
    `reb opened ${screens.length} screen${screens.length === 1 ? "" : "s"} from ${input.start} after the ` +
      "person logged in, following links only (no clicks, no typing, no forms). Screenshots are in " +
      `evidence/inbox/${input.session}/. Record ids in addresses are shown as :id.`,
    "",
    "## Sitemap",
    "",
    ...byPattern.map((s) => {
      const level = s.pattern === "/" ? 0 : s.pattern.split("/").filter(Boolean).length - 1;
      return `${"  ".repeat(level)}- **${s.name}** \`${s.pattern}\` [${s.id}]`;
    }),
    "",
    "## Screens",
    "",
  ];
  const nameOf = new Map(screens.map((s) => [s.id, s.name]));
  for (const s of screens) {
    out.push(`### ${s.name} [${s.id}]`, "");
    out.push(`- Address: \`${s.pattern}\`; screenshot \`${s.file}\``);
    if (s.headings.length) out.push(`- Headings: ${s.headings.join("; ")}`);
    if (s.buttons.length) out.push(`- Buttons: ${s.buttons.join("; ")}`);
    if (s.fields.length) out.push(`- Form fields: ${s.fields.join("; ")}`);
    if (s.columns.length) out.push(`- Table columns: ${s.columns.join("; ")}`);
    if (s.form_fields.length) {
      out.push(
        `- Field details: ${s.form_fields.map((f) => `${f.label} (${f.kind}${f.required ? ", required" : ""}${f.options.length ? `: ${f.options.join(" / ")}` : ""})`).join("; ")}`,
      );
    }
    for (const v of s.values) out.push(`- ${v.column} values: ${v.values.join(", ")}`);
    if (s.tabs.length) out.push(`- Tabs: ${s.tabs.join("; ")}`);
    if (s.controls.length) out.push(`- List controls: ${s.controls.join(", ")}`);
    if (s.charts) out.push(`- Charts: ${s.charts}`);
    if (s.notices.length) out.push(`- Notices: ${s.notices.join("; ")}`);
    if (s.links_to.length) {
      out.push(`- Links to: ${s.links_to.map((id) => nameOf.get(id) ?? id).join(", ")}`);
    }
    for (const h of s.hints) out.push(`- Suggests a **${h.type}** node: ${h.why}`);
    out.push("");
  }
  if (input.skipped.length) {
    out.push("## Links not opened", "");
    const counts = new Map<string, number>();
    for (const s of input.skipped) counts.set(s.reason, (counts.get(s.reason) ?? 0) + 1);
    out.push(
      [...counts].map(([reason, n]) => `- ${reason}: ${n}`).join("\n"),
      "",
      "Risky links (sign out, delete, pay, export, confirm ...) are never opened. Look at those " +
        "screens yourself if they matter, and add notes to the inbox.",
      "",
    );
  }
  out.push(
    "## Next steps for the analysis",
    "",
    "1. Look at each screenshot and turn what it shows into nodes: features, user roles, business " +
      "rules (limits, required fields, plan locks), data objects with their fields, and pricing hints.",
    "2. Link each feature to the screen that shows it (`screen shows feature`), and record what the " +
      "screen proves with the screenshot's evidence id.",
    "3. Anything you can only guess from a screen is inferred; what the screenshot shows is observed.",
    "",
  );
  return out.join("\n");
}

/** One line per screen for the inbox notes file, so import_inbox captions each screenshot. */
export function captionLines(screens: CapturedScreen[]): string {
  return (
    [
      "# Captured screens",
      "",
      ...screens.map((s) => {
        const parts = [`${s.file}: screen "${s.name}" at ${s.pattern}`];
        if (s.headings.length > 1) parts.push(`sections ${s.headings.slice(1, 6).join(", ")}`);
        if (s.buttons.length) parts.push(`actions ${s.buttons.slice(0, 6).join(", ")}`);
        return `- [${s.id}] ${parts.join("; ")}.`;
      }),
    ].join("\n") + "\n"
  );
}
