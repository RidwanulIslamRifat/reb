import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { withFileLock } from "../../src/storage/lock.js";
import { tempDir } from "../helpers.js";

describe("withFileLock", () => {
  it("lets only one caller work at a time and removes the lock afterwards", async () => {
    const dir = await tempDir();
    const lock = join(dir, ".test.lock");
    let inside = 0;
    let most = 0;
    await Promise.all(
      Array.from({ length: 10 }, () =>
        withFileLock(lock, async () => {
          most = Math.max(most, ++inside);
          await new Promise((r) => setTimeout(r, 2));
          inside--;
        }),
      ),
    );
    expect(most).toBe(1);
    expect(await readdir(dir)).toEqual([]);
  });

  it("releases the lock when the work fails", async () => {
    const lock = join(await tempDir(), ".test.lock");
    await expect(withFileLock(lock, () => Promise.reject(new Error("boom")))).rejects.toThrow(
      "boom",
    );
    expect(await withFileLock(lock, async () => "free")).toBe("free");
  });
});
