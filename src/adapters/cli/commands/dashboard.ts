import type { Command } from "commander";
import { RebError } from "../../../domain/errors.js";
import { createContext } from "../../../workflows/context.js";
import { openDashboard } from "../../../workflows/dashboard.js";
import { line, type CliIo } from "../output.js";

export function registerDashboard(program: Command, io: CliIo): void {
  program
    .command("dashboard")
    .description("Open the local read-only dashboard in your browser")
    .option("--run <name>", "run to open (a run name, or a path to a run folder)")
    .option("--port <number>", "port to try first (default 4747)")
    .option("--no-open", "do not open the browser, only print the address")
    .action(async (options: { run?: string; port?: string; open: boolean }) => {
      const port = options.port === undefined ? undefined : Number(options.port);
      if (port !== undefined && !(Number.isInteger(port) && port >= 0 && port < 65536)) {
        throw new RebError(
          `"${options.port}" is not a port number.`,
          "Give a whole number such as 4747.",
        );
      }
      const ctx = {
        ...createContext("cli", io.env),
        dashboard: io.dashboard,
        openBrowser: io.openBrowser,
      };
      const result = await openDashboard(ctx, { run: options.run, port, open: options.open });
      line(io, `The reb dashboard is running at ${result.url}`);
      line(
        io,
        result.opened ? "It is open in your browser." : "Open that address in your browser.",
      );
      line(io, "It only shows your files; it changes nothing. Press Ctrl+C to stop it.");
    });
}
