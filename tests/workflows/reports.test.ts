import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { REPORT_TYPES } from "../../src/domain/brief.js";

/** The v1 report types; the fixture run is complete for these. */
const V1_REPORTS = ["business", "feature", "market", "build"] as const;
/** What reb writes around the template's sections in every report (v2). */
const FRAME_TOP = ["## Report details"];
const FRAME_SCOPE = ["## Scope and methodology"];
const FRAME_END = ["## Limitations and disclaimer", "## Sources", "## Open questions"];
import { RebError } from "../../src/domain/errors.js";
import { citationsIn, claimsIn } from "../../src/domain/report.js";
import { parseReportTemplate } from "../../src/domain/reportSpec.js";
import { readJsonLines } from "../../src/storage/jsonl.js";
import { runAudit } from "../../src/workflows/audit.js";
import { createPlan } from "../../src/workflows/createPlan.js";
import { renderReport } from "../../src/workflows/renderReport.js";
import { reportSampleRun, testContext } from "../helpers.js";

/** The files in a zip, by name (enough of the format to check what reb writes). */
function unzip(data: Buffer): Map<string, string> {
  const end = data.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  expect(end).toBeGreaterThan(0);
  const count = data.readUInt16LE(end + 10);
  let at = data.readUInt32LE(end + 16);
  const files = new Map<string, string>();
  for (let i = 0; i < count; i++) {
    expect(data.readUInt32LE(at)).toBe(0x02014b50);
    const method = data.readUInt16LE(at + 10);
    const size = data.readUInt32LE(at + 20);
    const nameLength = data.readUInt16LE(at + 28);
    const extra = data.readUInt16LE(at + 30) + data.readUInt16LE(at + 32);
    const offset = data.readUInt32LE(at + 42);
    const name = data.subarray(at + 46, at + 46 + nameLength).toString("utf8");
    const local = offset + 30 + data.readUInt16LE(offset + 26) + data.readUInt16LE(offset + 28);
    const packed = data.subarray(local, local + size);
    files.set(name, (method === 8 ? inflateRawSync(packed) : packed).toString("utf8"));
    at += 46 + nameLength + extra;
  }
  return files;
}

async function template(report: string) {
  return parseReportTemplate(await readFile(`reports/templates/${report}.md`, "utf8"), report);
}

