import { z } from "zod";
import { REA_PASSIVE_TOOLS } from "../../../domain/rea.js";
import { importInbox, makeTestDataset, makeTestPlan } from "../../../workflows/handsOn.js";
import { recordReaResult } from "../../../workflows/rea.js";
import { runArg, tool } from "./common.js";

const session = z.string().describe('Inbox session folder, for example "session-01".');

export const handsOnTools = [
  tool({
    name: "make_test_plan",
    description:
      "Make a numbered checklist for the HUMAN's own session in the product, from the graph's journeys and " +
      "question nodes: what to do, what to screenshot and what to note, and how to name the files. Writes " +
      "notes/test-plan-<session>.md and creates evidence/inbox/<session>/. Show it to the user; never do the steps yourself.",
    input: {
      run: runArg,
      session: session.optional().describe("Leave out to use the next free session."),
    },
    call: (ctx, args) => makeTestPlan(ctx, args),
  }),
  tool({
    name: "make_test_dataset",
    description:
      "Make clearly fake sample data (Test User 01, test.user01@example.com ...) for the brief's category and the " +
      "graph's data objects, as CSV or JSON files in notes/test-data/. The human types or uploads it by hand.",
    input: {
      run: runArg,
      format: z.enum(["csv", "json"]).optional().describe("Default csv."),
      rows: z.number().int().min(1).max(50).optional().describe("Rows per table (default 5)."),
    },
    call: (ctx, args) => makeTestDataset(ctx, args),
  }),
  tool({
    name: "import_inbox",
    description:
      "Turn the screenshots, notes and HAR files the human saved in evidence/inbox/<session>/ into evidence records " +
      "labelled observed. A note bullet starting with [node-id], or a file named <node-id>--<n>.png, links the item " +
      "to that node. HAR files are summarised with secrets stripped; the raw file is never copied. Use dry_run first " +
      "to show the user what would be imported. Importing again adds only new items.",
    input: {
      run: runArg,
      session,
      subject: z
        .string()
        .optional()
        .describe("Node for items that name none (default: the product node, if there is one)."),
      dry_run: z
        .boolean()
        .optional()
        .describe("Only show what would be imported; write no evidence."),
      delete_raw_har: z
        .boolean()
        .optional()
        .describe("Delete the raw .har files after import. Ask the user first."),
    },
    call: (ctx, args) => importInbox(ctx, args),
  }),
  tool({
    name: "record_rea_result",
    description:
      "Optional REA bridge: store what one of REA's PASSIVE tools returned (" +
      REA_PASSIVE_TOOLS.join(", ") +
      ") as evidence. Only use it if the REA MCP server is installed. reb strips secrets, saves the result in " +
      "evidence/rea/ and records the evidence. Never use REA tools that open or drive a browser.",
    input: {
      run: runArg,
      tool: z
        .string()
        .describe(`The REA tool that produced the result: ${REA_PASSIVE_TOOLS.join(", ")}.`),
      subject: z
        .string()
        .min(1)
        .describe("Node id the finding is about, for example integration-stripe."),
      finding: z.string().min(1).describe("What the result shows, in one or two sentences."),
      source: z
        .string()
        .min(1)
        .describe("What REA looked at: the public url, or the path of the user's capture file."),
      result: z.unknown().describe("What the REA tool returned, as it came back."),
      confidence: z
        .enum(["observed", "documented", "inferred", "unknown"])
        .optional()
        .describe(
          "Default and strongest allowed: observed for a network capture, documented for a page, inferred for a bundle.",
        ),
      limitations: z.array(z.string()).optional(),
      links: z.array(z.string()).optional(),
    },
    call: (ctx, args) => recordReaResult(ctx, args),
  }),
];
