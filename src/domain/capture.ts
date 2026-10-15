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

/** What reb reads from one screen: only visible labels, never field values. */
export interface PageSnapshot {
  url: string;
  title: string;
  headings: string[];
  links: Array<{ href: string; text: string }>;
  buttons: string[];
  fields: string[];
  columns: string[];
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
