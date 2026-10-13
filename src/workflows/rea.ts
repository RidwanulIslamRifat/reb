import { RebError } from "../domain/errors.js";
import { confidenceRank, ConfidenceSchema, sha256, type Confidence } from "../domain/evidence.js";
import {
  isReaPassiveTool,
  REA_LIMITATION,
  REA_MAX_CONFIDENCE,
  REA_PASSIVE_TOOLS,
} from "../domain/rea.js";
import { runRelative, writeRunFile } from "../storage/inbox.js";
import { readTextIfExists } from "../storage/jsonl.js";
import { join } from "node:path";
import type { Context } from "./context.js";
import { appendEvidence } from "./evidence.js";
import { argsOf, logged } from "./logging.js";
import { redact, redactText } from "./redact.js";
import { resolveRun } from "./runs.js";

export interface ReaResultInput {
  run?: string;
  /** The REA tool that produced the result; only REA_PASSIVE_TOOLS are accepted. */
  tool: string;
  subject: string;
  finding: string;
  /** What the REA tool looked at: a public url or the path of the user's capture file. */
  source: string;
  /** What the REA tool returned, as it came back. Secrets are stripped before it is stored. */
  result: unknown;
  confidence?: string;
  limitations?: string[];
  links?: string[];
}

/**
 * record_rea_result (optional REA bridge): stores what one of REA's passive tools returned as
 * evidence. The result is redacted first (cookies, auth headers, tokens, query secrets), saved to
 * evidence/rea/<tool>-<hash>.json, and an evidence record cites it. Tools that drive a browser
 * are refused (SPEC 2.3). reb never calls REA itself; the agent does, only when REA is installed.
 */
export async function recordReaResult(ctx: Context, input: ReaResultInput) {
  const run = await resolveRun(ctx, input.run);
  const { result, ...args } = argsOf(input);
  return logged(ctx, "record_rea_result", run, args, async () => {
    if (!isReaPassiveTool(input.tool)) {
      throw new RebError(
        `reb does not store results of the REA tool "${input.tool}". Only REA's passive tools are allowed: ` +
          `${REA_PASSIVE_TOOLS.join(", ")}. Tools that open, drive or click in a browser are never used (SPEC 2.3).`,
        "Use one of the passive tools, or ask the human to look at the product themselves.",
      );
    }
    const max = REA_MAX_CONFIDENCE[input.tool];
    const wanted = ConfidenceSchema.safeParse(input.confidence ?? max);
    if (!wanted.success) {
      throw new RebError(
        `"${input.confidence}" is not a label.`,
        "Use observed, documented, inferred or unknown.",
      );
    }
    const confidence: Confidence = wanted.data;
    if (confidenceRank(confidence) > confidenceRank(max)) {
      throw new RebError(
        `A result of ${input.tool} can be at most "${max}", not "${confidence}".`,
        `Record it as ${max} or weaker.`,
      );
    }
    if (result === undefined || result === null || result === "") {
      throw new RebError(
        "There is no REA result to store.",
        "Pass what the REA tool returned as result.",
      );
    }
    const stored =
      JSON.stringify(
        { tool: input.tool, source: redactText(input.source), result: redact(result) },
        null,
        2,
      ) + "\n";
    const file = join(run.paths.rea, `${input.tool}-${sha256(stored).slice(0, 12)}.json`);
    await writeRunFile(file, stored);
    const path = runRelative(run.paths, file);
    const { record, warnings } = await appendEvidence(ctx, run, {
      role: "tech_observer",
      subject: input.subject,
      operation: `rea:${input.tool}`,
      source: redactText(input.source),
      finding: redactText(input.finding),
      confidence,
      limitations: [
        REA_LIMITATION[input.tool],
        `Redacted REA result: ${path}.`,
        ...(input.limitations ?? []),
      ],
      links: input.links ?? [],
    });
    return { ...run, record, file: path, warnings };
  });
}

/** Like record_rea_result, with the REA result read from a saved JSON (or plain text) file. */
export async function recordReaResultFromFile(
  ctx: Context,
  input: Omit<ReaResultInput, "result"> & { file: string },
) {
  const { file, ...rest } = input;
  const text = await readTextIfExists(file);
  if (text === null) {
    throw new RebError(`There is no file ${file}.`, "Check the path to the saved REA result.");
  }
  let result: unknown = text;
  try {
    result = JSON.parse(text);
  } catch {
    // Not JSON: keep the result as plain text.
  }
  return recordReaResult(ctx, { ...rest, result });
}
