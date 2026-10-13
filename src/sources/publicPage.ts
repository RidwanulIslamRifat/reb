import { isIP } from "node:net";
import { RebError } from "../domain/errors.js";

/**
 * Pure helpers for read_public_page: which URLs count as public, how a page is turned into
 * readable text, and how a login page is recognised. Fetching is done by the workflow.
 */

const PRIVATE_HOST = /(^|\.)(localhost|local|internal|intranet|lan|home|corp)$/i;

function isPrivateIp(host: string): boolean {
  const ip = host.replace(/^\[|\]$/g, "");
  const version = isIP(ip);
  if (version === 4) {
    const [a, b] = ip.split(".").map(Number) as [number, number];
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }
  if (version === 6) {
    const lower = ip.toLowerCase();
    return (
      lower === "::" ||
      lower === "::1" ||
      /^f[cd]/.test(lower) ||
      /^fe[89ab]/.test(lower) ||
      lower.startsWith("::ffff:")
    );
  }
  return false;
}

/**
 * Checks that a URL is a public web address reb may read: http or https, no user name or
 * password in it, and not a local or private network address. Returns the parsed URL.
 */
export function checkPublicUrl(text: string): URL {
  let url: URL;
  try {
    url = new URL(text.trim());
  } catch {
    throw new RebError(
      `"${text}" is not a web address.`,
      "Give a full public address, for example https://example.com/pricing",
    );
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new RebError(
      `${url.protocol} addresses cannot be read; reb only reads public web pages.`,
      "Give an address that starts with https:// or http://",
    );
  }
  if (url.username || url.password) {
    throw new RebError(
      "The address contains a user name or password; reb never logs in (SPEC 2.3).",
      "Remove the login part (before @) and use the public address only.",
    );
  }
  if (!url.hostname.includes(".") || PRIVATE_HOST.test(url.hostname) || isPrivateIp(url.hostname)) {
    throw new RebError(
      `${url.hostname} is a local or private address, not a public page.`,
      "reb only reads pages anyone on the internet can open. Give a public address.",
    );
  }
  url.hash = "";
  return url;
}

/** Content types reb turns into text. */
export function isReadableType(contentType: string | undefined): boolean {
  const type = (contentType ?? "text/html").split(";")[0]!.trim().toLowerCase();
  return type === "text/html" || type === "application/xhtml+xml" || type === "text/plain";
}

/** Decodes a body using the charset from the content type or the page's meta tag (default UTF-8). */
export function decodeBody(body: Uint8Array, contentType: string | undefined): string {
  const head = new TextDecoder("latin1").decode(body.subarray(0, 2048));
  const charset =
    /charset=["']?([\w-]+)/i.exec(contentType ?? "")?.[1] ??
    /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1] ??
    "utf-8";
  try {
    return new TextDecoder(charset).decode(body);
  } catch {
    return new TextDecoder("utf-8").decode(body);
  }
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  bull: "•",
  middot: "·",
  copy: "©",
  reg: "®",
  trade: "™",
  euro: "€",
  pound: "£",
  yen: "¥",
  cent: "¢",
  times: "×",
  rarr: "→",
  larr: "←",
  check: "✓",
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === "#") {
      const n =
        code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : Number(code.slice(1));
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : whole;
    }
    return ENTITIES[code.toLowerCase()] ?? whole;
  });
}

/** Attributes of every tag with the given name, for example all <meta> tags. */
export function tagAttributes(html: string, tag: string): Array<Record<string, string>> {
  const out: Array<Record<string, string>> = [];
  for (const [, attrs] of html.matchAll(new RegExp(`<${tag}\\b([^>]*)>`, "gi"))) {
    const map: Record<string, string> = {};
    for (const m of attrs!.matchAll(/([a-zA-Z_:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
      map[m[1]!.toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? "");
    }
    out.push(map);
  }
  return out;
}

/** Content of the first <meta> whose name, property or itemprop is one of `keys`. */
function metaContent(metas: Array<Record<string, string>>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const found = metas.find((m) => [m.name, m.property, m.itemprop].includes(key));
    if (found?.content?.trim()) return found.content.trim();
  }
  return undefined;
}

function toDate(value: string | undefined): string | undefined {
  return /^(\d{4}-\d{2}-\d{2})/.exec(value ?? "")?.[1];
}

export interface ReadablePage {
  title: string;
  description?: string;
  /** Site name from the page (og:site_name or application-name), if it gives one. */
  publisher?: string;
  /** Publication date YYYY-MM-DD from the page's metadata, if it gives one. */
  published?: string;
  /** The visible text, with headings as "# ..." and list items as "- ...". */
  text: string;
}

const DROPPED = [
  "script",
  "style",
  "noscript",
  "template",
  "svg",
  "canvas",
  "iframe",
  "object",
  "select",
  "head",
];
const BLOCK =
  /<\/?(p|div|section|article|main|aside|header|footer|nav|ul|ol|table|tr|blockquote|pre|form|fieldset|figure|figcaption|dl|dt|dd|details|summary|address|hr)\b[^>]*>/gi;

const stripTags = (html: string) => html.replace(/<[^>]*>/g, " ");

/** Turns an HTML page into readable text plus its title and publication metadata. */
export function extractReadable(html: string): ReadablePage {
  const metas = tagAttributes(html, "meta");
  const rawTitle = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  const title =
    decodeEntities(stripTags(rawTitle ?? ""))
      .replace(/\s+/g, " ")
      .trim() ||
    metaContent(metas, "og:title") ||
    "";
  const jsonLdDate = /"datePublished"\s*:\s*"([^"]+)"/.exec(html)?.[1];
  const published = toDate(
    metaContent(metas, "article:published_time", "datePublished", "date", "dc.date", "pubdate") ??
      jsonLdDate,
  );

  let body = html.replace(/<!--[\s\S]*?-->/g, " ");
  for (const tag of DROPPED) {
    body = body.replace(new RegExp(`<${tag}\\b[\\s\\S]*?</${tag}\\s*>`, "gi"), " ");
  }
  body = body
    .replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1\s*>/gi, (_, level: string, inner: string) => {
      const text = stripTags(inner).replace(/\s+/g, " ").trim();
      return text ? `\n\n${"#".repeat(Number(level))} ${text}\n\n` : "\n";
    })
    .replace(/<li\b[^>]*>/gi, "\n- ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(td|th)\b[^>]*>/gi, " ")
    .replace(BLOCK, "\n");
  const text = decodeEntities(stripTags(body))
    .split("\n")
    .map((line) => line.replace(/[ \t\u00a0]+/g, " ").trim())
    .filter((line, i, lines) => line !== "-" && (line !== "" || lines[i - 1] !== ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return {
    title,
    description: metaContent(metas, "description", "og:description"),
    publisher: metaContent(metas, "og:site_name", "application-name"),
    published,
    text,
  };
}

/**
 * Paths that are clearly sign-in pages, for example /login or /users/sign_in. Words like "sso" or
 * "auth" are left out on purpose: docs pages about those features are public.
 */
export function isLoginPath(url: URL): boolean {
  return /(^|\/)(log-?in|sign-?in|sign_in)(\/|$|\.)/i.test(url.pathname);
}

/**
 * True when a page is mostly a login form: it has a password field and little else to read.
 * A long page with a small login box (for example a docs page with a header widget) is not.
 */
export function looksLikeLogin(html: string, text: string): boolean {
  const hasPassword = tagAttributes(html, "input").some(
    (a) => a.type?.toLowerCase() === "password",
  );
  return hasPassword && text.length < 1500;
}
