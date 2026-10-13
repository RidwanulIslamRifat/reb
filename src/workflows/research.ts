import { createRequire } from "node:module";
import { RebError } from "../domain/errors.js";
import type { SourceRecord } from "../domain/evidence.js";
import { summarizeHar } from "../sources/har.js";
import {
  checkPublicUrl,
  decodeBody,
  extractReadable,
  isLoginPath,
  isReadableType,
  looksLikeLogin,
  type ReadablePage,
} from "../sources/publicPage.js";
import { isAllowed, parseRobots, type Robots } from "../sources/robots.js";
import { detectTech } from "../sources/techStack.js";
import { createWeb, type Fetcher, type Web, type WebResponse } from "../sources/web.js";
import { readTextIfExists } from "../storage/jsonl.js";
import { readLedger } from "../storage/ledger.js";
import type { Context } from "./context.js";
import { appendSource } from "./evidence.js";
import { argsOf, logged, type RunRef } from "./logging.js";
import { resolveRun, type ResolvedRun } from "./runs.js";

/** The product token reb uses in its user agent and when it reads robots.txt. */
export const ROBOTS_AGENT = "reb";
/** Politeness limits (ROADMAP decision 12). */
export const MIN_GAP_MS = 1000;
export const PAGE_WARNING_AT = 100;
const MAX_REDIRECTS = 5;
const DEFAULT_MAX_CHARS = 40_000;
const LITTLE_TEXT = 500;

const require = createRequire(import.meta.url);
const { version } = require("../../package.json") as { version: string };

let realWeb: Web | undefined;
function webOf(ctx: Context): Web {
  return (
    ctx.web ??
    (realWeb ??= createWeb(
      `${ROBOTS_AGENT}/${version} (+https://github.com/RidwanulIslamRifat/reb)`,
    ))
  );
}

/** A network error in words, for example "fetch failed (ENOTFOUND)". */
function reason(error: unknown): string {
  const { message, cause } = error as Error & { cause?: { code?: string } };
  return cause?.code ? `${message} (${cause.code})` : message;
}

async function get(web: Web, url: URL): Promise<WebResponse> {
  try {
    return await web.fetch(url.href);
  } catch (error) {
    throw new RebError(
      `${url.host} could not be reached: ${reason(error)}.`,
      "Check the address and your internet connection, then try again.",
    );
  }
}

function redirectTarget(response: WebResponse, from: URL): URL | null {
  const location = response.headers.location;
  if (response.status < 300 || response.status > 399 || !location) return null;
  return checkPublicUrl(new URL(location, from).href);
}

// robots.txt answers are kept for 10 minutes per site, separately for each fetcher.
const ROBOTS_TTL_MS = 10 * 60 * 1000;
const robotsCache = new WeakMap<Fetcher, Map<string, { robots: Robots; at: number }>>();

async function loadRobots(web: Web, origin: string): Promise<Robots> {
  const cache = robotsCache.get(web.fetch) ?? new Map();
  robotsCache.set(web.fetch, cache);
  const hit = cache.get(origin);
  if (hit && Date.now() - hit.at < ROBOTS_TTL_MS) return hit.robots;

  const host = new URL(origin).host;
  const unreadable = (why: string) =>
    new RebError(
      `The robots.txt of ${host} cannot be read (${why}), so reb does not read pages there.`,
      "Try again later. If it keeps failing, ask the human to open the page themselves and save a copy; " +
        'record it with "reb evidence source <url> --file <saved page>".',
    );
  let url = new URL("/robots.txt", origin);
  let response: WebResponse;
  for (let hop = 0; ; hop++) {
    try {
      response = await web.fetch(url.href);
    } catch (error) {
      throw unreadable(reason(error));
    }
    const next = redirectTarget(response, url);
    if (!next) break;
    if (hop >= MAX_REDIRECTS) throw unreadable("too many redirects");
    url = next;
  }
  let robots: Robots;
  if (response.status >= 200 && response.status < 300) {
    robots = parseRobots(new TextDecoder().decode(response.body));
  } else if (response.status === 404 || response.status === 410) {
    robots = parseRobots(""); // No robots.txt: everything is allowed.
  } else {
    throw unreadable(`the site answered ${response.status}`);
  }
  cache.set(origin, { robots, at: Date.now() });
  return robots;
}

