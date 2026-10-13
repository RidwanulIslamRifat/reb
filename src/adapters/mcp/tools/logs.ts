import { z } from "zod";
import { ROLES } from "../../../domain/plan.js";
import { logRoleWork } from "../../../workflows/logs.js";
import { runArg, tool } from "./common.js";

export const logTools = [
  tool({
    name: "log_role_work",
    description:
      "Every role ends with this: add a short plain-language summary of what was done, found and left open to logs/roles/<role>.md.",
    input: {
      run: runArg,
      role: z.enum(ROLES),
      summary: z.string().min(1),
      task: z.string().optional().describe("Task id the work belongs to."),
    },
    call: (ctx, args) => logRoleWork(ctx, args),
  }),
];
