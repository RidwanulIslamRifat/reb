#!/usr/bin/env node
import { buildProgram } from "./adapters/cli/program.js";
import { RebError } from "./domain/errors.js";

try {
  await buildProgram().parseAsync(process.argv);
} catch (error) {
  if (error instanceof RebError) {
    console.error(error.format());
    process.exitCode = 1;
  } else {
    throw error;
  }
}
