import { z } from "zod";
import { CONFIDENCES } from "../../../domain/evidence.js";
import { ROLES } from "../../../domain/plan.js";
import { listEvidence, recordEvidence, recordSource } from "../../../workflows/evidence.js";
import { runArg, tool } from "./common.js";

export const evidenceTools = [
  tool({
    name: "record_source",
    description:
      "Record a public page or document you read as a source (S-NNN); reb assigns the id and stores only " +
      "a sha256 of the content. Record the source before evidence that cites it.",
    input: {
      run: runArg,
      url: z.string().min(1),
      title: z.string().min(1),
      publisher: z.string().optional(),
      published: z
        .string()
        .optional()
        .describe("Publication date if shown: 2026-09-01, 2026-09 or 2026."),
      content: z.string().optional().describe("The text you read (only its hash is stored)."),
      content_sha256: z.string().optional().describe("Instead of content: its sha256 in hex."),
      corrects: z.string().optional().describe("S-NNN id of an earlier source this one replaces."),
    },
    call: (ctx, args) => recordSource(ctx, args),
  }),
  tool({
    name: "record_evidence",
    description:
      "Record one finding about one node as evidence (E-NNN); reb assigns the id. Label honestly: observed " +
      "(seen in the user's own session), documented (stated publicly), inferred (reasoned guess), unknown. " +
      "To correct a record, add a new one with corrects.",
    input: {
      run: runArg,
      role: z.enum(ROLES).describe("Your role."),
      subject: z.string().min(1).describe("Node id the finding is about, for example feature-sso."),
      operation: z.string().min(1).describe('What you did, for example "read pricing page".'),
      source: z
        .string()
        .min(1)
        .describe("S-NNN id (preferred), a URL, or a file path in the run folder."),
      finding: z.string().min(1).describe("One fact in one sentence."),
      confidence: z.enum(CONFIDENCES),
      limitations: z.array(z.string()).optional().describe("What this finding does not show."),
      links: z.array(z.string()).optional().describe("E-/S- ids this finding builds on."),
      corrects: z.string().optional().describe("E-NNN id of the record this one corrects."),
    },
    call: (ctx, args) => recordEvidence(ctx, args),
  }),
  tool({
    name: "list_evidence",
    description:
      "List ledger records (sources and evidence), oldest first; corrected records show corrected_by. Filter by subject node or kind.",
    input: {
      run: runArg,
      subject: z.string().optional().describe("Only evidence about this node id."),
      kind: z.enum(["source", "evidence"]).optional(),
    },
    call: (ctx, args) => listEvidence(ctx, args),
  }),
];
