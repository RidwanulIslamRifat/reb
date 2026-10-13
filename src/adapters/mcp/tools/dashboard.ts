import { openDashboard } from "../../../workflows/dashboard.js";
import { runArg, tool } from "./common.js";

export const dashboardTools = [
  tool({
    name: "open_dashboard",
    description:
      "Open the local, read-only reb dashboard in the user's browser: runs, plan board with history, " +
      "knowledge graph, evidence table, activity log and reports. It runs on this computer only " +
      "(127.0.0.1) and changes no files. Returns the address; tell the user to open it if the browser did not.",
    input: { run: runArg },
    call: async (ctx, args) => {
      const { handle: _handle, ...result } = await openDashboard(ctx, { run: args.run });
      void _handle;
      return result;
    },
  }),
];
