import { readFile, stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { dirname, extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { RebError } from "../domain/errors.js";
import type { DashboardHandle } from "../workflows/context.js";
import {
  viewEvidence,
  viewFrameworks,
  viewGraph,
  viewLogs,
  viewNode,
  viewPath,
  viewPlan,
  viewPlanDiff,
  viewReport,
  viewReports,
  viewRun,
  viewRuns,
  type ViewScope,
} from "../workflows/dashboard.js";

/** The only address the dashboard listens on: this computer (ROADMAP decision 19). */
export const HOST = "127.0.0.1";
/** Port tried first; the next free one is used when it is taken (ROADMAP decision 19). */
export const DEFAULT_PORT = 4747;
const PORT_TRIES = 20;

/** The built web app (dist/dashboard/public), next to this file once compiled. */
export const DEFAULT_APP_DIR = join(dirname(fileURLToPath(import.meta.url)), "public");

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
  ".woff2": "font/woff2",
};

const SECURITY_HEADERS = {
  "Content-Security-Policy":
    "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; " +
    "connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Cache-Control": "no-store",
};

/** True for addresses of this computer only. */
export function isLoopback(address: string | undefined): boolean {
  if (!address) return false;
  return address === "::1" || /^127\./.test(address) || /^::ffff:127\./i.test(address);
}

/**
 * Blocks pages on other sites from reading the dashboard through a hostname that points at
 * this computer (DNS rebinding): the Host header must name this computer.
 */
function hostAllowed(host: string | undefined, port: number): boolean {
  if (!host) return false;
  return [`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`].includes(host.toLowerCase());
}

function send(res: ServerResponse, status: number, body: string, type: string, head: boolean) {
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    "Content-Type": type,
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(head ? undefined : body);
}

function sendJson(res: ServerResponse, status: number, data: unknown, head: boolean) {
  send(res, status, JSON.stringify(data), "application/json; charset=utf-8", head);
}

const num = (value: string | null) =>
  value !== null && /^\d+$/.test(value) ? Number(value) : undefined;

/** Answers one /api/... address. Returns null when the address is unknown. */
async function api(scope: ViewScope, path: string, query: URLSearchParams): Promise<unknown> {
  const parts = path.split("/").filter(Boolean).map(decodeURIComponent);
  if (parts.length === 1 && parts[0] === "runs") return viewRuns(scope);
  if (parts[0] !== "runs" || !parts[1]) return null;
  const slug = parts[1];
  const [, , page, ...rest] = parts;
  if (page === undefined) return viewRun(scope, slug);
  if (page === "plan" && rest.length === 0) return viewPlan(scope, slug, num(query.get("version")));
  if (page === "plan" && rest[0] === "diff") {
    const from = num(query.get("from"));
    const to = num(query.get("to"));
    if (from === undefined || to === undefined) {
      throw new RebError("Comparing plans needs two version numbers.", "Pick two versions.");
    }
    return viewPlanDiff(scope, slug, from, to);
  }
  if (page === "graph") return viewGraph(scope, slug);
  if (page === "nodes" && rest[0]) return viewNode(scope, slug, rest[0]);
  if (page === "path") {
    return viewPath(scope, slug, query.get("from") ?? "", query.get("to") ?? "");
  }
  if (page === "evidence") return viewEvidence(scope, slug);
  if (page === "frameworks") return viewFrameworks(scope, slug);
  if (page === "logs") return viewLogs(scope, slug);
  if (page === "reports" && rest.length === 0) return viewReports(scope, slug);
  if (page === "reports" && rest[0]) return viewReport(scope, slug, rest[0]);
  return null;
}

/** Serves a file of the built web app; unknown addresses get index.html (the app routes itself). */
async function serveApp(appDir: string, path: string, res: ServerResponse, head: boolean) {
  let decoded: string;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    decoded = "/";
  }
  const safe = normalize(decoded).replace(/^([/\\])+/, "");
  let file = join(appDir, safe);
  if (!file.startsWith(appDir + sep) && file !== appDir) file = join(appDir, "index.html");
  const isFile = await stat(file).then(
    (s) => s.isFile(),
    () => false,
  );
  if (!isFile) file = join(appDir, "index.html");
  let body: Buffer;
  try {
    body = await readFile(file);
  } catch {
    send(
      res,
      500,
      "The dashboard web page is missing. Reinstall reb, or run npm run build in a checkout.",
      "text/plain; charset=utf-8",
      head,
    );
    return;
  }
  res.writeHead(200, {
    ...SECURITY_HEADERS,
    "Content-Type": TYPES[extname(file)] ?? "application/octet-stream",
    "Content-Length": body.length,
  });
  res.end(head ? undefined : body);
}

export interface DashboardServerOptions {
  scope: ViewScope;
  /** Folder with the built web app (default: the one shipped with reb). */
  appDir?: string;
  /** Port to try first; 0 picks any free port. Default 4747. */
  port?: number;
}

/** The request handler, read-only: only GET and HEAD, only from this computer. */
function handler(scope: ViewScope, appDir: string, port: () => number) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    const head = req.method === "HEAD";
    if (!isLoopback(req.socket.remoteAddress)) {
      send(res, 403, "The reb dashboard only answers this computer.", "text/plain", head);
      return;
    }
    if (!hostAllowed(req.headers.host, port())) {
      send(res, 403, "Open the dashboard at its 127.0.0.1 address.", "text/plain", head);
      return;
    }
    if (req.method !== "GET" && !head) {
      res.setHeader("Allow", "GET, HEAD");
      sendJson(
        res,
        405,
        {
          problem: "The dashboard is read-only.",
          fix: "Use your agent or the reb CLI to make changes.",
        },
        false,
      );
      return;
    }
    const url = new URL(req.url ?? "/", `http://${HOST}`);
    if (!url.pathname.startsWith("/api/")) {
      await serveApp(appDir, url.pathname, res, head);
      return;
    }
    try {
      const data = await api(scope, url.pathname.slice("/api".length), url.searchParams);
      if (data === null) {
        sendJson(res, 404, { problem: "Unknown address.", fix: "Go back to the runs list." }, head);
      } else {
        sendJson(res, 200, data, head);
      }
    } catch (error) {
      if (error instanceof RebError) {
        sendJson(res, 404, { problem: error.problem, fix: error.fix }, head);
      } else {
        sendJson(
          res,
          500,
          {
            problem: `reb could not read this part of the run: ${(error as Error).message}`,
            fix: "Check the run folder's files, or run reb doctor.",
          },
          head,
        );
      }
    }
  };
}

function listen(server: Server, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve((server.address() as AddressInfo).port);
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, HOST);
  });
}

/**
 * Starts the dashboard server on 127.0.0.1. Tries the given port (default 4747) and the next ones
 * when taken, then any free port. Returns its address and how to stop it.
 */
export async function startDashboardServer(
  options: DashboardServerOptions,
): Promise<DashboardHandle> {
  const appDir = options.appDir ?? DEFAULT_APP_DIR;
  let port = 0;
  const server = createServer(handler(options.scope, appDir, () => port));
  const first = options.port ?? DEFAULT_PORT;
  const tries = first === 0 ? [0] : [...Array(PORT_TRIES).keys()].map((i) => first + i).concat(0);
  for (const candidate of tries) {
    try {
      port = await listen(server, candidate);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EADDRINUSE") throw error;
    }
  }
  return {
    url: `http://${HOST}:${port}/`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
