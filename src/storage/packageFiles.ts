import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { readTextIfExists } from "./jsonl.js";

/**
 * Data files shipped with reb, next to handbook/: pipelines/*.json and reports/specs/*.json.
 * Like handbook.ts, this file is two folders below the package root in the repo and in dist.
 */
export const PIPELINES_DIR = fileURLToPath(new URL("../../pipelines/", import.meta.url));
export const REPORT_SPECS_DIR = fileURLToPath(new URL("../../reports/specs/", import.meta.url));

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

/** Text of reports/specs/<report>.json, or null when it is missing. */
export async function readReportSpecText(
  report: string,
  dir = REPORT_SPECS_DIR,
): Promise<string | null> {
  return readTextIfExists(join(dir, `${report}.json`));
}
