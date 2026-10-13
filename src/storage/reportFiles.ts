import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { writeFileAtomic } from "./atomicWrite.js";
import { markdownToDocx } from "./docxWriter.js";
import { readTextIfExists } from "./jsonl.js";
import type { RunPaths } from "./runFolder.js";

/** Text of a run-folder file given by its relative path (for example notes/report-feature.md). */
export async function readRunFileText(paths: RunPaths, relative: string): Promise<string | null> {
  return readTextIfExists(join(paths.dir, ...relative.split("/")));
}

/** Writes reports/<report>.md, and with `docx` also reports/<report>.docx. Returns the paths. */
export async function writeReportFiles(
  paths: RunPaths,
  report: string,
  markdown: string,
  docx: boolean,
): Promise<{ markdown: string; docx: string | null }> {
  await mkdir(paths.reports, { recursive: true });
  const md = paths.report(`${report}.md`);
  await writeFileAtomic(md, markdown);
  if (!docx) return { markdown: md, docx: null };
  const word = paths.report(`${report}.docx`);
  await writeFileAtomic(word, markdownToDocx(markdown));
  return { markdown: md, docx: word };
}
