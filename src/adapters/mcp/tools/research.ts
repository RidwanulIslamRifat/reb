import { z } from "zod";
import { detectTechStack, readPublicPage, summarizeHarFile } from "../../../workflows/research.js";
import { runArg, tool } from "./common.js";

export const researchTools = [
  tool({
    name: "read_public_page",
    description:
      "Read ONE public web page and get its readable text; reb records it as a source (S-NNN) with a sha256 " +
      "and read time, so cite the returned source id in record_evidence. Obeys robots.txt, never logs in, " +
      "never submits forms, never crawls. If it refuses a page, do not open that page with another tool.",
    input: {
      run: runArg,
      url: z
        .string()
        .min(1)
        .describe("Full public address, for example https://example.com/pricing"),
      max_chars: z
        .number()
        .int()
        .min(1000)
        .optional()
        .describe("Most characters of text to return (default 40000)."),
    },
    call: (ctx, args) => readPublicPage(ctx, args),
  }),
  tool({
    name: "detect_tech_stack",
    description:
      "Guess the tools a product's public page uses (framework, hosting, analytics, payments, support...) from " +
      "its HTML and response headers. Same rules as read_public_page; records the page as a source. Each tool " +
      "comes with clues and a suggested label (documented or inferred).",
    input: {
      run: runArg,
      url: z.string().min(1).describe("Full public address, usually the home page."),
    },
    call: (ctx, args) => detectTechStack(ctx, args),
  }),
  tool({
    name: "summarize_har",
    description:
      "Summarise a HAR file the human saved from their own browser session: endpoint patterns with counts, request timing, " +
      "polling and streaming. Cookies, auth headers, tokens, bodies and query values are stripped first. " +
      "Never replay or call any endpoint it lists.",
    input: {
      run: runArg,
      file: z.string().min(1).describe("Path to the .har file."),
    },
    call: (ctx, args) => summarizeHarFile(ctx, args),
  }),
];
