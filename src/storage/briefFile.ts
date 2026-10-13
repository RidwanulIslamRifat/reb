import { readTextIfExists } from "./jsonl.js";
import { writeFileAtomic } from "./atomicWrite.js";
import type { RunPaths } from "./runFolder.js";

export async function readBriefText(paths: RunPaths): Promise<string | null> {
  return readTextIfExists(paths.brief);
}

export async function writeBriefText(paths: RunPaths, text: string): Promise<void> {
  await writeFileAtomic(paths.brief, text);
}
