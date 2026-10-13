import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { readTextIfExists } from "./jsonl.js";

/**
 * Data files shipped with reb, next to handbook/: pipelines/*.json and reports/templates/*.md.
 * Like handbook.ts, this file is two folders below the package root in the repo and in dist.
 */
export const PIPELINES_DIR = fileURLToPath(new URL("../../pipelines/", import.meta.url));
export const REPORT_TEMPLATES_DIR = fileURLToPath(
  new URL("../../reports/templates/", import.meta.url),
);

/** Names (without .json) of the JSON files in a folder, sorted. */
export async function listJsonNames(dir: string): Promise<string[]> {
  return (await readdir(dir))
    .filter((n) => n.endsWith(".json"))
    .map((n) => n.slice(0, -".json".length))
    .sort();
}

/** Text of pipelines/<name>.json, or null when there is no such pipeline. */
export async function readPipelineText(name: string, dir = PIPELINES_DIR): Promise<string | null> {
  return readTextIfExists(join(dir, `${name}.json`));
}

/** Text of reports/templates/<report>.md, or null when it is missing. */
export async function readReportTemplateText(
  report: string,
  dir = REPORT_TEMPLATES_DIR,
): Promise<string | null> {
  return readTextIfExists(join(dir, `${report}.md`));
}
