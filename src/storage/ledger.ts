import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { RebError } from "../domain/errors.js";
import { LedgerRecordSchema, type LedgerRecord } from "../domain/evidence.js";
import { describeIssues } from "../domain/plan.js";
import { appendJsonLine, readTextIfExists } from "./jsonl.js";
import { withFileLock } from "./lock.js";
import type { RunPaths } from "./runFolder.js";

/** Every record in evidence/ledger.jsonl, oldest first. A missing ledger has no records. */
export async function readLedger(paths: RunPaths): Promise<LedgerRecord[]> {
  const text = await readTextIfExists(paths.ledger);
  if (text === null) return [];
  return text.split("\n").flatMap((line, i) => {
    if (!line.trim()) return [];
    let data: unknown;
    try {
      data = JSON.parse(line);
    } catch {
      throw badLine(paths, i + 1, "it is not valid JSON");
    }
    const result = LedgerRecordSchema.safeParse(data);
    if (!result.success) throw badLine(paths, i + 1, describeIssues(result.error));
    return [result.data];
  });
}

function badLine(paths: RunPaths, line: number, reason: string): RebError {
  return new RebError(
    `Line ${line} of ${paths.ledger} cannot be read: ${reason}.`,
    "The ledger is append-only: restore that line from a backup, or fix the typing by hand.",
  );
}

/**
 * Adds one record to the end of the ledger. `make` gets the current records and builds the new one
 * (for example with the next free id); it runs under the ledger lock, so two calls never get the
 * same id. Existing lines are never changed (SPEC 6.2).
 */
export async function appendLedgerRecord<T extends LedgerRecord>(
  paths: RunPaths,
  make: (records: LedgerRecord[]) => T,
): Promise<T> {
  await mkdir(dirname(paths.ledger), { recursive: true });
  return withFileLock(paths.ledgerLock, async () => {
    const record = make(await readLedger(paths));
    await appendJsonLine(paths.ledger, LedgerRecordSchema.parse(record));
    return record;
  });
}
