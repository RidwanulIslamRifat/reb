import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { readTextIfExists } from "./jsonl.js";
import type { RunPaths } from "./runFolder.js";

/** Read-only file access for the dashboard. Nothing here writes. */

async function namesIn(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir, { withFileTypes: true }))
      .filter((d) => d.isFile())
      .map((d) => d.name)
      .sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

/** Versions kept in plan/history (from their plan-v<N>.json names), lowest first. */
export async function listPlanHistoryVersions(paths: RunPaths): Promise<number[]> {
  return (await namesIn(paths.history))
    .map((n) => /^plan-v(\d+)\.json$/.exec(n)?.[1])
    .filter((n): n is string => n !== undefined)
    .map(Number)
    .sort((a, b) => a - b);
}

export async function readPlanHistoryText(paths: RunPaths, version: number) {
  return readTextIfExists(paths.planVersion(version));
}

export async function readDecisionsText(paths: RunPaths) {
  return readTextIfExists(paths.decisions);
}

/** Roles that have a work log in logs/roles, with each log's text. */
export async function readRoleLogs(
  paths: RunPaths,
): Promise<Array<{ role: string; text: string }>> {
  const dir = join(paths.dir, "logs", "roles");
  const logs = await Promise.all(
    (await namesIn(dir))
      .filter((n) => n.endsWith(".md"))
      .map(async (n) => ({
        role: n.slice(0, -3),
        text: (await readTextIfExists(join(dir, n))) ?? "",
      })),
  );
  return logs;
}

const reportsDir = (paths: RunPaths) => join(paths.dir, "reports");

/** File names in reports/ (Markdown and Word). */
export async function listReportFiles(paths: RunPaths): Promise<string[]> {
  return (await namesIn(reportsDir(paths))).filter((n) => /\.(md|docx|html)$/.test(n));
}

/** Text of reports/<name>; `name` must be a plain file name checked by the caller. */
export async function readReportText(paths: RunPaths, name: string) {
  return readTextIfExists(join(reportsDir(paths), name));
}
