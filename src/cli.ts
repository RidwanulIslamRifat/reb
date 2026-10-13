#!/usr/bin/env node
import { defaultIo } from "./adapters/cli/output.js";
import { buildProgram } from "./adapters/cli/program.js";
import { launchDashboard, openInBrowser } from "./dashboard/launch.js";
import { RebError } from "./domain/errors.js";

try {
  await buildProgram({
    ...defaultIo,
    dashboard: launchDashboard,
    openBrowser: openInBrowser,
  }).parseAsync(process.argv);
} catch (error) {
  if (error instanceof RebError) {
    console.error(error.format());
    process.exitCode = 1;
  } else {
    throw error;
  }
}
