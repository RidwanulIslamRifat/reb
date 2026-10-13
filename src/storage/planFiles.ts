import { readTextIfExists } from "./jsonl.js";
import { writeFileAtomic, writeFileNew } from "./atomicWrite.js";
import { withFileLock } from "./lock.js";
import { RebError } from "../domain/errors.js";
import type { RunPaths } from "./runFolder.js";

/** Raw text of plan/plan.json, or null when the run has no plan yet. */
export async function readPlanText(paths: RunPaths): Promise<string | null> {
  return readTextIfExists(paths.plan);
}

/**
 * Stores a new plan version: copies the current plan.json unchanged to plan/history/plan-v<N>.json,
 * then replaces plan.json. A history file is only ever created, never overwritten.
 */
export async function writePlanVersion(
  paths: RunPaths,
  previous: { version: number; text: string } | null,
  nextText: string,
): Promise<void> {
  if (previous) {
    const target = paths.planVersion(previous.version);
    try {
      await writeFileNew(target, previous.text);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      throw new RebError(
        `Plan history already has ${target}, so saving would overwrite an earlier version.`,
        "Check plan/plan.json: its version number should be higher than every file in plan/history.",
      );
    }
  }
  await writeFileAtomic(paths.plan, nextText);
}

/** Runs a read-change-write of the plan under the plan lock, so two saves never race. */
export async function withPlanLock<T>(paths: RunPaths, work: () => Promise<T>): Promise<T> {
  return withFileLock(paths.planLock, work);
}
