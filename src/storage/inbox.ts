import { mkdir, readdir, rm } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { writeFileAtomic } from "./atomicWrite.js";
import { readBytesIfExists } from "./jsonl.js";
import type { RunPaths } from "./runFolder.js";

/** Names of the folders in evidence/inbox/, sorted. A missing inbox has none. */
export async function listInboxFolders(paths: RunPaths): Promise<string[]> {
  try {
    return (await readdir(paths.inbox, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

/** File names directly inside one inbox session folder, sorted; null when the folder is missing. */
export async function listInboxFiles(paths: RunPaths, session: string): Promise<string[] | null> {
  try {
    return (await readdir(paths.inboxSession(session), { withFileTypes: true }))
      .filter((d) => d.isFile())
      .map((d) => d.name)
      .sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function readInboxFile(
  paths: RunPaths,
  session: string,
  name: string,
): Promise<Uint8Array | null> {
  return readBytesIfExists(join(paths.inboxSession(session), name));
}

export async function ensureInboxSession(paths: RunPaths, session: string): Promise<void> {
  await mkdir(paths.inboxSession(session), { recursive: true });
}

/** Deletes one raw file from an inbox session (used for raw HAR files, ROADMAP decision 10). */
export async function deleteInboxFile(paths: RunPaths, session: string, name: string) {
  await rm(join(paths.inboxSession(session), name), { force: true });
}

/** A path inside the run folder with forward slashes, for evidence sources and replies. */
export function runRelative(paths: RunPaths, absolute: string): string {
  return relative(paths.dir, absolute).split(sep).join("/");
}

/** Writes a file reb generated inside the run folder (notes, imports, REA results, captured screenshots), replacing it. */
export async function writeRunFile(absolute: string, text: string | Uint8Array): Promise<void> {
  await mkdir(dirname(absolute), { recursive: true });
  await writeFileAtomic(absolute, text);
}

/**
 * The capture maps reb wrote (evidence/imports/<session>/capture.json), as text, oldest session
 * first. Sessions without one are left out.
 */
export async function readCaptureMaps(
  paths: RunPaths,
): Promise<Array<{ session: string; text: string }>> {
  const root = dirname(paths.imports("x"));
  let sessions: string[];
  try {
    sessions = (await readdir(root, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const maps: Array<{ session: string; text: string }> = [];
  for (const session of sessions) {
    const bytes = await readBytesIfExists(join(paths.imports(session), "capture.json"));
    if (bytes) maps.push({ session, text: Buffer.from(bytes).toString("utf8") });
  }
  return maps;
}