const headingsOf = (markdown: string) =>
  markdown
    .split("\n")
    .filter((l) => /^#{1,3} /.test(l))
    .map((l) => l.replace(/^#+ /, ""));

describe("render_report", () => {
  it("renders every report type from the fixture run, with every template section", async () => {
    const ctx = await testContext();
    const dir = await reportSampleRun();
    for (const report of V1_REPORTS) {
      const result = await renderReport(ctx, { run: dir, report });
      const text = await readFile(join(dir, "reports", `${report}.md`), "utf8");
      const { title, sections } = await template(report);
      expect(text.startsWith(`# ${title}: acme-notes.example\n`)).toBe(true);
      const headings = text.split("\n").filter((l) => l.startsWith("## "));
      expect(headings, report).toEqual([
        ...FRAME_TOP,
        ...(report === "feature" ? ["## Executive summary"] : []),
        ...FRAME_SCOPE,
        ...sections.map((s) => `## ${s.title}`),
        ...FRAME_END,
      ]);
      expect(result.sections).toEqual(sections.map((s) => s.title));
      // The fixture is complete: every section need is met.
      expect(result.unmet_needs, report).toEqual([]);
      expect(result.warnings.length).toBe(report === "feature" ? 0 : 1);
    }
  });

  it("renders the v2 report types with the same frame, listing what the graph still lacks", async () => {
    const ctx = await testContext();
    const dir = await reportSampleRun();
    for (const report of REPORT_TYPES.filter(
      (r) => !(V1_REPORTS as readonly string[]).includes(r),
    )) {
      const result = await renderReport(ctx, { run: dir, report });
      const text = await readFile(result.file, "utf8");
      const { sections } = await template(report);
      const headings = text.split("\n").filter((l) => l.startsWith("## "));
      expect(headings, report).toEqual([
        ...FRAME_TOP,
        ...FRAME_SCOPE,
        ...sections.map((s) => `## ${s.title}`),
        ...FRAME_END,
      ]);
      // The v1 fixture has no v2 nodes, so the report says what is missing.
      expect(result.unmet_needs.length, report).toBeGreaterThan(0);
      expect(text).toContain("Nothing in the graph for this yet");
    }
  });

  it("states an overall confidence rating and the evidence base in the report details", async () => {
    const ctx = await testContext();
    const dir = await reportSampleRun();
    const result = await renderReport(ctx, { run: dir, report: "feature" });
    const text = await readFile(result.file, "utf8");
    expect(text).toMatch(/\| Overall confidence \| \*\*(High|Medium|Low)\*\* \(\d+ of 100\)/);
    expect(text).toMatch(
      /\| Evidence base \| \d+ sources, \d+ evidence records \(\d+ observed, 0 provided/,
    );
    expect(result.confidence.score).toBeGreaterThan(0);
    const limits = text.slice(
      text.indexOf("## Limitations and disclaimer"),
      text.indexOf("## Sources"),
    );
    expect(limits).toContain("It is not an audit opinion, legal advice or investment advice.");
  });

  it("cites a node or E-/S- id in every claim, and every cited id exists", async () => {
    const ctx = await testContext();
    const dir = await reportSampleRun();
    await renderReport(ctx, { run: dir, report: "build" });
    const text = await readFile(join(dir, "reports", "build.md"), "utf8");
    const { sections } = await template("build");
    const body = text.slice(
      text.indexOf(`## ${sections[0]!.title}`),
      text.indexOf("## Limitations and disclaimer"),
    );
    const claims = claimsIn(body).filter(
      (c) => !/^_.*_$/.test(c.text) && !c.text.startsWith("Run "),
    );
    expect(claims.length).toBeGreaterThan(20);
    for (const claim of claims) expect(citationsIn(claim.text), claim.text).not.toEqual([]);
    const ledger = (await readJsonLines(join(dir, "evidence", "ledger.jsonl"))) as Array<{
      id: string;
    }>;
    const ids = new Set(ledger.map((r) => r.id));
    for (const id of citationsIn(text)) {
      if (/^[ES]-/.test(id)) expect(ids, id).toContain(id);
      else await access(join(dir, "kb", "nodes", `${id}.md`));
    }
    // Evidence with a label and its source: the data object finding is inferred, with its limit.
    expect(text).toContain(
      "  - inferred: Exported files hold a title, text and author per note. Limits: Seen in exported files only, not in the product's storage. [E-015, S-003]",
    );
  });

  it("lists the cited sources, newest corrections only, and the right open questions", async () => {
    const ctx = await testContext();
    const dir = await reportSampleRun();
    const result = await renderReport(ctx, { run: dir, report: "feature" });
    // S-001 home, S-002 pricing, S-003 export help, S-007 integrations (E-019 corrects E-018).
    expect(result.sources).toEqual(["S-001", "S-002", "S-003", "S-007"]);
    const text = await readFile(result.file, "utf8");
    const sources = text.slice(text.indexOf("## Sources"), text.indexOf("## Open questions"));
    expect(sources).toContain(
      "- **S-002** Acme Notes pricing, Acme Inc. https://acme-notes.example/pricing (published 2026-09; read 2026-10-01)",
    );
    expect(sources).toContain(
      "- **E-006** evidence/inbox/session-01/notes.md (observed, 2026-10-02)",
    );
    expect(text).not.toContain("E-018");
    expect(result.open_questions).toEqual([
      "Is PDF export planned? (about: Export) [question-export-formats]",
    ]);
    expect(
      text.trimEnd().endsWith("- Is PDF export planned? (about: Export) [question-export-formats]"),
    ).toBe(true);
  });

  it("lists section needs the graph does not meet as open questions", async () => {
    const ctx = await testContext();
    const dir = await reportSampleRun();
    await rm(join(dir, "kb", "nodes", "competitor-delta-wiki.md"));
    await rm(join(dir, "kb", "nodes", "integration-slack.md"));
    const market = await renderReport(ctx, { run: dir, report: "market" });
    expect(market.open_questions).toContain(
      '"Competitors" needs at least 3 competitor nodes; the graph has 2.',
    );
    const build = await renderReport(ctx, { run: dir, report: "build" });
    expect(build.open_questions).toContain(
      '"Integrations" needs at least 1 integration node; the graph has 0.',
    );
    expect(await readFile(build.file, "utf8")).toContain(
      "_No integration nodes in the graph yet._",
    );
  });

  it("puts the writer's draft text into the summary and its sections", async () => {
    const ctx = await testContext();
    const dir = await reportSampleRun();
    const result = await renderReport(ctx, { run: dir, report: "feature" });
    expect(result.draft).toBe("notes/report-feature.md");
    const text = await readFile(result.file, "utf8");
    expect(text).toContain(
      "## Executive summary\n\nAcme Notes is a shared note app for small teams [product-acme-notes, E-001].",
    );
    const features = text.slice(text.indexOf("## Features"), text.indexOf("### Features"));
    expect(features).toContain(
      "- Single sign-on is only on the Business plan [feature-sso, E-010].",
    );
  });

  it("refuses a draft with a missing or a broken citation, lists both, and writes nothing", async () => {
    const ctx = await testContext();
    const dir = await reportSampleRun();
    await writeFile(
      join(dir, "notes", "report-business.md"),
      [
        "Acme Notes is sold per seat [pricing_tier-business, E-004].",
        "",
        "## Competition",
        "",
        "Beta Notes is the closest rival.",
        "",
        "- Gamma Docs has comments [competitor-gamma-docs, E-099].",
        "",
        "## Costs",
        "",
      ].join("\n"),
    );
    const error = (await renderReport(ctx, { run: dir, report: "business" }).catch(
      (e: unknown) => e,
    )) as RebError;
    expect(error).toBeInstanceOf(RebError);
    expect(error.problem).toContain("notes/report-business.md has 3 problems");
    expect(error.problem).toContain('line 9: "## Costs" is not a section of the business report');
    expect(error.problem).toContain('line 5: no citation in "Beta Notes is the closest rival."');
    expect(error.problem).toContain("line 7: cites E-099, which is not in the evidence ledger");
    expect(error.fix).toContain("[feature-sso, E-004]");
    await expect(access(join(dir, "reports", "business.md"))).rejects.toThrow();
    const events = (await readJsonLines(join(dir, "logs", "events.jsonl"))) as Array<{
      tool: string;
      ok: boolean;
    }>;
    expect(events.at(-1)).toMatchObject({ tool: "render_report", ok: false });
  });

  it("writes a .docx that is a valid zip with a document part holding the same headings", async () => {
    const ctx = await testContext();
    const dir = await reportSampleRun();
    const result = await renderReport(ctx, { run: dir, report: "feature", docx: true });
    expect(result.docx_file).toBe(join(dir, "reports", "feature.docx"));
    const files = unzip(await readFile(result.docx_file!));
    expect([...files.keys()]).toEqual([
      "[Content_Types].xml",
      "_rels/.rels",
      "word/_rels/document.xml.rels",
      "word/document.xml",
      "word/styles.xml",
      "word/footer1.xml",
      "word/settings.xml",
    ]);
    const xml = files.get("word/document.xml")!;
    const docHeadings = [
      ...xml.matchAll(/<w:pStyle w:val="Heading\d"\/><\/w:pPr>((?:<w:r>.*?<\/w:r>)+)<\/w:p>/g),
    ].map((m) => [...m[1]!.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((t) => t[1]).join(""));
    const markdown = await readFile(result.file, "utf8");
    // The report's "# Title" line moves to the title page; every other heading stays.
    expect(docHeadings).toEqual(headingsOf(markdown).slice(1));
    expect(xml).toContain('<w:pStyle w:val="Title"/>');
    expect(xml).toContain("TOC \\o");
    expect(xml).toContain("Overall confidence:");
    expect(xml).toContain("[feature-sso, E-010]");
    expect(files.get("[Content_Types].xml")).toContain("wordprocessingml.document.main+xml");
    expect(files.get("word/footer1.xml")).toContain("PAGE");
  });

  it("writes a self-contained, print-ready HTML copy with a cover and contents", async () => {
    const ctx = await testContext();
    const dir = await reportSampleRun();
    const result = await renderReport(ctx, { run: dir, report: "feature", html: true });
    expect(result.html_file).toBe(join(dir, "reports", "feature.html"));
    expect(result.docx_file).toBeNull();
    const html = await readFile(result.html_file!, "utf8");
    expect(html).toMatch(/^<!doctype html>/);
    expect(html).not.toMatch(/<script|<link /);
    expect(html).toContain('<section class="cover">');
    expect(html).toContain('<nav class="toc">');
    expect(html).toContain('<h2 id="executive-summary">Executive summary</h2>');
    expect(html).toContain("[feature-sso, E-010]");
    expect(html).toContain("@media print");
  });

  it("refuses an unknown report type", async () => {
    const ctx = await testContext();
    const dir = await reportSampleRun();
    await expect(renderReport(ctx, { run: dir, report: "summary" })).rejects.toThrow(
      '"summary" is not a report type',
    );
  });
});

describe("run_audit with the report templates", () => {
  it("reads section needs from reports/templates: the complete fixture has no report gaps", async () => {
    const ctx = await testContext();
    const dir = await reportSampleRun();
    await mkdir(join(dir, "plan", "history"), { recursive: true });
    await createPlan(ctx, { run: dir });
    const { audit } = await runAudit(ctx, { run: dir });
    expect(audit.gaps.filter((g) => g.kind === "report_need" || g.kind === "evidence")).toEqual([]);
  });

  it("finds a gap named after a template section when a needed node type is missing", async () => {
    const ctx = await testContext();
    const dir = await reportSampleRun();
    await mkdir(join(dir, "plan", "history"), { recursive: true });
    await createPlan(ctx, { run: dir });
    await rm(join(dir, "kb", "nodes", "hypothesis-export-drives-upgrades.md"));
    await rm(join(dir, "kb", "nodes", "hypothesis-search-uses-an-index.md"));
    const { audit } = await runAudit(ctx, { run: dir });
    const gap = audit.gaps.find((g) => g.summary.startsWith("No hypothesis nodes"))!;
    expect(gap.detail).toBe(
      "Needed by business: Risks and assumptions; build: How it is likely built.",
    );
  });
});
