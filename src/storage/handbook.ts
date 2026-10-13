import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { readTextIfExists } from "./jsonl.js";

/**
 * The handbook/ folder shipped with reb. This file is src/storage/handbook.ts in the repo and
 * dist/storage/handbook.js in the package: both are two folders below the package root.
 */
export const HANDBOOK_DIR = fileURLToPath(new URL("../../handbook/", import.meta.url));

/** Files installed into agents: SKILL.md, roles/*.md and references/*.md (not README.md). */
export async function listHandbookFiles(dir = HANDBOOK_DIR): Promise<string[]> {
  const inFolder = async (sub: string) =>
    (await readdir(join(dir, sub)))
      .filter((n) => n.endsWith(".md"))
      .sort()
      .map((n) => `${sub}/${n}`);
  return ["SKILL.md", ...(await inFolder("roles")), ...(await inFolder("references"))];
}

/** Text of one handbook file (path relative to handbook/), or null when missing. */
export async function readHandbookFile(
  relative: string,
  dir = HANDBOOK_DIR,
): Promise<string | null> {
  return readTextIfExists(join(dir, ...relative.split("/")));
}
