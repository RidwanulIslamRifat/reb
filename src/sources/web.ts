/**
 * Plain HTTP access for reading public pages (ROADMAP decision 11: no headless browser).
 * One request per call, no cookies kept, redirects returned rather than followed,
 * so the caller can check each hop against robots.txt.
 */

/** What reb keeps of an HTTP response. Cookie values are never kept, only cookie names. */
export interface WebResponse {
  url: string;
  status: number;
  /** Header names in lower case. */
  headers: Record<string, string>;
  /** Names of cookies the server tried to set (values are dropped on arrival). */
  cookieNames: string[];
  body: Uint8Array;
  /** True when the body was longer than the size limit and was cut. */
  truncated: boolean;
}

export type Fetcher = (url: string) => Promise<WebResponse>;

/** How workflows reach the web. Tests pass a fake that serves saved fixture files. */
export interface Web {
  fetch: Fetcher;
  sleep: (ms: number) => Promise<void>;
}

/** Largest body reb reads from one page. */
export const MAX_BODY_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 15_000;

async function readCapped(response: Response): Promise<{ body: Uint8Array; truncated: boolean }> {
  if (!response.body) return { body: new Uint8Array(), truncated: false };
  const chunks: Uint8Array[] = [];
  let size = 0;
  let truncated = false;
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
    if (size > MAX_BODY_BYTES) {
      truncated = true;
      await reader.cancel();
      break;
    }
  }
  const body = new Uint8Array(Math.min(size, MAX_BODY_BYTES));
  let offset = 0;
  for (const chunk of chunks) {
    const part = chunk.subarray(0, body.length - offset);
    body.set(part, offset);
    offset += part.length;
  }
  return { body, truncated };
}

/** The real web, with an honest user agent such as "reb/1.0.0" (ROADMAP decision 12). */
export function createWeb(userAgent: string): Web {
  return {
    sleep: (ms) => new Promise((done) => setTimeout(done, ms)),
    fetch: async (url) => {
      const response = await fetch(url, {
        redirect: "manual",
        credentials: "omit",
        headers: {
          "user-agent": userAgent,
          accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5",
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const headers: Record<string, string> = {};
      response.headers.forEach((value, name) => {
        if (name !== "set-cookie") headers[name.toLowerCase()] = value;
      });
      const cookieNames = response.headers
        .getSetCookie()
        .map((cookie) => cookie.split("=")[0]!.trim())
        .filter(Boolean);
      return {
        url,
        status: response.status,
        headers,
        cookieNames,
        ...(await readCapped(response)),
      };
    },
  };
}
