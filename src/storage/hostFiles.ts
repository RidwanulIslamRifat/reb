import { constants } from "node:fs";
import { access, copyFile, mkdir, rm, stat, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { delimiter, dirname, join } from "node:path";
import { writeFileAtomic } from "./atomicWrite.js";

/**
 * Files outside run folders that setup and doctor touch: agent config files, installed
 * handbook copies, backups. Writes are atomic and create missing folders.
 */
export async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export async function writeHostFile(path: string, text: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFileAtomic(path, text);
}

/**
 * Copies a file to `backup` (creating its folder). Never overwrites an existing backup:
 * if the name is taken, `-2`, `-3` ... is added. Returns the backup path used.
 */
export async function backupFile(path: string, backup: string): Promise<string> {
  await mkdir(dirname(backup), { recursive: true });
  for (let n = 1; ; n++) {
    const target = n === 1 ? backup : `${backup}-${n}`;
    try {
      await copyFile(path, target, constants.COPYFILE_EXCL);
      return target;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  }
}

/** Can reb create and delete a file in `dir`? Creates `dir` if missing. Returns the error code or null. */
export async function checkWritable(dir: string): Promise<string | null> {
  const probe = join(dir, `.reb-doctor-${randomBytes(4).toString("hex")}`);
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(probe, "ok", { flag: "wx" });
    await rm(probe);
    return null;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code ?? "unknown error";
  }
}

/** Full path of an executable found on PATH, or null. */
export async function findOnPath(
  name: string,
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
): Promise<string | null> {
  const exts = platform === "win32" ? (env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";") : [""];
  for (const dir of (env.PATH ?? env.Path ?? "").split(delimiter).filter(Boolean)) {
    for (const ext of exts) {
      const candidate = join(dir, name + ext.toLowerCase());
      try {
        await access(candidate, platform === "win32" ? constants.F_OK : constants.X_OK);
        return candidate;
      } catch {
        // not here
      }
    }
  }
  return null;
}
