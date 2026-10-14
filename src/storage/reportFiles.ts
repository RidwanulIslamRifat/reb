import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { writeFileAtomic } from "./atomicWrite.js";
import { markdownToDocx, type Cover } from "./docxWriter.js";
import { markdownToHtml } from "./htmlWriter.js";
import { readTextIfExists } from "./jsonl.js";
import type { RunPaths } from "./runFolder.js";

/** Text of a run-folder file given by its relative path (for example notes/report-feature.md). */
export async function readRunFileText(paths: RunPaths, relative: string): Promise<string | null> {
  return readTextIfExists(join(paths.dir, ...relative.split("/")));
}

/**
 * Writes reports/<report>.md, with `docx` also reports/<report>.docx and with `html` also a
 * print-ready reports/<report>.html. Both copies start with the cover when one is given.
 */
export async function writeReportFiles(
  paths: RunPaths,
  report: string,
  markdown: string,
  options: { docx?: boolean; html?: boolean; cover?: Cover } = {},
): Promise<{ markdown: string; docx: string | null; html: string | null }> {
  await mkdir(paths.reports, { recursive: true });
  const md = paths.report(`${report}.md`);
  await writeFileAtomic(md, markdown);
  let word: string | null = null;
  let page: string | null = null;
  if (options.docx) {
    word = paths.report(`${report}.docx`);
    await writeFileAtomic(word, markdownToDocx(markdown, options.cover));
  }
  if (options.html) {
    page = paths.report(`${report}.html`);
    await writeFileAtomic(page, markdownToHtml(markdown, options.cover));
  }
  return { markdown: md, docx: word, html: page };
}
