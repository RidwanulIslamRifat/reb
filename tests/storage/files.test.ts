import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { writeFileAtomic, writeFileNew } from "../../src/storage/atomicWrite.js";
import { appendJsonLine, readJsonLines } from "../../src/storage/jsonl.js";
import { tempDir } from "../helpers.js";

describe("writeFileAtomic", () => {
  it("replaces the file and leaves no temporary file behind", async () => {
    const dir = await tempDir();
    const file = join(dir, "plan.json");
    await writeFile(file, "old");
    await writeFileAtomic(file, "new");
    expect(await readFile(file, "utf8")).toBe("new");
    expect(await readdir(dir)).toEqual(["plan.json"]);
  });
});

describe("writeFileNew", () => {
  it("refuses to overwrite an existing file", async () => {
    const file = join(await tempDir(), "plan-v1.json");
    await writeFileNew(file, "first");
    await expect(writeFileNew(file, "second")).rejects.toMatchObject({ code: "EEXIST" });
    expect(await readFile(file, "utf8")).toBe("first");
  });
});

describe("JSON Lines", () => {
  it("adds lines at the end and keeps earlier bytes unchanged", async () => {
    const file = join(await tempDir(), "events.jsonl");
    await appendJsonLine(file, { n: 1 });
    const before = await readFile(file, "utf8");
    await appendJsonLine(file, { n: 2 });
    const after = await readFile(file, "utf8");
    expect(after.startsWith(before)).toBe(true);
    expect(await readJsonLines(file)).toEqual([{ n: 1 }, { n: 2 }]);
  });

  it("reads a missing file as no lines", async () => {
    expect(await readJsonLines(join(await tempDir(), "missing.jsonl"))).toEqual([]);
  });
});
