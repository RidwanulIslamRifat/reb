import type { Via } from "../domain/event.js";
import type { Web } from "../sources/web.js";
import { runsRoot, type RunPaths } from "../storage/runFolder.js";

/** A running dashboard: its address and how to stop it. */
export interface DashboardHandle {
  url: string;
  close: () => Promise<void>;
}

/**
 * Starts (or reuses) the local dashboard server. The dashboard layer provides it; the entry point
 * passes it in, so the CLI and MCP adapters never import the dashboard directly (SPEC 4).
 */
export type DashboardLauncher = (options: {
  root: string;
  /** A run to show even when it lives outside the runs root (for example a fixture folder). */
  run?: { slug: string; paths: RunPaths };
  port?: number;
}) => Promise<DashboardHandle>;

/** What every workflow needs to know about its caller. Tests pass their own. */
export interface Context {
  /** Folder that holds the run folders. */
  root: string;
  /** Which adapter made the call; written to every event. */
  via: Via;
  now: () => Date;
  /** How research tools reach the web; the real web when left out. Tests pass a fake. */
  web?: Web;
  /** Starts the dashboard server; only set where a dashboard can run (the CLI and MCP processes). */
  dashboard?: DashboardLauncher;
  /** Opens an address in the person's browser. */
  openBrowser?: (url: string) => Promise<void>;
}

export function createContext(via: Via, env: NodeJS.ProcessEnv = process.env): Context {
  return { root: runsRoot(env), via, now: () => new Date() };
}
