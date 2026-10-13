import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { detectTech, SIGNATURES } from "../../src/sources/techStack.js";

const page = (name: string) => readFile(`tests/fixtures/pages/${name}`, "utf8");

describe("tech stack detection", () => {
  it("has a valid signature list with unique names and working patterns", () => {
    expect(SIGNATURES.length).toBeGreaterThanOrEqual(50);
    const names = SIGNATURES.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
    for (const sig of SIGNATURES) {
      const patterns = [
        ...Object.values(sig.headers ?? {}),
        ...Object.values(sig.meta ?? {}),
        ...(sig.html ?? []),
        ...(sig.cookies ?? []),
      ];
      expect(patterns.length, sig.name).toBeGreaterThan(0);
      for (const p of patterns) expect(() => new RegExp(p, "i"), `${sig.name}: ${p}`).not.toThrow();
      for (const implied of sig.implies ?? []) expect(names, sig.name).toContain(implied);
    }
  });

  it("finds the expected tools on the sample home page", async () => {
    const found = detectTech({
      html: await page("home.html"),
      headers: { server: "Vercel", "x-vercel-id": "fra1::fake", "x-powered-by": "Next.js" },
      cookieNames: ["__cf_bm"],
    });
    const byName = Object.fromEntries(found.map((t) => [t.name, t]));
    expect(Object.keys(byName).sort()).toEqual(
      [
        "Cloudflare",
        "Google Analytics",
        "Intercom",
        "Next.js",
        "React",
        "Segment",
        "Stripe",
        "Vercel",
      ].sort(),
    );
    expect(byName["Next.js"]!.confidence).toBe("documented");
    expect(byName["Next.js"]!.clues).toContain("header x-powered-by: Next.js");
    expect(byName["Stripe"]!.confidence).toBe("inferred");
    expect(byName["React"]!.clues).toEqual(["implied by Next.js"]);
    expect(byName["Cloudflare"]!.clues).toEqual(["sets a cookie named __cf_bm"]);
  });

  it("finds a WordPress blog from its generator tag and paths", async () => {
    const names = detectTech({
      html: await page("blog-post.html"),
      headers: { server: "nginx" },
    }).map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(["WordPress", "jQuery", "Nginx"]));
  });

  it("finds nothing on a page without clues", () => {
    expect(detectTech({ html: "<p>hello</p>", headers: {} })).toEqual([]);
  });
});
