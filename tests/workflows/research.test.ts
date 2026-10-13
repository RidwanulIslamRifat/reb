import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { RebError } from "../../src/domain/errors.js";
import { sha256 } from "../../src/domain/evidence.js";
import { listEvidence } from "../../src/workflows/evidence.js";
import { tailEvents } from "../../src/workflows/logs.js";
import { detectTechStack, readPublicPage, summarizeHarFile } from "../../src/workflows/research.js";
import { createRun } from "../../src/workflows/runs.js";
import { fakeWeb, testContext } from "../helpers.js";

async function setup() {
  const ctx = await testContext();
  const fake = await fakeWeb();
  ctx.web = fake.web;
  const run = await createRun(ctx, { domain: "acme-notes.example" });
  return { ctx, run, slug: run.slug, ...fake };
}

describe("read_public_page", () => {
  it("returns readable text and records a source with hash and read time", async () => {
    const { ctx, slug } = await setup();
    const result = await readPublicPage(ctx, {
      run: slug,
      url: "https://acme-notes.example/pricing",
    });
    expect(result.text).toContain("# Pricing");
    expect(result.text).toContain("$15 per user per month, includes SSO");
    const html = await readFile("tests/fixtures/pages/pricing.html");
    expect(result.source).toMatchObject({
      id: "S-001",
      url: "https://acme-notes.example/pricing",
      title: "Pricing | Acme Notes",
      publisher: "Acme Notes",
      published: "2026-09-01",
      content_sha256: sha256(html),
    });
    expect(Date.parse(result.source.read_at)).not.toBeNaN();
    const { records } = await listEvidence(ctx, { run: slug, kind: "source" });
    expect(records.map((r) => r.id)).toEqual(["S-001"]);
  });

  it("logs one event naming only the url", async () => {
    const { ctx, slug } = await setup();
    await readPublicPage(ctx, { run: slug, url: "https://acme-notes.example/pricing" });
    const { events } = await tailEvents(ctx, { run: slug });
    const event = events.find((e) => e.tool === "read_public_page")!;
    expect(event).toMatchObject({ ok: true, args: { url: "https://acme-notes.example/pricing" } });
    expect(events.filter((e) => e.tool === "record_source")).toHaveLength(0);
  });

  it("reads robots.txt first and asks for nothing else than the page", async () => {
    const { ctx, slug, requests } = await setup();
    await readPublicPage(ctx, { run: slug, url: "https://acme-notes.example/" });
    expect(requests).toEqual([
      "https://acme-notes.example/robots.txt",
      "https://acme-notes.example/",
    ]);
  });

  it('refuses a page robots.txt disallows, with "robots.txt disallows this page"', async () => {
    const { ctx, slug, requests } = await setup();
    await expect(
      readPublicPage(ctx, { run: slug, url: "https://acme-notes.example/private/plans" }),
    ).rejects.toThrow("robots.txt disallows this page");
    expect(requests).not.toContain("https://acme-notes.example/private/plans");
    const { records } = await listEvidence(ctx, { run: slug });
    expect(records).toHaveLength(0);
  });

  it("checks robots.txt again when a redirect leads somewhere else", async () => {
    const { ctx, slug } = await setup();
    const moved = await readPublicPage(ctx, {
      run: slug,
      url: "https://acme-notes.example/old-pricing",
    });
    expect(moved.source.url).toBe("https://acme-notes.example/pricing");
    await expect(
      readPublicPage(ctx, { run: slug, url: "https://acme-notes.example/to-private" }),
    ).rejects.toThrow("robots.txt disallows this page");
  });

  it('refuses login pages with "this page needs a login"', async () => {
    const { ctx, slug, requests } = await setup();
    for (const url of [
      "https://acme-notes.example/members", // 401
      "https://acme-notes.example/dashboard", // redirects to /login
      "https://acme-notes.example/session", // a password form
      "https://acme-notes.example/login",
    ]) {
      await expect(readPublicPage(ctx, { run: slug, url }), url).rejects.toThrow(
        "This page needs a login",
      );
    }
    expect(requests).not.toContain("https://acme-notes.example/login?next=/dashboard");
  });

  it("treats a missing robots.txt as allowed and refuses when it cannot be read", async () => {
    const { ctx, slug } = await setup();
    const plain = await readPublicPage(ctx, { run: slug, url: "https://no-robots.example/" });
    expect(plain.text).toBe("Plain text page from a site without robots.txt.");
    expect(plain.source.title).toBe("no-robots.example/");
    await expect(
      readPublicPage(ctx, { run: slug, url: "https://broken-robots.example/" }),
    ).rejects.toThrow("robots.txt of broken-robots.example cannot be read");
  });

  it("refuses files that are not web pages, and private addresses", async () => {
    const { ctx, slug, requests } = await setup();
    await expect(
      readPublicPage(ctx, { run: slug, url: "https://acme-notes.example/whitepaper" }),
    ).rejects.toThrow("is not a web page (it is application/pdf)");
    await expect(readPublicPage(ctx, { run: slug, url: "http://localhost:8080/" })).rejects.toThrow(
      RebError,
    );
    expect(requests.some((u) => u.includes("localhost"))).toBe(false);
  });

  it("says so when a page has little text (drawn by JavaScript)", async () => {
    const { ctx, slug } = await setup();
    const result = await readPublicPage(ctx, { run: slug, url: "https://acme-notes.example/app" });
    expect(result.limitations.join(" ")).toMatch(/Little text came back.*screenshot/);
  });

  it("waits at least 1 second between two reads of the same site", async () => {
    const ctx = await testContext();
    // A clock that stands still, so the second read comes "at the same moment".
    const frozen = new Date(2026, 9, 13, 9, 0, 0);
    ctx.now = () => frozen;
    const fake = await fakeWeb();
    ctx.web = fake.web;
    const run = await createRun(ctx, { domain: "acme-notes.example" });
    await readPublicPage(ctx, { run: run.slug, url: "https://acme-notes.example/pricing" });
    expect(fake.sleeps).toEqual([]);
    await readPublicPage(ctx, { run: run.slug, url: "https://acme-notes.example/" });
    expect(fake.sleeps).toEqual([1000]);
  });

  it("cuts long text to max_chars and says so", async () => {
    const { ctx, slug } = await setup();
    const result = await readPublicPage(ctx, {
      run: slug,
      url: "https://acme-notes.example/",
      max_chars: 20,
    });
    expect(result.text).toHaveLength(20);
    expect(result.text_cut).toBe(true);
    expect(result.characters).toBeGreaterThan(20);
  });
});

