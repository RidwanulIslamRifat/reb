// Deliberately wrong: domain must never import storage (SPEC 4).
import { readRun } from "../storage/runFolder.js";

export const run = readRun;
