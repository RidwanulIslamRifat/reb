import { spawn } from "node:child_process";
import type { DashboardHandle, DashboardLauncher } from "../workflows/context.js";
import type { ViewScope } from "../workflows/dashboard.js";
import { startDashboardServer } from "./server.js";

/** The dashboard running in this process, if any. One process serves one dashboard. */
let running: { root: string; scope: ViewScope; handle: Promise<DashboardHandle> } | null = null;

/**
 * Starts the dashboard, or reuses the one this process already runs (so asking the agent twice
 * does not start two servers). A run given here is added to what the dashboard shows.
 */
export const launchDashboard: DashboardLauncher = async ({ root, run, port }) => {
  if (running && running.root === root) {
    if (run && !running.scope.pinned.some((r) => r.slug === run.slug))
      running.scope.pinned.push(run);
    return running.handle;
  }
  const scope: ViewScope = { root, pinned: run ? [run] : [] };
  const handle = startDashboardServer({ scope, port }).then((started) => ({
    url: started.url,
    close: async () => {
      running = null;
      await started.close();
    },
  }));
  running = { root, scope, handle };
  return handle.catch((error: unknown) => {
    running = null;
    throw error;
  });
};

/** Opens an address in the person's default browser. Never prints anything (stdout may be MCP). */
export function openInBrowser(
  url: string,
  platform: NodeJS.Platform = process.platform,
): Promise<void> {
  const [command, args] =
    platform === "darwin"
      ? ["open", [url]]
      : platform === "win32"
        ? ["cmd", ["/c", "start", '""', url]]
        : ["xdg-open", [url]];
  return new Promise((resolve, reject) => {
    const child = spawn(command, args as string[], { stdio: "ignore", detached: true });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}
