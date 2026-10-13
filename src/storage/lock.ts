import { open, rm, stat } from "node:fs/promises";
import { RebError } from "../domain/errors.js";

const RETRY_MS = 15;
const WAIT_MS = 10_000;
/** A lock older than this was left by a crashed process and may be taken over. */
const STALE_MS = 30_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Runs `work` while holding a short lock on `lockPath` (ROADMAP decision 6).
 * Creating the lock file is the claim, so two callers (even in different processes)
 * never hold it at the same time. The lock file is removed afterwards.
 */
export async function withFileLock<T>(lockPath: string, work: () => Promise<T>): Promise<T> {
  const started = Date.now();
  for (;;) {
    try {
      const handle = await open(lockPath, "wx");
      await handle.close();
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const age = await stat(lockPath).then(
        (s) => Date.now() - s.mtimeMs,
        () => 0,
      );
      if (age > STALE_MS) {
        await rm(lockPath, { force: true });
        continue;
      }
      if (Date.now() - started > WAIT_MS) {
        throw new RebError(
          `Another reb call is still writing (lock file ${lockPath}).`,
          "Wait a moment and try again. If no reb call is running, delete that lock file.",
        );
      }
      await sleep(RETRY_MS);
    }
  }
  try {
    return await work();
  } finally {
    await rm(lockPath, { force: true });
  }
}