async function checkRobots(web: Web, url: URL): Promise<void> {
  const robots = await loadRobots(web, url.origin);
  if (!isAllowed(robots, ROBOTS_AGENT, url.pathname + url.search)) {
    throw new RebError(
      `robots.txt disallows this page: ${url.host} asks automated readers not to open ${url.pathname}.`,
      "Do not open it with another tool either. Use another public page (docs, pricing, changelog), " +
        "or ask the human to look at it and share notes or a screenshot.",
    );
  }
}

const needsLogin = (url: URL) =>
  new RebError(
    `This page needs a login (${url.href}). reb never logs in (SPEC 2.3).`,
    "Use public pages only. For what is behind the login, ask the human to look in their own session " +
      "and share notes or screenshots (the walkthrough_coach role makes the checklist).",
  );

function checkStatus(response: WebResponse, url: URL): void {
  const { status } = response;
  if (status >= 200 && status < 300) return;
  if (status === 401 || status === 407) throw needsLogin(url);
  if (status === 403) {
    throw new RebError(
      `The site refused to show this page (403 Forbidden): ${url.href}. It may need a login or block automated readers.`,
      "Do not try to get around it. Use another public page, or ask the human to look at it.",
    );
  }
  if (status === 404 || status === 410) {
    throw new RebError(`There is no page at ${url.href} (${status}).`, "Check the address.");
  }
  if (status === 429) {
    throw new RebError(
      `${url.host} asks reb to slow down (429 Too Many Requests).`,
      "Wait a few minutes before reading more pages from this site.",
    );
  }
  if (status >= 300 && status < 400) {
    throw new RebError(
      `${url.href} redirects too many times.`,
      "Give the final address of the page.",
    );
  }
  throw new RebError(
    `${url.host} answered with error ${status} for ${url.href}.`,
    "Try again later.",
  );
}

/** Waits so that two page reads from the same site are at least MIN_GAP_MS apart. */
async function politeWait(ctx: Context, web: Web, sources: SourceRecord[], host: string) {
  const last = sources
    .filter((s) => URL.canParse(s.url) && new URL(s.url).host === host)
    .reduce((max, s) => Math.max(max, Date.parse(s.read_at)), -Infinity);
  const wait = last + MIN_GAP_MS - ctx.now().getTime();
  if (wait > 0) await web.sleep(Math.min(wait, MIN_GAP_MS));
}

interface PageRead {
  url: URL;
  response: WebResponse;
  html: string;
  page: ReadablePage;
}

/**
 * Reads one public page: checks the address, obeys robots.txt for every redirect hop, never
 * sends cookies or credentials, and refuses login pages, errors and files that are not pages.
 */
async function readPage(ctx: Context, run: RunRef, rawUrl: string) {
  const web = webOf(ctx);
  const records = await readLedger(run.paths);
  const sources = records.filter((r): r is SourceRecord => r.kind === "source");
  let url = checkPublicUrl(rawUrl);
  let response: WebResponse;
  for (let hop = 0; ; hop++) {
    if (isLoginPath(url)) throw needsLogin(url);
    await checkRobots(web, url);
    if (hop === 0) await politeWait(ctx, web, sources, url.host);
    response = await get(web, url);
    const next = redirectTarget(response, url);
    if (!next || hop >= MAX_REDIRECTS) break;
    url = next;
  }
  checkStatus(response, url);
  const type = response.headers["content-type"];
  if (!isReadableType(type)) {
    throw new RebError(
      `${url.href} is not a web page (it is ${type?.split(";")[0]}).`,
      "read_public_page reads HTML and plain text pages only. For a PDF or file, ask the human to save it, " +
        'then record it with "reb evidence source <url> --file <saved file>".',
    );
  }
  const decoded = decodeBody(response.body, type);
  const isHtml = !type?.toLowerCase().startsWith("text/plain");
  const page: ReadablePage = isHtml
    ? extractReadable(decoded)
    : { title: "", text: decoded.trim() };
  if (isHtml && looksLikeLogin(decoded, page.text)) throw needsLogin(url);

  const warnings: string[] = [];
  if (sources.length + 1 >= PAGE_WARNING_AT) {
    warnings.push(
      `This run has ${sources.length + 1} sources. Read only the pages the analysis needs; reb is not for scraping.`,
    );
  }
  const read: PageRead = { url, response, html: isHtml ? decoded : "", page };
  return { read, warnings };
}

