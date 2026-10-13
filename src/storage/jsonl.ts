import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";

/**
 * Append-only JSON Lines files. There is deliberately no function here that rewrites
 * or truncates one: lines are only ever added at the end (SPEC 2.4).
 */
export async function appendJsonLine(path: string, value: unknown): Promise<void> {
  await appendText(path, JSON.stringify(value) + "\n");
}

/** Adds text at the end of a file, creating it (and its folder) if needed. Never touches what is already there. */
export async function appendText(path: string, text: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, text, { encoding: "utf8", flag: "a" });
}

/** Reads every line of a JSON Lines file; a missing file reads as no lines. */
export async function readJsonLines(path: string): Promise<unknown[]> {
  const text = await readTextIfExists(path);
  if (text === null) return [];
  return text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as unknown);
}

export async function readTextIfExists(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/** Raw bytes of a file, or null when it does not exist (for hashing saved sources). */
export async function readBytesIfExists(path: string): Promise<Uint8Array | null> {
  try {
    return await readFile(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
