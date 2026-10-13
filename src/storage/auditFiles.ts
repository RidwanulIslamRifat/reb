import { mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { writeFileAtomic, writeFileNew } from "./atomicWrite.js";
import { readTextIfExists } from "./jsonl.js";
import { withFileLock } from "./lock.js";
import type { RunPaths } from "./runFolder.js";

const auditDir = (paths: RunPaths) => join(paths.dir, "logs", "audits");
export const auditMarkdownPath = (paths: RunPaths, n: number) =>
  join(auditDir(paths), `audit-${n}.md`);
export const auditDataPath = (paths: RunPaths, n: number) =>
  join(auditDir(paths), `audit-${n}.json`);

/** Numbers of the audits in logs/audits (from their audit-<N>.json files), lowest first. */
export async function listAuditNumbers(paths: RunPaths): Promise<number[]> {
  let names: string[];
  try {
    names = await readdir(auditDir(paths));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  return names
    .map((n) => /^audit-(\d+)\.json$/.exec(n)?.[1])
    .filter((n): n is string => n !== undefined)
    .map(Number)
    .sort((a, b) => a - b);
}

export async function readAuditData(paths: RunPaths, n: number): Promise<string | null> {
  return readTextIfExists(auditDataPath(paths, n));
}

/**
 * Writes a new audit. The Markdown file is created first and must not exist yet, so an audit
 * number is never reused; fails with code EEXIST when it is taken.
 */
export async function writeNewAudit(
  paths: RunPaths,
  n: number,
  markdown: string,
  data: string,
): Promise<void> {
  await writeFileNew(auditMarkdownPath(paths, n), markdown);
  await writeFileAtomic(auditDataPath(paths, n), data);
}

/** Replaces an audit's files, for example to record which plan version re-planned it. */
export async function rewriteAudit(
  paths: RunPaths,
  n: number,
  markdown: string,
  data: string,
): Promise<void> {
  await writeFileAtomic(auditDataPath(paths, n), data);
  await writeFileAtomic(auditMarkdownPath(paths, n), markdown);
}

/** Runs audit numbering and updates under the audit lock, so two audits never share a number. */
export async function withAuditLock<T>(paths: RunPaths, work: () => Promise<T>): Promise<T> {
  await mkdir(auditDir(paths), { recursive: true });
  return withFileLock(join(auditDir(paths), ".audit.lock"), work);
}