function limitationsOf(read: PageRead): string[] {
  const out = [
    "Public page as served to a plain reader without JavaScript; content drawn by scripts is missing.",
  ];
  if (read.page.text.length < LITTLE_TEXT) {
    out.push(
      `Little text came back (${read.page.text.length} characters): the page probably draws its content ` +
        "with JavaScript. Ask the human for a screenshot of it.",
    );
  }
  if (read.response.truncated)
    out.push("The page was longer than 2 MB; only the first 2 MB were read.");
  if (!read.page.published)
    out.push("The page shows no publication date; note the read date for any number.");
  return out;
}

async function recordPage(ctx: Context, run: RunRef, read: PageRead) {
  const { url, page, response } = read;
  return appendSource(ctx, run, {
    url: url.href,
    title: page.title || `${url.host}${url.pathname}`,
    publisher: page.publisher ?? url.hostname.replace(/^www\./, ""),
    published: page.published,
    content: response.body,
  });
}

/**
 * read_public_page: reads one public URL and returns its readable text, and records it as a
 * source (S-NNN) with the sha256 of what was read and the read time (SPEC 9, ROADMAP decision 12).
 */
export async function readPublicPage(
  ctx: Context,
  input: { run?: string; url: string; max_chars?: number },
) {
  const run = await resolveRun(ctx, input.run);
  return logged(ctx, "read_public_page", run, argsOf(input), async () => {
    const { read, warnings } = await readPage(ctx, run, input.url);
    const source = await recordPage(ctx, run, read);
    const max = input.max_chars ?? DEFAULT_MAX_CHARS;
    const text = read.page.text;
    return {
      ...run,
      source,
      title: read.page.title,
      description: read.page.description,
      text: text.length > max ? text.slice(0, max) : text,
      characters: text.length,
      text_cut: text.length > max,
      limitations: limitationsOf(read),
      warnings,
    };
  });
}

/**
 * detect_tech_stack: reads one public page (same rules as read_public_page), records it as a
 * source, and lists the tools its HTML, response headers and cookie names give away.
 */
export async function detectTechStack(ctx: Context, input: { run?: string; url: string }) {
  const run = await resolveRun(ctx, input.run);
  return logged(ctx, "detect_tech_stack", run, argsOf(input), async () => {
    const { read, warnings } = await readPage(ctx, run, input.url);
    const source = await recordPage(ctx, run, read);
    const technologies = detectTech({
      html: read.html,
      headers: read.response.headers,
      cookieNames: read.response.cookieNames,
    });
    return {
      ...run,
      source,
      technologies,
      limitations: [
        "Only what this one public page shows; tools used on servers or behind the login are not visible.",
        "documented means the site names the tool (a header or generator tag); inferred means a clue in the HTML.",
      ],
      warnings,
    };
  });
}

/**
 * summarize_har: summarises a HAR file the human saved: endpoint patterns, polling and streaming.
 * Cookies, auth headers, tokens, bodies and query values are dropped before anything is kept;
 * nothing from the HAR is written to disk except this call's event line, which names only the file.
 * Works without a run; when there is one, the call is logged there.
 */
export async function summarizeHarFile(ctx: Context, input: { run?: string; file: string }) {
  const work = async () => {
    const text = await readTextIfExists(input.file);
    if (text === null) {
      throw new RebError(`There is no file ${input.file}.`, "Check the path to the .har file.");
    }
    return summarizeHar(text);
  };
  let run: ResolvedRun | null = null;
  try {
    run = await resolveRun(ctx, input.run);
  } catch (error) {
    if (input.run) throw error;
  }
  if (!run)
    return { summary: await work(), note: "There is no run yet, so this call was not logged." };
  return logged(ctx, "summarize_har", run, argsOf(input), async () => ({
    ...run,
    summary: await work(),
  }));
}
