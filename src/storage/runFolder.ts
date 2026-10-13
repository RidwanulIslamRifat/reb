import { mkdir, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { RebError } from "../domain/errors.js";
import { readTextIfExists } from "./jsonl.js";

/** Folders inside every run (SPEC 5). Files are created when first needed. */
export const RUN_SUBFOLDERS = [
  "plan",
  "plan/history",
  "kb",
  "kb/nodes",
  "evidence",
  "evidence/inbox",
  "notes",
  "reports",
  "logs",
  "logs/roles",
  "logs/audits",
] as const;

/** Runs root: REB_HOME if set, otherwise ~/reb/runs (SPEC 5). */
export function runsRoot(env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv = env.REB_HOME?.trim();
  return resolve(fromEnv ? fromEnv : join(homedir(), "reb", "runs"));
}

export function runPaths(dir: string) {
  return {
    dir,
    brief: join(dir, "brief.md"),
    plan: join(dir, "plan", "plan.json"),
    history: join(dir, "plan", "history"),
    planVersion: (version: number) => join(dir, "plan", "history", `plan-v${version}.json`),
    events: join(dir, "logs", "events.jsonl"),
    decisions: join(dir, "logs", "decisions.md"),
    role: (role: string) => join(dir, "logs", "roles", `${role}.md`),
  };
}
export type RunPaths = ReturnType<typeof runPaths>;

function notWritable(root: string, error: unknown): RebError {
  const code = (error as NodeJS.ErrnoException).code ?? "unknown error";
  return new RebError(
    `reb cannot write to the runs folder ${root} (${code}).`,
    "Set REB_HOME to a folder you can write to, for example: REB_HOME=~/reb/runs",
  );
}

/**
 * Creates a new run folder named `baseSlug`, or `baseSlug-2`, `-3` ... when that name is taken
 * (ROADMAP decision 20). Creating the folder itself is the claim, so two calls never share one.
 */
export async function createRunFolder(
  root: string,
  baseSlug: string,
): Promise<{ slug: string; paths: RunPaths }> {
  try {
    await mkdir(root, { recursive: true });
  } catch (error) {
    throw notWritable(root, error);
  }
  for (let n = 1; ; n++) {
    const slug = n === 1 ? baseSlug : `${baseSlug}-${n}`;
    const dir = join(root, slug);
    try {
      await mkdir(dir);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") continue;
      throw notWritable(root, error);
    }
    for (const sub of RUN_SUBFOLDERS) await mkdir(join(dir, sub), { recursive: true });
    return { slug, paths: runPaths(dir) };
  }
}

export interface RunFolderInfo {
  slug: string;
  paths: RunPaths;
  /** Last time the run's brief, plan or event log changed. */
  changedAt: Date;
}

/** Every run folder under the root (a folder with a brief.md), most recently changed first. */
export async function listRunFolders(root: string): Promise<RunFolderInfo[]> {
  let names: string[];
  try {
    names = (await readdir(root, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const runs: RunFolderInfo[] = [];
  for (const slug of names) {
    const paths = runPaths(join(root, slug));
    const times = await Promise.all(
      [paths.brief, paths.plan, paths.events].map((p) =>
        stat(p).then(
          (s) => s.mtimeMs,
          () => 0,
        ),
      ),
    );
    if (times[0] === 0) continue;
    runs.push({ slug, paths, changedAt: new Date(Math.max(...times)) });
  }
  return runs.sort(
    (a, b) => b.changedAt.getTime() - a.changedAt.getTime() || (a.slug < b.slug ? 1 : -1),
  );
}

/** Finds an existing run by slug, with a clear error when it is missing. */
export async function openRunFolder(root: string, slug: string): Promise<RunPaths> {
  const paths = runPaths(join(root, slug));
  if (slug.includes("/") || slug.includes("\\") || (await readTextIfExists(paths.brief)) === null) {
    const known = (await listRunFolders(root)).map((r) => r.slug);
    throw new RebError(
      `There is no run called "${slug}" in ${root}.`,
      known.length
        ? `Use one of: ${known.join(", ")}. "reb list" shows them all.`
        : 'Create one first with "reb new <domain>".',
    );
  }
  return paths;
}
