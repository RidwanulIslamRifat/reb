import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { filesUnder } from "./helpers.js";

/**
 * M10 safety review (SPEC 2), kept as a test so later changes cannot quietly break it:
 * reb reaches the internet in one place only, with plain GET requests and no cookies; it starts no
 * programs except the person's browser; it ships no browser automation and no telemetry.
 */
async function sources(): Promise<Array<{ path: string; text: string }>> {
  const paths = (await filesUnder("src")).filter((p) => /\.tsx?$/.test(p));
  return Promise.all(
    paths.map(async (p) => ({
      path: p.replace(/\\/g, "/"),
      text: await readFile(`src/${p}`, "utf8"),
    })),
  );
}

describe("safety boundaries (SPEC 2)", () => {
  it("calls the network only from the public page reader and the local dashboard page", async () => {
    const callers = (await sources())
      .filter((f) => /(?<![.\w])fetch\(/.test(f.text))
      .map((f) => f.path);
    // web.ts reads one public page; api.ts is the dashboard page asking its own local server.
    expect(callers.sort()).toEqual(["dashboard/app/src/api.ts", "sources/web.ts"]);
    const web = (await sources()).find((f) => f.path === "sources/web.ts")!.text;
    // The request options: a plain GET (no method, no body), no cookies, redirects not followed.
    const options = web.slice(web.indexOf("await fetch(url, {"), web.indexOf("signal:"));
    expect(options).toContain('credentials: "omit"');
    expect(options).toContain('redirect: "manual"');
    expect(options).not.toMatch(/\b(method|body):/);
    const api = (await sources()).find((f) => f.path === "dashboard/app/src/api.ts")!.text;
    expect(api).toContain("fetch(`/api${path}`)");
  });

  it("starts no other program than the browser, and ships no automation or telemetry", async () => {
    const all = await sources();
    const spawners = all
      .filter((f) => /node:child_process|from "child_process"/.test(f.text))
      .map((f) => f.path);
    expect(spawners).toEqual(["dashboard/launch.ts"]);
    const banned =
      /playwright|puppeteer|selenium|webdriver|analytics|telemetry|sentry|posthog|mixpanel|segment\.io/i;
    const imports = all.flatMap((f) =>
      [...f.text.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => `${f.path}: ${m[1]}`),
    );
    expect(imports.filter((i) => banned.test(i.split(": ")[1]!))).toEqual([]);
    const pkg = JSON.parse(await readFile("package.json", "utf8")) as {
      dependencies: Record<string, string>;
    };
    expect(Object.keys(pkg.dependencies).filter((d) => banned.test(d))).toEqual([]);
  });
});
