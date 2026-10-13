import { z } from "zod";
import { RebError } from "../domain/errors.js";

/**
 * Reads a HAR file (a browser's network recording) and keeps only safe facts: endpoint patterns,
 * methods, status codes, content types, timing, polling and streaming. Header values, cookies,
 * request and response bodies and query values are never copied into the summary (SPEC 9).
 */

const HeaderSchema = z.object({ name: z.string(), value: z.string().optional() });

const EntrySchema = z.object({
  startedDateTime: z.string(),
  time: z.number().optional(),
  _resourceType: z.string().optional(),
  _webSocketMessages: z.array(z.unknown()).optional(),
  request: z.object({
    method: z.string(),
    url: z.string(),
    headers: z.array(HeaderSchema).default([]),
    cookies: z.array(z.unknown()).default([]),
    postData: z.unknown().optional(),
  }),
  response: z.object({
    status: z.number(),
    headers: z.array(HeaderSchema).default([]),
    cookies: z.array(z.unknown()).default([]),
    content: z
      .object({ mimeType: z.string().optional(), text: z.string().optional() })
      .partial()
      .default({}),
  }),
});
type Entry = z.infer<typeof EntrySchema>;

const HarSchema = z.object({ log: z.object({ entries: z.array(EntrySchema) }) });

const notHar = (reason: string) =>
  new RebError(
    `This file is not a HAR: ${reason}.`,
    'Save the recording from the browser\'s Network panel with "Save all as HAR", and give that .har file.',
  );

/** Parses HAR text. Throws "file is not a HAR" for anything else. */
export function parseHar(text: string): Entry[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw notHar("it is not JSON");
  }
  const result = HarSchema.safeParse(data);
  if (!result.success) throw notHar('it has no "log.entries" list of requests');
  return result.data.log.entries;
}

/** Header names whose values are credentials. Counted as removed, never copied. */
const AUTH_HEADER =
  /^(authorization|proxy-authorization|x-api-key|api-key|x-auth-token|x-access-token|x-csrf-token|x-xsrf-token|x-amz-security-token)$/i;
const SECRET_PARAM = /token|key|secret|password|passwd|auth|session|sig|signature|code|credential/i;

/** Replaces the parts of a path that change per item (ids, uuids, hashes, tokens, emails) with ":id". */
export function endpointPattern(path: string): string {
  return path
    .split(";")[0]!
    .split("/")
    .map((segment) => {
      if (segment === "") return segment;
      const plain = segment.replace(/\.(json|xml)$/i, "");
      const idLike =
        /^\d+$/.test(plain) ||
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(plain) ||
        /^[0-9a-f]{12,}$/i.test(plain) ||
        (/\d/.test(plain) && plain.length >= 8) ||
        plain.length >= 24 ||
        plain.includes("@") ||
        plain.includes("%");
      return idLike ? ":id" : segment;
    })
    .join("/");
}

const headerValue = (headers: Entry["request"]["headers"], name: string) =>
  headers.find((h) => h.name.toLowerCase() === name)?.value ?? "";

type Streaming = "server-sent events" | "websocket" | "ndjson stream";

function streamingKind(entry: Entry, url: URL): Streaming | undefined {
  const type = (
    entry.response.content.mimeType || headerValue(entry.response.headers, "content-type")
  ).toLowerCase();
  if (
    url.protocol === "ws:" ||
    url.protocol === "wss:" ||
    entry.response.status === 101 ||
    entry._webSocketMessages !== undefined ||
    entry._resourceType === "websocket" ||
    headerValue(entry.request.headers, "upgrade").toLowerCase() === "websocket"
  ) {
    return "websocket";
  }
  if (type.includes("text/event-stream")) return "server-sent events";
  if (type.includes("ndjson") || type.includes("jsonl")) return "ndjson stream";
  return undefined;
}

function kindOf(entry: Entry): "api" | "page" | "asset" {
  const type = (entry.response.content.mimeType ?? "").toLowerCase();
  const resource = entry._resourceType?.toLowerCase();
  if (resource === "document" || type.startsWith("text/html")) return "page";
  if (
    ["script", "stylesheet", "image", "font", "media", "manifest"].includes(resource ?? "") ||
    /^(image|font|audio|video)\/|javascript|text\/css/.test(type)
  ) {
    return "asset";
  }
  return "api";
}

export interface HarEndpoint {
  method: string;
  host: string;
  /** Path with ids replaced by ":id", for example /api/v1/users/:id. */
  pattern: string;
  kind: "api" | "page" | "asset";
  count: number;
  statuses: Record<string, number>;
  content_types: string[];
  /** Query parameter names; values are never kept, and secret-looking ones show [REDACTED]. */
  query_params: string[];
  avg_ms: number;
  /** Set when the same endpoint is called again and again at a steady interval. */
  polling?: { every_seconds: number; calls: number };
  streaming?: Streaming;
}

