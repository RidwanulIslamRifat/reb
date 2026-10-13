import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach } from "vitest";
import type { Web } from "../src/sources/web.js";
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

/** A copy of tests/fixtures/agent-configs/home: a fake home folder with every agent's config. */
export async function fakeHome(): Promise<string> {
  const home = join(await tempDir(), "home");
  await cp(join("tests", "fixtures", "agent-configs", "home"), home, { recursive: true });
  return home;
}

/** Host facts for setup tests: a local reb copy that agents start with node. */
export const testHost = {
  execPath: "/usr/local/bin/node",
  cliPath: "/opt/reb/dist/cli.js",
  platform: "linux" as NodeJS.Platform,
};

/**
 * A fake web that serves tests/fixtures/pages/site.json, so tests never touch the real internet.
 * `requests` lists every address asked for, in order; unknown addresses fail like a network error.
 */
export async function fakeWeb() {
  const dir = join("tests", "fixtures", "pages");
  const site = JSON.parse(await readFile(join(dir, "site.json"), "utf8")) as {
    responses: Record<
      string,
      {
        status: number;
        headers: Record<string, string>;
        cookies?: string[];
        file?: string;
        body?: string;
      }
    >;
  };
  const requests: string[] = [];
  const sleeps: number[] = [];
  const web: Web = {
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    fetch: async (url) => {
      requests.push(url);
      const r = site.responses[url];
      if (!r) throw new Error(`fake network: nothing at ${url}`);
      const body = r.file
        ? new Uint8Array(await readFile(join(dir, r.file)))
        : new TextEncoder().encode(r.body ?? "");
      return {
        url,
        status: r.status,
        headers: r.headers,
        cookieNames: r.cookies ?? [],
        body,
        truncated: false,
      };
    },
  };
  return { web, requests, sleeps };
}

/**
 * Adds `count` nodes of a type to a run, each backed by one documented evidence record
 * (unless `evidence` is false). Returns the node ids. Used to build thin and complete graphs.
 */
export async function addNodes(
  ctx: Context,
  run: string,
  type: string,
  count: number,
  options: { evidence?: boolean; prefix?: string } = {},
): Promise<string[]> {
  const { upsertNode } = await import("../src/workflows/graph.js");
  const { recordEvidence, recordSource } = await import("../src/workflows/evidence.js");
  const ids: string[] = [];
  for (let i = 1; i <= count; i++) {
    const name = `${options.prefix ?? "Sample"} ${type.replace(/_/g, " ")} ${String.fromCharCode(96 + i)}`;
    const { node } = await upsertNode(ctx, { run, type, name, label: "documented" });
    ids.push(node.meta.id);
    if (options.evidence === false) continue;
    const source = await recordSource(ctx, {
      run,
      url: `https://example.com/${node.meta.id}`,
      title: `Page about ${name}`,
      published: "2026-09-01",
      content: `text about ${name}`,
    });
    await recordEvidence(ctx, {
      run,
      role: "desk_researcher",
      subject: node.meta.id,
      operation: "read public page",
      source: source.record.id,
      finding: `The site describes ${name}.`,
      confidence: "documented",
    });
  }
  return ids;
}
