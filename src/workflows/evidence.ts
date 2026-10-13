import { RebError } from "../domain/errors.js";
import {
  correctionsOf,
  EvidenceInputSchema,
  EvidenceRecordSchema,
  isLedgerId,
  nextLedgerId,
  sha256,
  SOURCE_ID,
  SourceInputSchema,
  SourceRecordSchema,
  type LedgerRecord,
} from "../domain/evidence.js";
import { looksLikeNodeId } from "../domain/node.js";
import { describeIssues } from "../domain/plan.js";
import { readBytesIfExists } from "../storage/jsonl.js";
import { appendLedgerRecord, readLedger } from "../storage/ledger.js";
import { readNodeText } from "../storage/nodeFiles.js";
import type { Context } from "./context.js";
import { argsOf, logged } from "./logging.js";
import { resolveRun } from "./runs.js";

function requireRecord(
  records: LedgerRecord[],
  id: string,
  kind: LedgerRecord["kind"],
  what: string,
) {
  const record = records.find((r) => r.id === id);
  if (!record || record.kind !== kind) {
    throw new RebError(
      `${what} ${id} is not in the evidence ledger.`,
      'Check the id with "reb evidence list".',
    );
  }
}

export interface SourceArgs {
  run?: string;
  url: string;
  title: string;
  publisher?: string;
  published?: string;
  /** The text that was read; reb stores only its sha256. */
  content?: string | Uint8Array;
  content_sha256?: string;
  corrects?: string;
}

/**
 * record_source: adds a source record (S-NNN) to the ledger. reb picks the id and read_at.
 * Give the content that was read (reb hashes it) or its sha256.
 */
export async function recordSource(ctx: Context, input: SourceArgs) {
  const run = await resolveRun(ctx, input.run);
  const { content, ...args } = argsOf(input);
  return logged(
    ctx,
    "record_source",
    run,
    { ...args, content_bytes: content?.length },
    async () => {
      const hash = content === undefined ? input.content_sha256 : sha256(content);
      if (!hash) {
        throw new RebError(
          "A source needs the content that was read, to record its sha256.",
          "Give the saved page with --file <path>, or its hash with --sha256 <hex>.",
        );
      }
      if (input.content_sha256 && input.content_sha256 !== hash) {
        throw new RebError(
          "The given sha256 does not match the content.",
          "Give either the content or the hash, not both.",
        );
      }
      const parsed = SourceInputSchema.safeParse({ ...args, content_sha256: hash });
      if (!parsed.success) {
        throw new RebError(
          `The source is not valid: ${describeIssues(parsed.error)}.`,
          "Fix the listed fields. A source needs a url and a title.",
        );
      }
      const record = await appendLedgerRecord(run.paths, (records) => {
        if (parsed.data.corrects) requireRecord(records, parsed.data.corrects, "source", "Source");
        return SourceRecordSchema.parse({
          kind: "source",
          id: nextLedgerId(records, "source"),
          ...parsed.data,
          publisher: parsed.data.publisher ?? "",
          read_at: ctx.now().toISOString(),
        });
      });
      return { ...run, record };
    },
  );
}

/** Like record_source, but hashes a saved copy of the page from a file. */
export async function recordSourceFromFile(
  ctx: Context,
  input: Omit<SourceArgs, "content"> & { file: string },
) {
  const { file, ...rest } = input;
  const content = await readBytesIfExists(file);
  if (content === null) {
    throw new RebError(`There is no file ${file}.`, "Check the path to the saved page.");
  }
  return recordSource(ctx, { ...rest, content });
}

/**
 * record_evidence: adds an evidence record (E-NNN). reb picks the id and time.
 * A correction is a new record with `corrects` set; the old record stays as it was (SPEC 6.2).
 */
export async function recordEvidence(
  ctx: Context,
  input: { run?: string } & Record<string, unknown>,
) {
  const run = await resolveRun(ctx, input.run as string | undefined);
  const args = argsOf(input);
  return logged(ctx, "record_evidence", run, args, async () => {
    const parsed = EvidenceInputSchema.safeParse(args);
    if (!parsed.success) {
      throw new RebError(
        `The evidence is not valid: ${describeIssues(parsed.error)}.`,
        "Each record needs role, subject, operation, source, finding and confidence.",
      );
    }
    const data = parsed.data;
    if (!looksLikeNodeId(data.subject)) {
      throw new RebError(
        `"${data.subject}" is not a node id.`,
        'The subject is the node the finding is about, for example "feature-sso".',
      );
    }
    const warnings: string[] = [];
    if ((await readNodeText(run.paths, data.subject)) === null) {
      warnings.push(`Node ${data.subject} does not exist yet; create it with "reb kb add".`);
    }
    const record = await appendLedgerRecord(run.paths, (records) => {
      if (SOURCE_ID.test(data.source)) requireRecord(records, data.source, "source", "Source");
      if (data.corrects) requireRecord(records, data.corrects, "evidence", "Evidence");
      for (const link of data.links) {
        if (isLedgerId(link)) {
          requireRecord(
            records,
            link,
            link.startsWith("S-") ? "source" : "evidence",
            "Linked record",
          );
        }
      }
      // A correction links to the record it corrects (SPEC 6.2).
      const links =
        data.corrects && !data.links.includes(data.corrects)
          ? [...data.links, data.corrects]
          : data.links;
      return EvidenceRecordSchema.parse({
        kind: "evidence",
        id: nextLedgerId(records, "evidence"),
        ...data,
        links,
        at: ctx.now().toISOString(),
      });
    });
    return { ...run, record, warnings };
  });
}

/** list_evidence: ledger records, oldest first, each with `corrected_by` when a newer record replaces it. */
export async function listEvidence(
  ctx: Context,
  input: { run?: string; subject?: string; kind?: "source" | "evidence" } = {},
) {
  const run = await resolveRun(ctx, input.run);
  const args = argsOf(input);
  return logged(ctx, "list_evidence", run, args, async () => {
    const records = await readLedger(run.paths);
    const corrected = correctionsOf(records);
    const shown = records
      .filter((r) => !input.kind || r.kind === input.kind)
      .filter((r) => !input.subject || (r.kind === "evidence" && r.subject === input.subject))
      .map((r) => ({ ...r, corrected_by: corrected.get(r.id) }));
    return { ...run, records: shown };
  });
}
