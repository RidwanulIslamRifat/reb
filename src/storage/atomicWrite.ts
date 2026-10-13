import { randomBytes } from "node:crypto";
import { open, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

/**
 * Writes a whole file safely: first to a temporary file next to it, then renames it into place.
 * A crash leaves either the old file or the new one, never half a file.
 */
export async function writeFileAtomic(path: string, data: string | Uint8Array): Promise<void> {
  const temp = join(dirname(path), `.${basename(path)}.${randomBytes(6).toString("hex")}.tmp`);
  try {
    const handle = await open(temp, "wx");
    try {
      await handle.writeFile(data, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temp, path);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
}

/** Writes a file that must not exist yet. Fails with code EEXIST instead of overwriting. */
export async function writeFileNew(path: string, data: string): Promise<void> {
  await writeFile(path, data, { encoding: "utf8", flag: "wx" });
}
