import { z } from "zod";
import { FRAMEWORK_INFO, FRAMEWORKS } from "../../../domain/frameworks.js";
import { getFramework } from "../../../workflows/frameworks.js";
import { runArg, tool } from "./common.js";

export const frameworkTools = [
  tool({
    name: "get_framework",
    description:
      "Draw one standard analysis framework from the knowledge graph, as Markdown that cites node and E-/S- ids: " +
      FRAMEWORKS.map((f) => `${f} (${FRAMEWORK_INFO[f].title})`).join(", ") +
      ". Use it to check what an analysis still lacks, or to quote in a draft. count 0 means the graph has nothing for it yet.",
    input: {
      run: runArg,
      framework: z.enum(FRAMEWORKS),
    },
    call: (ctx, args) => getFramework(ctx, args),
  }),
];
