import { createHash } from "node:crypto";
import { z } from "zod";
import { RoleSchema } from "./plan.js";

/**
 * Evidence labels (SPEC 2.2), strongest first.
 * observed: seen in the user's own session; documented: stated publicly;
 * inferred: reasoned guess; unknown: not confirmed.
 */
export const CONFIDENCES = ["observed", "documented", "inferred", "unknown"] as const;
export const ConfidenceSchema = z.enum(CONFIDENCES);
export type Confidence = z.infer<typeof ConfidenceSchema>;

/** Higher number = stronger label. */
export function confidenceRank(label: Confidence): number {
  return CONFIDENCES.length - CONFIDENCES.indexOf(label);
}

export const EVIDENCE_ID = /^E-\d{3,}$/;
export const SOURCE_ID = /^S-\d{3,}$/;

/** True for ids that point into the ledger (E-NNN or S-NNN). */
export function isLedgerId(id: string): boolean {
  return EVIDENCE_ID.test(id) || SOURCE_ID.test(id);
}

/** A publication date: YYYY, YYYY-MM or YYYY-MM-DD. */
const PublishedSchema = z
  .string()
  .regex(/^\d{4}(-\d{2}(-\d{2})?)?$/, "use a date like 2026-09-01 (or 2026-09, or 2026)");

/**
 * A source record (SPEC 6.2), stored in evidence/ledger.jsonl with kind "source"
 * (ROADMAP decision 5). `corrects` names an earlier source this one replaces.
 */
export const SourceRecordSchema = z.object({
  kind: z.literal("source"),
  id: z.string().regex(SOURCE_ID),
  url: z.string().min(1),
  title: z.string().min(1),
  publisher: z.string().default(""),
  published: PublishedSchema.optional(),
  read_at: z.string(),
  content_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  corrects: z.string().regex(SOURCE_ID).optional(),
});
export type SourceRecord = z.infer<typeof SourceRecordSchema>;

/**
 * An evidence record (SPEC 6.2). `subject` is a node id, `source` a url, file path or S-NNN id.
 * A correction is a new record with `corrects` set to the old id; the old line is never changed.
 */
export const EvidenceRecordSchema = z.object({
  kind: z.literal("evidence"),
  id: z.string().regex(EVIDENCE_ID),
  role: RoleSchema,
  subject: z.string().min(1),
  operation: z.string().min(1),
  source: z.string().min(1),
  finding: z.string().min(1),
  confidence: ConfidenceSchema,
  limitations: z.array(z.string()).default([]),
  links: z.array(z.string()).default([]),
  at: z.string(),
  corrects: z.string().regex(EVIDENCE_ID).optional(),
});
export type EvidenceRecord = z.infer<typeof EvidenceRecordSchema>;

export const LedgerRecordSchema = z.discriminatedUnion("kind", [
  SourceRecordSchema,
  EvidenceRecordSchema,
]);
export type LedgerRecord = z.infer<typeof LedgerRecordSchema>;

/** What a caller gives record_source. reb adds kind, id and read_at. */
export const SourceInputSchema = z.object({
  url: z.string().min(1),
  title: z.string().min(1),
  publisher: z.string().optional(),
  published: PublishedSchema.optional(),
  content_sha256: z.string().regex(/^[a-f0-9]{64}$/, "must be 64 lowercase hex characters"),
  corrects: z.string().regex(SOURCE_ID, "must be a source id like S-001").optional(),
});
export type SourceInput = z.infer<typeof SourceInputSchema>;

/** What a caller gives record_evidence. reb adds kind, id and at. */
export const EvidenceInputSchema = z.object({
  role: RoleSchema,
  subject: z.string().min(1),
  operation: z.string().min(1),
  source: z.string().min(1),
  finding: z.string().min(1),
  confidence: ConfidenceSchema,
  limitations: z.array(z.string()).default([]),
  links: z.array(z.string()).default([]),
  corrects: z.string().regex(EVIDENCE_ID, "must be an evidence id like E-001").optional(),
});
export type EvidenceInput = z.input<typeof EvidenceInputSchema>;

/** sha256 of text as lowercase hex, for content_sha256. */
export function sha256(content: string | Uint8Array): string {
  return createHash("sha256").update(content).digest("hex");
}

/** The next free id of a kind: E-001, E-002 ... (at least 3 digits). */
export function nextLedgerId(records: LedgerRecord[], kind: LedgerRecord["kind"]): string {
  const prefix = kind === "source" ? "S" : "E";
  const highest = records
    .filter((r) => r.kind === kind)
    .reduce((max, r) => Math.max(max, Number(r.id.slice(2))), 0);
  return `${prefix}-${String(highest + 1).padStart(3, "0")}`;
}

/** Map from an old record's id to the id of the newest record that corrects it. */
export function correctionsOf(records: LedgerRecord[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const r of records) if (r.corrects) map.set(r.corrects, r.id);
  return map;
}
