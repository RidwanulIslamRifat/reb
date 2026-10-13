import { z } from "zod";
import { REPORT_TYPES } from "../../../domain/brief.js";
import { createRun, getBrief, listRuns, updateBrief } from "../../../workflows/runs.js";
import { runArg, tool } from "./common.js";

const reports = z
  .array(z.enum(REPORT_TYPES))
  .describe("Reports the user asked for: business, feature, market, build.");

export const runTools = [
  tool({
    name: "create_run",
    description:
      "Start a new analysis of a SaaS product: creates its run folder (brief, plan, knowledge graph, " +
      "evidence, logs) and returns the run name to pass to every other tool. Use when the user says " +
      '"Analyse <domain>". Check list_runs first if they may want to continue an earlier run.',
    input: {
      domain: z.string().min(1).describe("The product's domain or URL, for example notion.so."),
      category: z
        .string()
        .optional()
        .describe("b2b-saas, developer-tool, marketplace, consumer-app or ai-tool."),
      reports: reports.optional(),
      focus_questions: z
        .array(z.string().min(1))
        .optional()
        .describe("Questions the user wants answered."),
      plan_tier: z
        .string()
        .optional()
        .describe('The product pricing plan the user has access to, for example "Free trial".'),
      deadline: z.string().optional().describe("When the analysis is due, for example 2026-11-01."),
    },
    call: (ctx, args) => createRun(ctx, args),
  }),
  tool({
    name: "get_brief",
    description:
      "Read a run's brief: product, url, category, requested reports, focus questions, plan tier, deadline, and the analyst's notes.",
    input: { run: runArg },
    call: (ctx, args) => getBrief(ctx, args),
  }),
  tool({
    name: "update_brief",
    description:
      "Change some brief values (only the ones given). Use when the user adds a report or focus question, or to set the category.",
    input: {
      run: runArg,
      changes: z
        .object({
          product: z.string().min(1).optional(),
          url: z.string().min(1).optional(),
          category: z.string().optional(),
          reports: reports.optional(),
          focus_questions: z.array(z.string().min(1)).optional(),
          plan_tier: z.string().optional(),
          deadline: z.string().optional(),
        })
        .describe("The brief fields to change."),
    },
    call: (ctx, args) => updateBrief(ctx, args),
  }),
  tool({
    name: "list_runs",
    description:
      "List every analysis run, most recently changed first, with product, plan version and task count.",
    input: {},
    call: async (ctx) => ({ runs: await listRuns(ctx) }),
  }),
];
