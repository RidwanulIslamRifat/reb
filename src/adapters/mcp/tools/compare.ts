import { z } from "zod";
import { compareRuns } from "../../../workflows/compare.js";
import { runArg, tool } from "./common.js";

export const compareTools = [
  tool({
    name: "compare_runs",
    description:
      "Compare two runs and write reports/compare-<other>.md in run. For two runs of the same product " +
      "(run = earlier, other = later) it lists nodes added and removed, label and typed-field changes " +
      "(prices, risk levels ...) and metrics then and now. For two different products it lists the " +
      "features, plans, integrations and other nodes only one of them has, and their metrics side by side. " +
      "Nodes are matched by type and name. It changes neither graph.",
    input: {
      run: runArg,
      other: z.string().min(1).describe("The other run's folder name."),
    },
    call: (ctx, args) => compareRuns(ctx, args),
  }),
];
