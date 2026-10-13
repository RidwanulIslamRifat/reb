import { mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { writeFileAtomic } from "./atomicWrite.js";
import { readTextIfExists } from "./jsonl.js";
import { withFileLock } from "./lock.js";
import type { RunPaths } from "./runFolder.js";

/** Every kb/nodes/*.md file as { file, text }, sorted by file name. */
export async function readNodeFiles(
  paths: RunPaths,
): Promise<Array<{ file: string; text: string }>> {
  let names: string[];
  try {
    names = (await readdir(paths.nodes)).filter((n) => n.endsWith(".md")).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const files = await Promise.all(
    names.map(async (file) => ({ file, text: await readTextIfExists(join(paths.nodes, file)) })),
  );
  return files.filter((f): f is { file: string; text: string } => f.text !== null);
}

/** Raw text of kb/nodes/<id>.md, or null when there is no such node file. */
export async function readNodeText(paths: RunPaths, id: string): Promise<string | null> {
  return readTextIfExists(paths.node(id));
}

export async function writeNodeText(paths: RunPaths, id: string, text: string): Promise<void> {
  await mkdir(paths.nodes, { recursive: true });
  await writeFileAtomic(paths.node(id), text);
}

/** Runs a read-change-write of node files under the knowledge-graph lock. */
export async function withGraphLock<T>(paths: RunPaths, work: () => Promise<T>): Promise<T> {
  await mkdir(paths.nodes, { recursive: true });
  return withFileLock(paths.graphLock, work);
}

/** Writes kb/graph.json and kb/stats.json (generated files, replaced each time). */
export async function writeGraphFiles(
  paths: RunPaths,
  graph: unknown,
  stats: unknown,
): Promise<void> {
  await mkdir(join(paths.dir, "kb"), { recursive: true });
  await writeFileAtomic(paths.graph, JSON.stringify(graph, null, 2) + "\n");
  await writeFileAtomic(paths.stats, JSON.stringify(stats, null, 2) + "\n");
}