export interface HarSummary {
  requests: number;
  hosts: string[];
  /** Seconds between the first and the last request. */
  duration_seconds: number;
  endpoints: HarEndpoint[];
  /** What was stripped and never copied anywhere. */
  removed: {
    cookies: number;
    auth_headers: number;
    secret_query_values: number;
    request_bodies: number;
    response_bodies: number;
  };
}

/** Steady repeats: 3+ calls whose gaps are 0.5 s to 10 min and differ by at most 25 % from the average. */
function pollingOf(starts: number[]): HarEndpoint["polling"] {
  if (starts.length < 3) return undefined;
  const sorted = [...starts].sort((a, b) => a - b);
  const gaps = sorted.slice(1).map((t, i) => t - sorted[i]!);
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  if (mean < 500 || mean > 600_000) return undefined;
  if (gaps.some((g) => Math.abs(g - mean) > mean * 0.25)) return undefined;
  return { every_seconds: Math.round(mean / 100) / 10, calls: starts.length };
}

const REDACTED = "[REDACTED]";

/** Groups the requests of a HAR by endpoint pattern and finds polling and streaming. */
export function summarizeHarEntries(entries: Entry[]): HarSummary {
  const removed = {
    cookies: 0,
    auth_headers: 0,
    secret_query_values: 0,
    request_bodies: 0,
    response_bodies: 0,
  };
  const groups = new Map<
    string,
    Omit<HarEndpoint, "avg_ms" | "polling" | "content_types" | "query_params"> & {
      times: number[];
      starts: number[];
      types: Set<string>;
      params: Set<string>;
    }
  >();
  const hosts = new Set<string>();
  let first = Infinity;
  let last = -Infinity;

  for (const entry of entries) {
    const { request, response } = entry;
    removed.cookies += request.cookies.length + response.cookies.length;
    for (const h of [...request.headers, ...response.headers]) {
      const name = h.name.toLowerCase();
      if (AUTH_HEADER.test(name)) removed.auth_headers++;
      else if (name === "cookie" || name === "set-cookie") removed.cookies++;
    }
    if (request.postData !== undefined) removed.request_bodies++;
    if (response.content.text !== undefined) removed.response_bodies++;

    let url: URL;
    try {
      url = new URL(request.url);
    } catch {
      continue;
    }
    hosts.add(url.host);
    const params: string[] = [];
    for (const name of new Set(url.searchParams.keys())) {
      if (SECRET_PARAM.test(name)) {
        removed.secret_query_values++;
        params.push(`${name}=${REDACTED}`);
      } else {
        params.push(name);
      }
    }
    const method = request.method.toUpperCase();
    const pattern = endpointPattern(url.pathname);
    const key = `${method} ${url.host}${pattern}`;
    const group =
      groups.get(key) ??
      groups
        .set(key, {
          method,
          host: url.host,
          pattern,
          kind: kindOf(entry),
          count: 0,
          statuses: {},
          times: [],
          starts: [],
          types: new Set(),
          params: new Set(),
        })
        .get(key)!;
    group.count++;
    group.statuses[String(response.status)] = (group.statuses[String(response.status)] ?? 0) + 1;
    if (entry.time !== undefined && entry.time >= 0) group.times.push(entry.time);
    const start = Date.parse(entry.startedDateTime);
    if (Number.isFinite(start)) {
      group.starts.push(start);
      first = Math.min(first, start);
      last = Math.max(last, start);
    }
    const type = (response.content.mimeType ?? "").split(";")[0]!.trim();
    if (type) group.types.add(type);
    for (const p of params) group.params.add(p);
    const streaming = streamingKind(entry, url);
    if (streaming) group.streaming = streaming;
  }

  const endpoints: HarEndpoint[] = [...groups.values()].map(
    ({ times, starts, types, params, ...rest }) => ({
      ...rest,
      kind: rest.streaming ? "api" : rest.kind,
      content_types: [...types].sort(),
      query_params: [...params].sort(),
      avg_ms: times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0,
      ...(rest.streaming ? {} : { polling: pollingOf(starts) }),
    }),
  );
  const order = { api: 0, page: 1, asset: 2 };
  endpoints.sort(
    (a, b) =>
      order[a.kind] - order[b.kind] || b.count - a.count || a.pattern.localeCompare(b.pattern),
  );

  return {
    requests: entries.length,
    hosts: [...hosts].sort(),
    duration_seconds: Number.isFinite(first) ? Math.round((last - first) / 100) / 10 : 0,
    endpoints,
    removed,
  };
}

/** Parses and summarises HAR text in one step. */
export function summarizeHar(text: string): HarSummary {
  return summarizeHarEntries(parseHar(text));
}
