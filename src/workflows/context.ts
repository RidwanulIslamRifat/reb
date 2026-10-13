import type { Via } from "../domain/event.js";
import type { Web } from "../sources/web.js";
import { runsRoot } from "../storage/runFolder.js";

/** What every workflow needs to know about its caller. Tests pass their own. */
export interface Context {
  /** Folder that holds the run folders. */
  root: string;
  /** Which adapter made the call; written to every event. */
  via: Via;
  now: () => Date;
  /** How research tools reach the web; the real web when left out. Tests pass a fake. */
  web?: Web;
}

export function createContext(via: Via, env: NodeJS.ProcessEnv = process.env): Context {
  return { root: runsRoot(env), via, now: () => new Date() };
}