describe("detect_tech_stack", () => {
  it("lists the tools of a public page and records it as a source", async () => {
    const { ctx, slug } = await setup();
    const result = await detectTechStack(ctx, { run: slug, url: "https://acme-notes.example/" });
    expect(result.source.id).toBe("S-001");
    expect(result.technologies.map((t) => t.name)).toEqual(
      expect.arrayContaining(["Next.js", "Vercel", "Stripe", "Intercom", "Segment"]),
    );
    const { events } = await tailEvents(ctx, { run: slug });
    expect(events.at(-1)).toMatchObject({ tool: "detect_tech_stack", ok: true });
  });

  it("obeys robots.txt like read_public_page", async () => {
    const { ctx, slug } = await setup();
    await expect(
      detectTechStack(ctx, { run: slug, url: "https://acme-notes.example/private/x" }),
    ).rejects.toThrow("robots.txt disallows this page");
  });
});

describe("summarize_har", () => {
  it("summarises without leaking a planted secret into the result or the event log", async () => {
    const { ctx, run, slug } = await setup();
    const result = await summarizeHarFile(ctx, {
      run: slug,
      file: "tests/fixtures/har/sample.har",
    });
    expect(result.summary.endpoints.length).toBeGreaterThan(5);
    expect(JSON.stringify(result.summary)).not.toContain("FAKE-SECRET");
    const log = await readFile(run.paths.events, "utf8");
    expect(log).toContain('"tool":"summarize_har"');
    expect(log).not.toContain("FAKE-SECRET");
  });

  it("works without any run and says the call was not logged", async () => {
    const ctx = await testContext();
    const result = await summarizeHarFile(ctx, { file: "tests/fixtures/har/sample.har" });
    expect(result.summary.requests).toBe(15);
    expect("note" in result && result.note).toMatch(/not logged/);
  });

  it("gives clear errors for a missing file and a file that is not a HAR", async () => {
    const { ctx, slug } = await setup();
    await expect(summarizeHarFile(ctx, { run: slug, file: "nope.har" })).rejects.toThrow(
      "There is no file nope.har",
    );
    await expect(
      summarizeHarFile(ctx, { run: slug, file: "tests/fixtures/har/not-a-har.json" }),
    ).rejects.toThrow("This file is not a HAR");
  });
});
