import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach } from "vitest";
import type { Context } from "../src/workflows/context.js";

const made: string[] = [];

afterEach(async () => {
  for (const dir of made.splice(0)) await rm(dir, { recursive: true, force: true });
});

/** A fresh, empty folder that is removed after the test. */
export async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "reb-test-"));
  made.push(dir);
  return dir;
}

/** A workflow context with its own runs root and a clock that moves 1 second per call. */
export async function testContext(start = new Date(2026, 9, 13, 9, 0, 0)): Promise<Context> {
  let tick = 0;
  return {
    root: join(await tempDir(), "runs"),
    via: "cli",
    now: () => new Date(start.getTime() + 1000 * tick++),
  };
}

export const samplePlan = {
  product: "example.com",
  pipeline: "b2b-saas",
  reports: ["feature"],
  tasks: [
    { id: "t1", title: "Read the home page", role: "desk_researcher" },
    { id: "t2", title: "Map the features", role: "feature_analyst", depends_on: ["t1"] },
    { id: "t3", title: "Size the market", role: "market_researcher" },
  ],
};
